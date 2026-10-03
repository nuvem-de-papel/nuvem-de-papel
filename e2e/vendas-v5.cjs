/* E2E Vendas v5 — funil de documentos (VD-02), conversão pedido→venda com
 * VL-01..VL-03 e baixa de estoque (VD-03), cancelamento de pedido (VD-06),
 * abas Expedição e Importar da loja, EN-01 (entrega ao autorizar a NF-e),
 * fluxo completo de expedição (separar→postar→ocorrência→resolver→entregue),
 * badge de entrega atrasada e layout 390px sem rolagem horizontal.
 * Requisitos: npm run build && npm run start (:3000) + SEFAZ_MOCK=1.
 * Roda junto de: npm run e2e (executa depois de pdv-v6). */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EPOCH = Date.now();
const SKU = "SKU-E2E-V5";
const SALDO = 10;
const CNPJ_OK = "11222333000181";
const ONTEM = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function lerEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const env = lerEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const resultados = [];
function check(nome, cond, detalhe = "") {
  resultados.push({ ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"} - ${nome}${detalhe ? " | " + detalhe : ""}`);
}

async function login(page, email, senha) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

async function esperarAviso(page, trecho, timeout = 20000) {
  await page.waitForFunction(
    (t) => ((document.querySelector('[role="status"]') || {}).textContent || "").includes(t),
    trecho,
    { timeout }
  );
  return (await page.locator('[role="status"]').first().textContent()) || "";
}

async function presente(page, codigo, deve = true, timeout = 15000) {
  try {
    await page.waitForFunction(
      ([c, d]) => document.body.innerText.includes(c) === d,
      [codigo, deve],
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const t0 = new Date().toISOString();

  // emitente: a transmissão exige CNPJ de 14 dígitos (mesma receita da sefaz)
  const { data: empAntes } = await admin
    .from("tenant_company")
    .select("razao_social, cnpj, regime, endereco")
    .eq("tenant_id", TENANT)
    .maybeSingle();
  if (!empAntes || (empAntes.cnpj || "").replace(/\D/g, "").length !== 14) {
    const { error: eEmp } = await admin.from("tenant_company").upsert(
      {
        tenant_id: TENANT,
        razao_social: empAntes?.razao_social ?? "EMPRESA E2E V5 LTDA",
        cnpj: CNPJ_OK,
        regime: empAntes?.regime ?? "simples",
        endereco: empAntes?.endereco ?? { uf: "SP", cep: "01000-000" },
      },
      { onConflict: "tenant_id" }
    );
    check("S1 emitente com CNPJ de 14 digitos para transmitir", !eEmp, eEmp?.message ?? "");
  } else {
    check("S1 emitente com CNPJ de 14 digitos para transmitir", true);
  }

  // fixture: item com estoque absoluto 10 ----------------------------------
  let { data: item } = await admin
    .from("catalog_items")
    .select("id")
    .eq("sku", SKU)
    .maybeSingle();
  if (!item) {
    const { data: novo, error: eI } = await admin
      .from("catalog_items")
      .insert({ tenant_id: TENANT, sku: SKU, name: "Item E2E Vendas V5", active: true })
      .select("id")
      .single();
    if (eI) throw new Error("seed catalog_items: " + eI.message);
    item = { id: novo.id };
  }
  const { data: est0 } = await admin
    .from("item_stock")
    .select("stock_available")
    .eq("item_id", item.id)
    .maybeSingle();
  const atual = est0 ? Number(est0.stock_available) : 0;
  if (atual !== SALDO) {
    await admin.rpc("register_stock_movement", {
      p_item_id: item.id,
      p_type: "ajuste",
      p_quantity: SALDO - atual,
      p_reference_type: "manual",
      p_reference_id: null,
      p_notes: "seed E2E Vendas V5",
      p_created_by: null,
    });
  }

  // fixture: clientes -------------------------------------------------------
  const { data: custAtac, error: eC1 } = await admin
    .from("customers")
    .insert({
      tenant_id: TENANT,
      name: "Cliente Atacado V5",
      email: `e2e-v5-atac-${EPOCH}@exemplo.com`,
    })
    .select("id")
    .single();
  const { data: custComum, error: eC2 } = await admin
    .from("customers")
    .insert({
      tenant_id: TENANT,
      name: "Cliente V5 Comum",
      email: `e2e-v5-comum-${EPOCH}@exemplo.com`,
    })
    .select("id")
    .single();
  check("S2 clientes de teste criados", !!custAtac && !!custComum, eC1?.message ?? eC2?.message ?? "");
  if (!custAtac || !custComum) throw new Error("fixtures de cliente falharam");

  // fixture: pedidos --------------------------------------------------------
  async function novoPedido(extra, itens = []) {
    const { data, error } = await admin
      .from("orders")
      .insert({
        tenant_id: TENANT,
        customer_id: extra.customer_id,
        status: "processando",
        total_amount: extra.total_amount,
        channel: extra.channel ?? "varejo",
        origem: extra.origem ?? "erp",
        etapa: extra.etapa ?? null,
        frete: extra.frete ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error("seed order: " + error.message);
    for (const it of itens) {
      const { error: eIt } = await admin.from("order_items").insert({
        tenant_id: TENANT,
        order_id: data.id,
        item_id: item.id,
        sku: it.sku,
        name: it.name,
        unit_price: it.unit_price,
        quantity: it.quantity,
        total: it.total,
      });
      if (eIt) throw new Error("seed order_item: " + eIt.message);
    }
    return data.id;
  }

  const id1 = await novoPedido(
    { customer_id: custAtac.id, total_amount: 100, channel: "atacado", etapa: "pedido" },
    [{ sku: SKU, name: "Item E2E Vendas V5", unit_price: 100, quantity: 1, total: 100 }]
  ); // atacado sem CNPJ → VL-02
  const id2 = await novoPedido(
    { customer_id: custComum.id, total_amount: 50, etapa: "pedido" }
  ); // cancelamento
  const id3 = await novoPedido(
    { customer_id: custComum.id, total_amount: 30, origem: "loja" }
  ); // pedido da loja para importar
  const id4 = await novoPedido(
    {
      customer_id: custComum.id,
      total_amount: 120,
      etapa: "venda",
      frete: 15,
    },
    [{ sku: SKU, name: "Item E2E Vendas V5", unit_price: 120, quantity: 1, total: 120 }]
  ); // venda para emitir NF-e + expedição
  const id5 = await novoPedido({
    customer_id: custComum.id,
    total_amount: 80,
    etapa: "venda",
  }); // entrega com prazo vencido
  const { error: eEnt } = await admin.from("entregas").insert({
    tenant_id: TENANT,
    order_id: id5,
    status: "aguardando",
    transportadora: "Jadlog",
    prazo: ONTEM,
  });
  check("S3 pedidos e entrega atrasada criados", !eEnt, eEnt?.message ?? "");

  const pedidos = [id1, id2, id3, id4, id5];
  const COD = Object.fromEntries(pedidos.map((id) => [id, `PED-${id.slice(0, 8).toUpperCase()}`]));
  const [PED1, PED2, PED3, PED4, PED5] = pedidos.map((id) => COD[id]);

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  page.on("dialog", (d) => d.accept());

  try {
    await login(page, EMAIL_MASTER, SENHA_MASTER);
    await page.goto(BASE + "/vendas", { waitUntil: "domcontentloaded" });
    await page.getByText(PED1).first().waitFor({ timeout: 20000 });
    check("A0 pedidos de teste na aba Vendas", true, PED1);

    // ------------------------------------------------ A) abas e funil ----
    const abas = ["Vendas", "Expedição", "Importar da loja", "Compras", "Notas emitidas"];
    let abasOk = true;
    for (const a of abas) {
      if (!(await page.locator(`button[aria-label="Aba ${a}"]`).isVisible())) abasOk = false;
    }
    check("A1 cinco abas visiveis (vendas, expedicao, importar, compras, notas)", abasOk);

    const cartoes = ["Pedidos em aberto", "Vendas a faturar", "Notas emitidas", "Notas rejeitadas"];
    let cartoesOk = true;
    for (const c of cartoes) {
      if ((await page.locator(`button[aria-label="Filtro ${c}"]`).count()) !== 1) cartoesOk = false;
    }
    check("A2 funil com os 4 cartoes (VD-02)", cartoesOk);
    check(
      "A3 botao Importar da loja no topo",
      (await page.locator('button[aria-label="Importar da loja"]').count()) === 1
    );

    // ------------------------------------------- B) conversão pedido→venda --
    await page.getByRole("button", { name: `Converter em venda ${PED1}` }).click();
    const avisoCNPJ = await esperarAviso(page, "Venda no atacado exige CNPJ do cliente.");
    check("B1 atacado sem CNPJ barrado (VL-02)", avisoCNPJ.includes("Venda no atacado exige CNPJ do cliente."));

    const { data: b1 } = await admin
      .from("orders")
      .select("etapa")
      .eq("id", id1)
      .maybeSingle();
    const { data: b1s } = await admin
      .from("item_stock")
      .select("stock_available")
      .eq("item_id", item.id)
      .maybeSingle();
    check(
      "B2 falha nao mexe em etapa nem estoque",
      b1?.etapa === "pedido" && Number(b1s?.stock_available) === SALDO,
      `etapa=${b1?.etapa} estoque=${b1s?.stock_available}`
    );

    await admin.from("customers").update({ documento: "12345678000190" }).eq("id", custAtac.id);
    await page.getByRole("button", { name: `Converter em venda ${PED1}` }).click();
    const avisoConv = await esperarAviso(page, "convertido em venda");
    check("B3 com CNPJ cadastrado a conversao passa", avisoConv.includes("convertido em venda"), avisoConv.trim());

    const { data: b3 } = await admin
      .from("orders")
      .select("etapa, venda_numero, convertido_em")
      .eq("id", id1)
      .maybeSingle();
    check(
      "B4 banco: etapa venda + numero V- + convertido_em",
      b3?.etapa === "venda" && /^V-\d{4,}$/.test(b3?.venda_numero ?? "") && !!b3?.convertido_em,
      JSON.stringify(b3 ?? {})
    );
    const { data: b4s } = await admin
      .from("item_stock")
      .select("stock_available")
      .eq("item_id", item.id)
      .maybeSingle();
    const { data: b4m } = await admin
      .from("stock_movements")
      .select("id")
      .eq("movement_type", "venda")
      .eq("reference_type", "order")
      .eq("reference_id", id1)
      .eq("item_id", item.id);
    check(
      "B5 estoque baixado 10→9 com movimento do pedido",
      Number(b4s?.stock_available) === SALDO - 1 && (b4m ?? []).length === 1,
      `estoque=${b4s?.stock_available} movimentos=${(b4m ?? []).length}`
    );

    // ------------------------------------------- C) funil, busca e canais --
    await page.getByRole("button", { name: "Filtro Vendas a faturar" }).click();
    await page.getByText("Filtrando por").first().waitFor({ timeout: 10000 });
    check("C1 clicar no cartao aplica o filtro do funil", true);
    const c2ok = (await presente(page, PED1, true)) && (await presente(page, PED2, false));
    check("C2 filtro 'a faturar': venda sim, pedido nao", c2ok);
    await page.getByRole("button", { name: "Filtro Vendas a faturar" }).click();
    const c3ok = await presente(page, PED2, true);
    check("C3 segundo clique limpa o filtro", c3ok);

    await page.fill('input[aria-label="Buscar vendas"]', "Cliente Atacado V5");
    const c4ok = (await presente(page, PED1, true)) && (await presente(page, PED2, false));
    check("C4 busca por cliente filtra a lista", c4ok);
    await page.fill('input[aria-label="Buscar vendas"]', "");
    await presente(page, PED2, true, 5000);

    await page.getByRole("button", { name: "Canal Loja online" }).click();
    const c5ok = (await presente(page, PED3, true)) && (await presente(page, PED2, false));
    check("C5 chip Loja online filtra por origem loja", c5ok);
    await page.getByRole("button", { name: "Canal Todos os canais" }).click();
    await presente(page, PED2, true, 5000);

    // ------------------------------------------- D) cancelar pedido --------
    await page.getByRole("button", { name: `Cancelar pedido ${PED2}` }).click();
    await page
      .locator("tr")
      .filter({ hasText: PED2 })
      .getByText("Cancelado", { exact: true })
      .first()
      .waitFor({ timeout: 20000 });
    check("D1 pedido cancelado ganha badge Cancelado", true);
    const { data: d2 } = await admin
      .from("orders")
      .select("cancelado_em")
      .eq("id", id2)
      .maybeSingle();
    check("D2 cancelado_em gravado no banco", !!d2?.cancelado_em, String(d2?.cancelado_em ?? ""));
    check(
      "D3 linha cancelada perde o botao de conversao",
      (await page.getByRole("button", { name: `Converter em venda ${PED2}` }).count()) === 0
    );
    check(
      "D4 etapa vira hifen na linha cancelada",
      (await page.locator("tr").filter({ hasText: PED2 }).locator('span[aria-label="Etapa Pedido inexistente"]').count()) === 1
    );

    // ------------------------------------------- E) importar da loja -------
    await page.locator('button[aria-label="Importar da loja"]').click();
    await page.locator(`input[aria-label="Selecionar ${PED3}"]`).waitFor({ timeout: 10000 });
    check(
      "E1 botao do topo abre a aba Importar com o pedido marcado",
      await page.locator(`input[aria-label="Selecionar ${PED3}"]`).isChecked()
    );
    // desmarca qualquer outro pedido pendente de execucoes antigas
    const caixas = page.locator('input[aria-label^="Selecionar PED-"]');
    const nCaixas = await caixas.count();
    for (let i = 0; i < nCaixas; i++) {
      const b = caixas.nth(i);
      const al = await b.getAttribute("aria-label");
      if (al !== `Selecionar ${PED3}` && (await b.isChecked())) await b.uncheck();
    }
    await page.locator('button[aria-label="Importar pedidos"]').click();
    const avisoImp = await esperarAviso(page, "importado com numeração P-");
    check("E2 importacao gera numeracao P-", avisoImp.includes("importado com numeração P-"), avisoImp.trim());
    const { data: e3 } = await admin
      .from("orders")
      .select("etapa, pedido_numero")
      .eq("id", id3)
      .maybeSingle();
    check(
      "E3 banco: pedido_numero P- e etapa pedido",
      /^P-\d{4,}$/.test(e3?.pedido_numero ?? "") && e3?.etapa === "pedido",
      JSON.stringify(e3 ?? {})
    );
    await page.locator('button[aria-label="Aba Vendas"]').click();
    await presente(page, PED3, true);
    let row3 = "";
    for (let i = 0; i < 20; i++) {
      row3 = (await page.locator("tr").filter({ hasText: PED3 }).first().textContent()) || "";
      if (row3.includes(e3?.pedido_numero ?? "###")) break;
      await page.waitForTimeout(500);
    }
    check("E4 linha da venda mostra o numero P- importado", row3.includes(e3?.pedido_numero ?? "###"), row3.slice(0, 120));

    // ------------------------------------------- F) NF-e + expedição -------
    await page.getByRole("button", { name: `Emitir NF-e ${PED4}` }).click();
    await page.getByRole("dialog", { name: "Emissão de nota fiscal" }).waitFor({ timeout: 10000 });
    await page.getByLabel("CNPJ / CPF").fill("12.345.678/0001-90");
    await page.getByRole("button", { name: "Confirmar emissão" }).click();
    const avisoEmit = await esperarAviso(page, "pendente de transmissão");
    const numero = Number((avisoEmit.match(/NF-e (\d+) série/) || [])[1] || 0);
    check("F1 NF-e emitida e pendente de transmissao", numero > 0, avisoEmit.trim());

    await page.getByRole("button", { name: `Transmitir NF-e ${numero}` }).click();
    const avisoTx = await esperarAviso(page, "transmitida");
    check("F2 transmitir devolve recibo", avisoTx.includes("recibo"), avisoTx.trim());
    await page.getByRole("button", { name: `Consultar NF-e ${numero}` }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: `Consultar NF-e ${numero}` }).click();
    const avisoCo = await esperarAviso(page, "autorizada");
    check("F3 consultar autoriza com protocolo", avisoCo.includes("protocolo"), avisoCo.trim());

    const { data: ent4 } = await admin
      .from("entregas")
      .select("id, status, transportadora")
      .eq("order_id", id4)
      .maybeSingle();
    check(
      "F4 EN-01: autorizar a nota abre a entrega (Jadlog, aguardando)",
      ent4?.status === "aguardando" && ent4?.transportadora === "Jadlog",
      JSON.stringify(ent4 ?? {})
    );
    const { data: ev4 } = await admin
      .from("entrega_eventos")
      .select("para_status, nota")
      .eq("entrega_id", ent4?.id ?? "");
    check(
      "F5 evento de criacao da entrega gravado",
      (ev4 ?? []).some((e) => e.para_status === "aguardando" && (e.nota || "").includes("autorização")),
      JSON.stringify(ev4 ?? [])
    );

    await page.locator('button[aria-label="Aba Vendas"]').click();
    await page.getByRole("button", { name: `Expedir ${PED4}` }).waitFor({ timeout: 15000 });
    check("F6 acao da linha vira Expedir", true);
    await page.getByRole("button", { name: `Expedir ${PED4}` }).click();
    const row4 = await page.locator("tr").filter({ hasText: PED4 }).first().waitFor({ timeout: 15000 }).then(() => page.locator("tr").filter({ hasText: PED4 }).first().textContent());
    check(
      "F7 fila da Expedicao mostra NF-e e situacao A separar",
      (row4 || "").includes(`NF-e ${numero}`) && (row4 || "").includes("A separar"),
      (row4 || "").slice(0, 160)
    );

    await page.getByRole("button", { name: `Marcar como separado ${PED4}` }).click();
    await esperarAviso(page, ": separado");
    const { data: f8 } = await admin
      .from("entregas")
      .select("status")
      .eq("id", ent4?.id ?? "")
      .maybeSingle();
    check("F8 separar move para separado (EN-02)", f8?.status === "separado", `status=${f8?.status}`);

    await page.getByRole("button", { name: `Postar envio ${PED4}` }).click();
    const avisoSemRastreio = await esperarAviso(page, "Informe o código de rastreio para postar.");
    check(
      "F9 postar sem rastreio e barrado (EN-03)",
      avisoSemRastreio.includes("Informe o código de rastreio para postar.")
    );

    await page.fill(`input[aria-label="Código de rastreio ${PED4}"]`, "BR123456789");
    await page.getByRole("button", { name: `Salvar entrega ${PED4}` }).click();
    const avisoRastreio = await esperarAviso(page, "rastreio BR123456789");
    const { data: f10 } = await admin
      .from("entregas")
      .select("rastreio")
      .eq("id", ent4?.id ?? "")
      .maybeSingle();
    check(
      "F10 salvar rastreio editavel (EN-06)",
      avisoRastreio.includes("rastreio BR123456789") && f10?.rastreio === "BR123456789",
      avisoRastreio.trim()
    );

    await page.getByRole("button", { name: `Postar envio ${PED4}` }).click();
    await esperarAviso(page, "postado (em trânsito)");
    const { data: f11 } = await admin
      .from("entregas")
      .select("status, enviado_em")
      .eq("id", ent4?.id ?? "")
      .maybeSingle();
    const { data: f11ev } = await admin
      .from("entrega_eventos")
      .select("para_status")
      .eq("entrega_id", ent4?.id ?? "");
    check(
      "F11 postar vira em_transito com enviado_em e evento",
      f11?.status === "em_transito" && !!f11?.enviado_em && (f11ev ?? []).some((e) => e.para_status === "em_transito"),
      JSON.stringify({ st: f11?.status, ev: f11ev ?? [] })
    );

    await page.getByRole("button", { name: `Registrar ocorrência ${PED4}` }).click();
    await page.locator(`input[aria-label="Texto da ocorrência ${PED4}"]`).fill("endereço incorreto");
    await page.getByRole("button", { name: `Confirmar ocorrência ${PED4}` }).click();
    const avisoOcorr = await esperarAviso(page, "marcada com problema");
    const { data: f12 } = await admin
      .from("entregas")
      .select("status, observacao")
      .eq("id", ent4?.id ?? "")
      .maybeSingle();
    check(
      "F12 ocorrencia marca falhou com motivo (AV-02)",
      avisoOcorr.includes("marcada com problema") && f12?.status === "falhou" && f12?.observacao === "endereço incorreto",
      `status=${f12?.status} obs=${f12?.observacao}`
    );

    await page.getByRole("button", { name: `Resolver entrega ${PED4}` }).click();
    await esperarAviso(page, "postado (em trânsito)");
    const { data: f13 } = await admin
      .from("entregas")
      .select("status")
      .eq("id", ent4?.id ?? "")
      .maybeSingle();
    check("F13 resolver volta para em_transito", f13?.status === "em_transito", `status=${f13?.status}`);

    await page.getByRole("button", { name: `Marcar como entregue ${PED4}` }).click();
    await esperarAviso(page, ": entregue");
    const { data: f14 } = await admin
      .from("entregas")
      .select("status, entregue_em")
      .eq("id", ent4?.id ?? "")
      .maybeSingle();
    check(
      "F14 entregar conclui com entregue_em (EN-04)",
      f14?.status === "entregue" && !!f14?.entregue_em,
      `status=${f14?.status}`
    );

    // ------------------------------------------- G) entrega atrasada -------
    const row5 = page.locator("tr").filter({ hasText: PED5 }).first();
    check(
      "G1 entrega com prazo vencido mostra Atrasada",
      (await row5.getByText("Atrasada", { exact: true }).count()) > 0
    );
    await page.locator('button[aria-label="Aba Vendas"]').click();
    check(
      "G2 linha atrasada oferece Resolver entrega",
      (await page.getByRole("button", { name: `Resolver entrega ${PED5}` }).count()) > 0
    );

    // ------------------------------------------- H) 390px ------------------
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const semScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    check("H1 sem rolagem horizontal em 390px", semScroll);
    await page.setViewportSize({ width: 1280, height: 800 });
  } finally {
    // limpeza ---------------------------------------------------------------
    try {
      const { data: notas } = await admin
        .from("nfe_emissoes")
        .select("id")
        .in("order_id", pedidos);
      if (notas?.length) await admin.from("nfe_emissoes").delete().in("id", notas.map((n) => n.id));
      const { data: ents } = await admin.from("entregas").select("id").in("order_id", pedidos);
      if (ents?.length) await admin.from("entregas").delete().in("id", ents.map((e) => e.id));
      await admin.from("order_items").delete().in("order_id", pedidos);
      const { data: apagados, error: eO } = await admin.from("orders").delete().in("id", pedidos).select("id");
      check("Z1 pedidos da execucao removidos", !eO && (apagados ?? []).length === pedidos.length, eO?.message ?? "");
      await admin.from("customers").delete().in("id", [custAtac.id, custComum.id]);
      if (empAntes) {
        await admin.from("tenant_company").upsert(
          { tenant_id: TENANT, ...empAntes },
          { onConflict: "tenant_id" }
        );
      }
    } catch (e) {
      console.log("cleanup:", e && e.message);
    }
    await browser.close();
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO - " + (e?.stack ?? e));
  process.exit(1);
});
