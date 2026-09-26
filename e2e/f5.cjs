/* E2E F5 — PDV + financeiro (gate de aceite local).
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Rode tudo juntos com: npm run e2e
 * Cobre: RBAC de /pdv e /financeiro, abertura de caixa, venda pela UI com
 * comprovante, 49 vendas em massa (dinheiro/pix/débito/crédito 3x) sem
 * divergência de bate-vale, idempotência, trava de estoque, suprimento/
 * sangria pela UI, títulos do crédito com liquidação parcial e
 * sobreliquidação bloqueada, fechamento zerado e venda pós-fechamento
 * bloqueada; limpeza no fim. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const EMAIL_COMP = "e2e-comprador@nuvem-de-papel.com.br";
const SENHA_COMP = "E2e#2026Test";
const TENANT = "00000000-0000-0000-0000-000000000001";
const SKU_F5 = "SKU-E2E-F5";
const NOME_F5 = "Item E2E F5";
const PRECO = 50;
const SALDO_ALVO = 300;

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

// f3/f4 apagam o comprador no fim — o F5 recria o fixture (auth + profile).
async function garantirComprador() {
  const { data: lst } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existente = (lst?.users ?? []).find((u) => u.email?.toLowerCase() === EMAIL_COMP);
  if (existente) {
    await admin.from("profiles").upsert(
      {
        id: existente.id,
        tenant_id: TENANT,
        email: EMAIL_COMP,
        full_name: "Comprador E2E",
        role: "vendedor",
        status: "ativo",
      },
      { onConflict: "id" }
    );
    return;
  }
  const { data: criado, error } = await admin.auth.admin.createUser({
    email: EMAIL_COMP,
    password: SENHA_COMP,
    email_confirm: true,
  });
  if (error) throw new Error("fixture comprador: " + error.message);
  await admin.from("profiles").insert({
    id: criado.user.id,
    tenant_id: TENANT,
    email: EMAIL_COMP,
    full_name: "Comprador E2E",
    role: "vendedor",
    status: "ativo",
  });
}

async function esperarTexto(page, texto, timeout = 15000) {
  await page.getByText(texto, { exact: false }).first().waitFor({ timeout });
}

async function main() {
  // R) recuperacao de execucoes anteriores interrompidas -------------------
  const statePath = path.join(require("os").tmpdir(), "e2e-f5-state.json");
  let prevUi = "";
  try {
    prevUi = JSON.parse(fs.readFileSync(statePath, "utf8")).uiPedidoId ?? "";
  } catch {}
  const limpeza = ["idempotency_key.like.e2e-f5-%"];
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(prevUi)) limpeza.push(`id.eq.${prevUi}`);
  await admin.from("orders").delete().or(limpeza.join(","));

  const { data: legado } = await admin
    .from("caixa_sessions")
    .select("id")
    .eq("status", "aberto")
    .maybeSingle();
  if (legado) {
    const { data: movs } = await admin
      .from("caixa_movements")
      .select("direction, amount")
      .eq("session_id", legado.id);
    const gaveta = (movs ?? []).reduce(
      (a, m) => a + (m.direction === "in" ? Number(m.amount) : -Number(m.amount)),
      0
    );
    const { error } = await admin.rpc("pdv_close_cash", { p_counted_amount: gaveta });
    check("R1 caixa legado fechado antes de comecar", !error, error?.message ?? `sessao ${legado.id}`);
  } else {
    check("R1 sem caixa legado aberto", true);
  }

  await garantirComprador();

  const t0 = new Date().toISOString();
  const RUN = Date.now().toString(36); // escopo por execução (chaves são únicas no tenant)

  // A) RBAC anônimo -------------------------------------------------------
  const rPdv = await fetch(BASE + "/pdv", { redirect: "manual" });
  check("A1 /pdv anonimo -> 307 login", rPdv.status === 307, `status=${rPdv.status}`);
  const rFin = await fetch(BASE + "/financeiro", { redirect: "manual" });
  check("A2 /financeiro anonimo -> 307 login", rFin.status === 307, `status=${rFin.status}`);

  // seed: item controlado com preço ----------------------------------------
  let { data: item } = await admin
    .from("catalog_items")
    .select("id, active")
    .eq("sku", SKU_F5)
    .maybeSingle();
  if (!item) {
    const { data: novo, error } = await admin
      .from("catalog_items")
      .insert({ tenant_id: TENANT, sku: SKU_F5, name: NOME_F5, active: true })
      .select("id")
      .single();
    if (error) throw new Error("seed catalog_items: " + error.message);
    item = { id: novo.id, active: true };
  } else if (!item.active) {
    await admin.from("catalog_items").update({ active: true }).eq("id", item.id);
  }
  await admin.from("item_prices").upsert(
    { item_id: item.id, channel: "varejo", price: PRECO },
    { onConflict: "item_id,channel" }
  );
  const { data: est0 } = await admin
    .from("item_stock")
    .select("stock_available")
    .eq("item_id", item.id)
    .maybeSingle();
  const atual = est0 ? Number(est0.stock_available) : 0;
  await admin.rpc("register_stock_movement", {
    p_item_id: item.id,
    p_type: "ajuste",
    p_quantity: SALDO_ALVO - atual,
    p_reference_type: "manual",
    p_reference_id: null,
    p_notes: "seed E2E F5",
    p_created_by: null,
  });

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();

  // B) abertura de caixa pela UI ------------------------------------------
  await login(page, EMAIL_MASTER, SENHA_MASTER);
  await page.goto(BASE + "/pdv", { waitUntil: "domcontentloaded" });
  check("B1 master abre /pdv", (await page.textContent("body")).includes("Abrir caixa"), "form de abertura");
  await page.fill('input[aria-label="Valor de abertura"]', "100");
  await page.click('button:has-text("Abrir caixa")');
  await esperarTexto(page, "Caixa aberto");
  check("B2 caixa aberto com fundo de 100", true);

  const { data: sessao } = await admin
    .from("caixa_sessions")
    .select("id")
    .eq("status", "aberto")
    .maybeSingle();
  check("B3 existe sessao aberta no banco", !!sessao, sessao?.id ?? "");
  const sessionId = sessao.id;

  // C) venda pela UI --------------------------------------------------------
  await page.fill('input[aria-label="Buscar produto"]', SKU_F5);
  await page.click(`button[aria-label="Adicionar ${NOME_F5}"]`);
  await page.click(`button[aria-label="Somar ${NOME_F5}"]`);
  await esperarTexto(page, "R$ 100,00");
  check("C1 total da venda = 2 x preco do servidor", true, "R$ 100,00");
  await page.click('button[aria-label="Registrar venda"]');
  await esperarTexto(page, "Venda registrada");
  await esperarTexto(page, "Comprovante não fiscal");
  check("C2 venda UI registrada com comprovante", true);

  const { data: uiRows } = await admin
    .from("orders")
    .select("id, status, total_amount, payment_method, channel")
    .gte("created_at", t0)
    .order("created_at", { ascending: false })
    .limit(1);
  const uiPedido = uiRows && uiRows[0];
  check(
    "C3 pedido da UI nasce pago em dinheiro/varejo",
    !!uiPedido &&
      uiPedido.status === "pago" &&
      uiPedido.payment_method === "dinheiro" &&
      uiPedido.channel === "varejo" &&
      Number(uiPedido.total_amount) === 100,
    JSON.stringify(uiPedido)
  );
  fs.writeFileSync(statePath, JSON.stringify({ uiPedidoId: uiPedido.id }));

  // D) 49 vendas em massa ---------------------------------------------------
  const metodos = ["dinheiro", "pix", "debito", "cartao"];
  let somaVista = 0;
  let somaCredito = 0;
  let qtdTotal = 2; // UI já vendeu 2
  let vendas = 0;
  let nCredito = 0;
  for (let i = 0; i < 49; i++) {
    const metodo = metodos[i % 4];
    const parcelas = metodo === "cartao" ? 3 : 1;
    const qty = 1 + (i % 2);
    const total = PRECO * qty;
    qtdTotal += qty;
    if (metodo === "cartao") {
      somaCredito += total;
      nCredito++;
    } else somaVista += total;
    const { data, error } = await admin.rpc("pdv_register_sale", {
      p_items: [{ item_id: item.id, quantity: qty }],
      p_payment_method: metodo,
      p_channel: "varejo",
      p_installments: parcelas,
      p_customer_id: null,
      p_idempotency_key: `e2e-f5-${RUN}-${String(i).padStart(4, "0")}`,
    });
    if (error || !data?.order_id) {
      check(`D venda ${i} registrada`, false, error?.message ?? "sem order_id");
      break;
    }
    vendas++;
  }
  check("D1 49 vendas em massa registradas", vendas === 49, `vendas=${vendas}`);

  const { data: pedidos } = await admin
    .from("orders")
    .select("id, total_amount, payment_method")
    .like("idempotency_key", `e2e-f5-${RUN}-%`);
  check("D2 49 pedidos idempotentes no banco", (pedidos ?? []).length === 49, `n=${(pedidos ?? []).length}`);

  const { data: est1 } = await admin
    .from("item_stock")
    .select("stock_available")
    .eq("item_id", item.id)
    .maybeSingle();
  const esperadoStock = SALDO_ALVO - qtdTotal;
  check(
    "D3 estoque baixou exatamente a soma das vendas",
    Number(est1.stock_available) === esperadoStock,
    `disponivel=${est1.stock_available} esperado=${esperadoStock}`
  );

  const { data: titulos } = await admin
    .from("financial_titles")
    .select("id, principal_amount")
    .like("idempotency_key", `e2e-f5-${RUN}-%`);
  const somaTitulos = (titulos ?? []).reduce((a, t) => a + Number(t.principal_amount), 0);
  check(
    "D4 credito gerou 1 titulo por venda no cartao",
    (titulos ?? []).length === nCredito &&
      Math.round(somaTitulos * 100) === Math.round(somaCredito * 100),
    `titulos=${(titulos ?? []).length} (esperado ${nCredito}) soma=${somaTitulos} vs ${somaCredito}`
  );

  const { data: parcelasTit } = await admin
    .from("financial_installments")
    .select("id, principal_amount, title_id")
    .in("title_id", (titulos ?? []).map((t) => t.id));
  const somaParcelas = (parcelasTit ?? []).reduce((a, p) => a + Number(p.principal_amount), 0);
  check(
    "D5 parcelas somam exatamente o principal",
    Math.round(somaParcelas * 100) === Math.round(somaTitulos * 100),
    `${somaParcelas} vs ${somaTitulos}`
  );

  // E) idempotencia e trava de estoque -------------------------------------
  const replay = await admin.rpc("pdv_register_sale", {
    p_items: [{ item_id: item.id, quantity: 1 }],
    p_payment_method: "pix",
    p_channel: "varejo",
    p_installments: 1,
    p_customer_id: null,
    p_idempotency_key: `e2e-f5-${RUN}-0000`,
  });
  const { data: pedidosDepois } = await admin
    .from("orders")
    .select("id")
    .like("idempotency_key", `e2e-f5-${RUN}-%`);
  check(
    "E1 replay da mesma chave nao cria pedido novo",
    replay.data?.duplicate === true && (pedidosDepois ?? []).length === 49,
    `duplicate=${replay.data?.duplicate} n=${(pedidosDepois ?? []).length}`
  );

  const acima = await admin.rpc("pdv_register_sale", {
    p_items: [{ item_id: item.id, quantity: 99999 }],
    p_payment_method: "pix",
    p_channel: "varejo",
    p_installments: 1,
    p_customer_id: null,
    p_idempotency_key: `e2e-f5-${RUN}-estoque-01`,
  });
  check(
    "E2 venda acima do saldo e bloqueada sem pedido",
    !!acima.error && (acima.error.message ?? "").includes("ESTOQUE_INSUFICIENTE"),
    acima.error?.message ?? "sem erro"
  );

  // F) suprimento e sangria pela UI ----------------------------------------
  await page.fill('input[aria-label="Valor do movimento"]', "50");
  await page.fill('input[aria-label="Motivo do movimento"]', "fundo extra E2E");
  await page.click('button[aria-label="Registrar movimento"]');
  await esperarTexto(page, "Suprimento de R$ 50,00 registrado.");
  check("F1 suprimento registrado pela UI", true);

  await page.selectOption('select[aria-label="Tipo de movimento"]', "sangria");
  await page.fill('input[aria-label="Valor do movimento"]', "30");
  await page.fill('input[aria-label="Motivo do movimento"]', "deposito E2E");
  await page.click('button[aria-label="Registrar movimento"]');
  await esperarTexto(page, "Sangria de R$ 30,00 registrado.");
  check("F2 sangria registrada pela UI", true);

  // G) bate-vale: esperado = abertura + vendas + suprimento - sangria ------
  const { data: movs } = await admin
    .from("caixa_movements")
    .select("direction, amount, movement_type")
    .eq("session_id", sessionId);
  const somaMov = (movs ?? []).reduce(
    (a, m) => a + (m.direction === "in" ? Number(m.amount) : -Number(m.amount)),
    0
  );
  const esperado = 100 + 100 + somaVista + 50 - 30;
  check(
    "G1 gaveta fecha exatamente (sem divergencia)",
    somaMov === esperado,
    `gaveta=${somaMov} esperado=${esperado} (vendas vista=${somaVista})`
  );

  // H) financeiro: liquidacao parcial pela UI + sobreliquidação ------------
  await page.goto(BASE + "/financeiro", { waitUntil: "domcontentloaded" });
  await esperarTexto(page, "Contas a receber");
  check("H1 master abre /financeiro", true);

  const btnLiq = page.locator('button[aria-label^="Liquidar"]').first();
  const rotulo = (await btnLiq.getAttribute("aria-label")) ?? "";
  const mLiq = /^Liquidar (.+) parcela (\d+)$/.exec(rotulo);
  await btnLiq.click();
  await esperarTexto(page, "liquidada", 20000).catch(async () => {
    await esperarTexto(page, "parcial", 5000);
  });
  check("H2 liquidacao registrada pela UI", !!mLiq, rotulo);

  let pDepois = null;
  if (mLiq) {
    const { data: t } = await admin
      .from("financial_titles")
      .select("id")
      .eq("code", mLiq[1])
      .maybeSingle();
    if (t) {
      const { data: inst } = await admin
        .from("financial_installments")
        .select("id, principal_amount, paid_amount, status")
        .eq("title_id", t.id)
        .eq("number", Number(mLiq[2]))
        .maybeSingle();
      pDepois = inst;
    }
  }
  check(
    "H3 parcela tem pagamento registrado",
    !!pDepois && Number(pDepois.paid_amount) > 0,
    pDepois ? `pago=${pDepois.paid_amount} status=${pDepois.status}` : "parcela nao localizada"
  );

  const alvo = (parcelasTit ?? []).find(
    (p) => Number(p.principal_amount) > 0 && p.id !== pDepois?.id
  );
  if (!alvo) {
    check("H4 sobreliquidacao e bloqueada", false, "sem parcela da execucao para testar");
  } else {
    const sobre = await admin.rpc("financial_settle", {
      p_installment_id: alvo.id,
      p_amount: Number(alvo.principal_amount) + 1,
      p_method: "pix",
      p_idempotency_key: `e2e-f5-${RUN}-sobreliq`,
      p_notes: null,
    });
    check(
      "H4 sobreliquidacao e bloqueada",
      !!sobre.error &&
        ((sobre.error.message ?? "").includes("SOBRELIQUIDACAO") ||
          (sobre.error.message ?? "").includes("PARCELA_ENCERRADA")),
      sobre.error?.message ?? "sem erro"
    );
  }

  const { data: aud } = await admin
    .from("audit_log")
    .select("id")
    .eq("action", "pdv.venda")
    .eq("entity_id", uiPedido.id);
  check("H5 venda do PDV auditada", (aud ?? []).length >= 1, `n=${(aud ?? []).length}`);

  // I) RBAC por papel (contexto separado para nao derrubar a sessao master)
  const ctxComp = await browser.newContext();
  const pageC = await ctxComp.newPage();
  await login(pageC, EMAIL_COMP, SENHA_COMP);
  await pageC.goto(BASE + "/pdv", { waitUntil: "domcontentloaded" });
  const corpoVend = await pageC.textContent("body");
  check(
    "I1 vendedor abre /pdv",
    (corpoVend ?? "").includes("PDV") && !(corpoVend ?? "").includes("Acesso restrito"),
    "status via corpo"
  );
  const rFinVend = await pageC.goto(BASE + "/financeiro", { waitUntil: "domcontentloaded" });
  check("I2 vendedor le 403 em /financeiro", rFinVend.status() === 403, `status=${rFinVend.status()}`);

  await admin.from("profiles").update({ role: "fornecedor" }).eq("email", EMAIL_COMP);
  const rPdvForn = await pageC.goto(BASE + "/pdv", { waitUntil: "domcontentloaded" });
  check("I3 papel nao-operacional le 403 em /pdv", rPdvForn.status() === 403, `status=${rPdvForn.status()}`);
  await admin.from("profiles").update({ role: "vendedor" }).eq("email", EMAIL_COMP);
  await ctxComp.close();

  // J) fechamento com bate-vale --------------------------------------------
  await page.goto(BASE + "/pdv", { waitUntil: "domcontentloaded" });
  await page.fill('input[aria-label="Valor da contagem"]', String(somaMov));
  await page.click('button[aria-label="Fechar caixa"]');
  await esperarTexto(page, "Bate-vale zerado");
  check("J1 fechamento com diferenca zero", true);

  const { data: fechada } = await admin
    .from("caixa_sessions")
    .select("status, expected_amount, difference_amount")
    .eq("id", sessionId)
    .maybeSingle();
  check(
    "J2 sessao fechada com esperado = contado",
    fechada.status === "fechado" &&
      Number(fechada.expected_amount) === somaMov &&
      Number(fechada.difference_amount) === 0,
    JSON.stringify(fechada)
  );

  const posFechamento = await admin.rpc("pdv_register_sale", {
    p_items: [{ item_id: item.id, quantity: 1 }],
    p_payment_method: "pix",
    p_channel: "varejo",
    p_installments: 1,
    p_customer_id: null,
    p_idempotency_key: `e2e-f5-${RUN}-pos-fechamento`,
  });
  check(
    "J3 venda apos fechar o caixa e bloqueada",
    !!posFechamento.error && (posFechamento.error.message ?? "").includes("CAIXA_FECHADO"),
    posFechamento.error?.message ?? "sem erro"
  );

  // K) limpeza ---------------------------------------------------------------
  await admin.from("orders").delete().or(`id.eq.${uiPedido.id},idempotency_key.like.e2e-f5-%`);
  const { data: restos } = await admin
    .from("orders")
    .select("id")
    .or(`id.eq.${uiPedido.id},idempotency_key.like.e2e-f5-%`);
  const { data: estFim } = await admin
    .from("item_stock")
    .select("stock_available")
    .eq("item_id", item.id)
    .maybeSingle();
  if (Number(estFim.stock_available) !== 0) {
    await admin.rpc("register_stock_movement", {
      p_item_id: item.id,
      p_type: "ajuste",
      p_quantity: -Number(estFim.stock_available),
      p_reference_type: "manual",
      p_reference_id: null,
      p_notes: "limpeza E2E F5",
      p_created_by: null,
    });
  }
  await admin.from("catalog_items").update({ active: false }).eq("id", item.id);
  const { data: lstU } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uCompFim = (lstU?.users ?? []).find((u) => u.email?.toLowerCase() === EMAIL_COMP);
  if (uCompFim) await admin.auth.admin.deleteUser(uCompFim.id);
  const { data: lstDepois } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const compRestou = (lstDepois?.users ?? []).some(
    (u) => u.email?.toLowerCase() === EMAIL_COMP
  );
  const { data: estFinal } = await admin
    .from("item_stock")
    .select("stock_available")
    .eq("item_id", item.id)
    .maybeSingle();
  check(
    "K1 limpeza: pedidos removidos, item oculto, saldo zerado, comprador removido",
    (restos ?? []).length === 0 && Number(estFinal.stock_available) === 0 && !compRestou,
    `pedidos=${(restos ?? []).length} saldo=${estFinal.stock_available} compradorRestou=${compRestou}`
  );

  await browser.close();
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(2);
});
