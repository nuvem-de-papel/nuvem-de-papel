/* E2E Compras v1 — console de compras (PC-01..07, NE-01..09, RC-01..07,
 * NI-01..04): editor de pedido com origem travada, contrato do form rápido f6,
 * distribuição DF-e (sincronizar, vincular com/sem divergência, aceitar,
 * recusar, desconhecer, entrada direta), importação com DI e NF-e de entrada
 * 3102, transporte, conferência com diferença, título a pagar, atraso, busca
 * e layout 390px.
 * Requisitos: npm run build && npm run start (:3000) + SEFAZ_MOCK=1.
 * Roda junto de: npm run e2e (executa depois de vendas-v5). */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EPOCH = Date.now();
const SKU = "SKU-E2E-CMP";
const ITEM = "Item E2E Compras V1";
const CNPJ_OK = "11222333000181"; // emitente (tenant_company)
const CNPJ_A = "55444333000177"; // fornecedor nacional com CNPJ
const CNPJ_NOTA = "99888777000155"; // emitente das notas sem pedido
const EMAIL_A = `e2e-compras-${EPOCH}@forn.example.com`;
const NOME_A = "Forn E2E Compras A";
const NOME_B = "Forn E2E Compras B";
const NOME_C = "Forn E2E Compras Import";
const NOME_NOTA = "Forn E2E Nota Direta";
const NOMES = [NOME_A, NOME_B, NOME_C, NOME_NOTA];
const DI = "DI-E2E-0001";
// atraso (RC-02) compara a previsao com o "hoje" LOCAL do servidor — usar UTC
// aqui quebraria quando o fuso do cliente estiver atrasado em relacao ao dia UTC
const ONTEM = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

// notas da distribuição: 700001 confere, 700002/700003 divergem, 700004/700005
// têm emitente sem fornecedor (desconhecer / entrada direta)
const NOTAS_SEED = [
  { numero: "700001", cnpj: CNPJ_A, nome: NOME_A, uf: "SP", valor: 200, qtd: 10, custo: 20 },
  { numero: "700002", cnpj: CNPJ_A, nome: NOME_A, uf: "SP", valor: 160, qtd: 8, custo: 20 },
  { numero: "700003", cnpj: CNPJ_A, nome: NOME_A, uf: "SP", valor: 990, qtd: 10, custo: 99 },
  { numero: "700004", cnpj: CNPJ_NOTA, nome: NOME_NOTA, uf: "RJ", valor: 150, qtd: 5, custo: 30 },
  { numero: "700005", cnpj: CNPJ_NOTA, nome: NOME_NOTA, uf: "RJ", valor: 120, qtd: 4, custo: 30 },
];
const DEMO = ["900001", "900002"]; // criadas pela sincronização (removidas antes)
const NUMEROS_NOTAS = [...NOTAS_SEED.map((n) => n.numero), ...DEMO];

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

// count() nao espera: o rotulo dos botões de acao (e os formularios rapidos)
// so aparece quando a transicao do React termina — entao confirmamos que cada
// seletor casa com exatamente um elemento, dando tempo para o DOM estabilizar
async function todosUnicos(page, seletores, timeout = 15000) {
  const locs = seletores.map((s) => (typeof s === "string" ? page.locator(s) : s));
  const fim = Date.now() + timeout;
  let ns = [];
  do {
    ns = await Promise.all(locs.map((l) => l.count()));
    if (ns.every((n) => n === 1)) return true;
    await new Promise((r) => setTimeout(r, 250));
  } while (Date.now() < fim);
  return false;
}

// heading "Pedidos (N)" da aba Compras (presente só nela)
function qtdNoTexto(texto) {
  const m = /\((\d+)\)/.exec(texto || "");
  return m ? Number(m[1]) : -1;
}
async function qtdPedidos(page) {
  const h = page.locator("h2").filter({ hasText: /^Pedidos \(/ });
  if ((await h.count()) === 0) return -1;
  return qtdNoTexto(await h.first().textContent());
}
async function esperarPedidos(page, alvo, minimo = false) {
  await page.waitForFunction(
    ([n, mn]) => {
      const h = [...document.querySelectorAll("h2")].find((e) =>
        (e.textContent || "").trim().startsWith("Pedidos (")
      );
      if (!h) return false;
      const m = /\((\d+)\)/.exec(h.textContent || "");
      const v = m ? Number(m[1]) : -1;
      return mn ? v >= n : v === n;
    },
    [alvo, minimo],
    { timeout: 25000 }
  );
}

function linha(page, codigo) {
  return page.locator("tr").filter({ hasText: codigo }).first();
}

async function ultimoCodigo(fornId) {
  const { data } = await admin
    .from("purchase_orders")
    .select("code")
    .eq("tenant_id", TENANT)
    .eq("supplier_id", fornId)
    .order("created_at", { ascending: true });
  const l = (data ?? []).map((r) => r.code);
  return l.length ? l[l.length - 1] : null;
}

async function lerEstoque(itemId) {
  const { data } = await admin
    .from("item_stock")
    .select("stock_available")
    .eq("item_id", itemId)
    .maybeSingle();
  return data;
}
async function ajustarEstoque(itemId, alvo, nota) {
  const atual = await lerEstoque(itemId);
  const diff = alvo - Number(atual?.stock_available ?? 0);
  // sem linha em item_stock o item e "ilimitado": o registro de um ajuste de 0
  // e o que cria a linha (e o recebimento so passa a contar estoque depois)
  if (atual && diff === 0) return;
  const { error } = await admin.rpc("register_stock_movement", {
    p_item_id: itemId,
    p_type: "ajuste",
    p_quantity: diff,
    p_reference_type: "manual",
    p_reference_id: null,
    p_notes: nota,
    p_created_by: null,
  });
  if (error) throw new Error(nota + ": " + error.message);
}

// remove fornecedores + POs + notas + títulos desta execucao (e de runs
// interrompidas): tudo deriva dos nomes fixos dos fornecedores E2E.
async function limparCompras() {
  const { data: fornec } = await admin
    .from("suppliers")
    .select("id")
    .eq("tenant_id", TENANT)
    .in("name", NOMES);
  const fids = (fornec ?? []).map((f) => f.id);
  let poIds = [];
  if (fids.length) {
    const { data: pos } = await admin
      .from("purchase_orders")
      .select("id")
      .eq("tenant_id", TENANT)
      .in("supplier_id", fids);
    poIds = (pos ?? []).map((p) => p.id);
  }
  if (poIds.length) {
    const { data: recs } = await admin
      .from("purchase_receipts")
      .select("id")
      .eq("tenant_id", TENANT)
      .in("purchase_order_id", poIds);
    const recIds = (recs ?? []).map((r) => r.id);
    if (recIds.length) {
      const { data: titulos } = await admin
        .from("financial_titles")
        .select("id")
        .eq("tenant_id", TENANT)
        .eq("source_type", "purchase_receipt")
        .in("source_id", recIds);
      for (const t of titulos ?? []) {
        await admin.from("financial_installments").delete().eq("title_id", t.id);
        await admin.from("financial_titles").delete().eq("id", t.id);
      }
      await admin.from("purchase_receipt_items").delete().in("receipt_id", recIds);
      await admin.from("purchase_receipts").delete().in("id", recIds);
    }
    await admin
      .from("email_messages")
      .delete()
      .eq("related_entity", "purchase_orders")
      .in("related_id", poIds);
    await admin.from("purchase_order_items").delete().in("purchase_order_id", poIds);
    await admin.from("purchase_orders").delete().in("id", poIds);
  }
  if (fids.length) await admin.from("suppliers").delete().in("id", fids);
  await admin
    .from("nfe_recebidas")
    .delete()
    .eq("tenant_id", TENANT)
    .in("numero", NUMEROS_NOTAS);
  return { fornecedores: fids.length, pedidos: poIds.length };
}

function chaveDe(numero) {
  const n = Number(numero);
  const num9 = String(n).padStart(9, "0");
  const cNf = String((n * 7919) % 100000000).padStart(8, "0");
  return `3526101122233300018155001${num9}1${cNf}0`;
}

async function main() {
  // ------------------------------------------------------------- setup -----
  const limpeza = await limparCompras();
  check(
    "S1 execucoes anteriores limpas",
    limpeza.pedidos >= 0,
    `fornecedores=${limpeza.fornecedores} pedidos=${limpeza.pedidos}`
  );

  // emitente: a emissao da NF-e de entrada exige CNPJ de 14 digitos
  const { data: empAntes } = await admin
    .from("tenant_company")
    .select("razao_social, cnpj, regime, endereco")
    .eq("tenant_id", TENANT)
    .maybeSingle();
  if (!empAntes || (empAntes.cnpj || "").replace(/\D/g, "").length !== 14) {
    const { error: eEmp } = await admin.from("tenant_company").upsert(
      {
        tenant_id: TENANT,
        razao_social: empAntes?.razao_social ?? "EMPRESA E2E COMPRAS LTDA",
        cnpj: CNPJ_OK,
        regime: empAntes?.regime ?? "simples",
        endereco: empAntes?.endereco ?? { uf: "SP", cep: "01000-000" },
      },
      { onConflict: "tenant_id" }
    );
    check("S2 emitente com CNPJ de 14 digitos para emitir a 3102", !eEmp, eEmp?.message ?? "");
  } else {
    check("S2 emitente com CNPJ de 14 digitos para emitir a 3102", true);
  }

  // fixture: item do catalogo (estoque em 0 antes e depois)
  let { data: item } = await admin
    .from("catalog_items")
    .select("id")
    .eq("sku", SKU)
    .maybeSingle();
  if (!item) {
    const { data: novo, error: eI } = await admin
      .from("catalog_items")
      .insert({ tenant_id: TENANT, sku: SKU, name: ITEM, active: true })
      .select("id")
      .single();
    if (eI) throw new Error("seed catalog_items: " + eI.message);
    item = { id: novo.id };
  }
  await ajustarEstoque(item.id, 0, "seed E2E Compras V1");

  // fixture: fornecedores (A com CNPJ+e-mail, B sem CNPJ/sem e-mail, C import)
  const { data: fa, error: eFa } = await admin
    .from("suppliers")
    .insert({
      tenant_id: TENANT,
      name: NOME_A,
      cnpj: CNPJ_A,
      contact_email: EMAIL_A,
      uf: "SP",
    })
    .select("id")
    .single();
  const { data: fb, error: eFb } = await admin
    .from("suppliers")
    .insert({ tenant_id: TENANT, name: NOME_B })
    .select("id")
    .single();
  const { data: fc, error: eFc } = await admin
    .from("suppliers")
    .insert({ tenant_id: TENANT, name: NOME_C, pais: "Argentina" })
    .select("id")
    .single();
  check(
    "S3 tres fornecedores criados (CNPJ+e-mail, sem CNPJ, importador)",
    !!fa && !!fb && !!fc,
    eFa?.message ?? eFb?.message ?? eFc?.message ?? ""
  );
  if (!fa || !fb || !fc) throw new Error("fixtures de fornecedor falharam");

  // fixture: notas da distribuição DF-e
  const agora = Date.now();
  const { error: eNfe } = await admin.from("nfe_recebidas").insert(
    NOTAS_SEED.map((n, i) => ({
      tenant_id: TENANT,
      chave: chaveDe(n.numero),
      numero: n.numero,
      serie: "1",
      emitente_cnpj: n.cnpj,
      emitente_nome: n.nome,
      emitente_uf: n.uf,
      emitida_em: new Date(agora - (i + 1) * 3600000).toISOString(),
      valor_total: n.valor,
      manifestacao: "pendente",
      itens: [{ codigo: SKU, descricao: ITEM, qtd: n.qtd, custo: n.custo }],
    }))
  );
  check("S4 cinco notas de entrada seedadas na distribuicao", !eNfe, eNfe?.message ?? "");

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  page.on("dialog", (d) => d.accept());

  let PC1 = null;
  let PC2 = null;
  let PC3 = null;
  let PC4 = null;
  let PC5 = null;

  try {
    await login(page, EMAIL_MASTER, SENHA_MASTER);
    await page.goto(BASE + "/compras", { waitUntil: "domcontentloaded" });
    await page.locator('button[aria-label="Aba Compras"]').waitFor({ timeout: 20000 });
    check("A0 console de compras abre para o admin", true);

    // ------------------------------------------------------ A) estrutura ---
    const abas = ["Compras", "Recebimento", "Notas recebidas"];
    check(
      "A1 tres abas com aria-label unico",
      await todosUnicos(page, abas.map((a) => `button[aria-label="Aba ${a}"]`))
    );

    const funis = ["Aguardando nota", "A caminho", "A conferir", "Com problema", "A pagar"];
    check(
      "A2 funil com os 5 cartoes exclusivos",
      await todosUnicos(page, funis.map((f) => `button[aria-label="Filtro ${f}"]`))
    );

    const txtPagar = (await page.locator('button[aria-label="Filtro A pagar"]').textContent()) || "";
    check("A3 cartao A pagar exibe brl(totalAPagar)", /R\$\s[\d.,]+/.test(txtPagar), txtPagar.trim());

    const origens = ["Todas as origens", "Nacional", "Importação"];
    check(
      "A4 chips de origem (todas/nacional/importacao)",
      await todosUnicos(page, origens.map((o) => `button[aria-label="Origem ${o}"]`))
    );

    check(
      "A5 busca com aria-label unico e heading Pedidos (",
      await todosUnicos(page, ['input[aria-label="Buscar compras"]', 'h2:has-text("Pedidos ")'])
    );

    check(
      "A6 botao Novo pedido de compra unico",
      await todosUnicos(page, ['button[aria-label="Novo pedido de compra"]'])
    );

    // --------------------------------------------- B) editor novo (PC-01+) --
    await page.locator('button[aria-label="Novo pedido de compra"]').click();
    await page.locator('div[aria-label="Etapa grande Pedido de compra"]').waitFor({ timeout: 10000 });
    check(
      "B1 editor abre com as 4 etapas grandes",
      (await page.locator('div[aria-label^="Etapa grande "]').count()) === 4
    );

    await page.locator('button[aria-label="Salvar pedido de compra"]').click();
    const avisoForn = await esperarAviso(page, "Selecione o fornecedor.");
    check("B2 salvar sem fornecedor e barrado", avisoForn.includes("Selecione o fornecedor."));

    await page.locator('select[aria-label="Fornecedor no editor"]').selectOption(fb.id);
    await page.locator('select[aria-label="Produto da linha 1"]').selectOption(item.id);
    await page.locator('input[aria-label="Quantidade da linha 1"]').fill("10");
    await page.locator('input[aria-label="Custo da linha 1"]').fill("20");
    await page.locator('button[aria-label="Salvar pedido de compra"]').click();
    const avisoPC02 = await esperarAviso(page, "Fornecedor nacional precisa de CNPJ");
    check(
      "B3 PC-02: nacional sem CNPJ nao salva",
      avisoPC02.includes("Fornecedor nacional precisa de CNPJ"),
      avisoPC02.trim()
    );

    await page.locator('select[aria-label="Fornecedor no editor"]').selectOption(fa.id);
    await page.locator('button[aria-label="Salvar pedido de compra"]').click();
    const avisoNovo1 = await esperarAviso(page, "criado.");
    PC1 = (avisoNovo1.match(/PC-[0-9A-Fa-f]{8}/) || [])[0] || null;
    check("B4 novo pedido salvo devolve o codigo PC-", !!PC1, avisoNovo1.trim());

    const travado =
      (await page.locator('button[aria-label="Origem nacional"]').isDisabled()) &&
      (await page.locator('button[aria-label="Origem importacao"]').isDisabled());
    check("B5 PC-01: origem travada depois de salvo", travado);

    // so da para ler o cabecalho da tabela com pelo menos um pedido na lista
    await page.locator("th").first().waitFor({ timeout: 10000 });
    const ths = await page.locator("th").allTextContents();
    check(
      "B9 tabela com as 7 colunas (pedido..acao)",
      ["Pedido", "Fornecedor", "Origem", "Etapa", "Custo total", "Nota / transporte", "Ação"].every(
        (h) => ths.includes(h)
      ),
      ths.join(" | ").slice(0, 140)
    );

    const { data: b6 } = await admin
      .from("purchase_orders")
      .select("id, origem, tipo, total")
      .eq("code", PC1)
      .maybeSingle();
    const { data: b6t } = await admin
      .from("compra_transporte")
      .select("status")
      .eq("purchase_order_id", b6?.id ?? "")
      .maybeSingle();
    check(
      "B6 banco: origem nacional, total 200 e transporte aguardando (PC-03)",
      b6?.origem === "nacional" &&
        b6?.tipo === "pedido" &&
        Number(b6?.total) === 200 &&
        b6t?.status === "aguardando",
      JSON.stringify({ po: b6 ?? null, transp: b6t ?? null })
    );

    await page.locator('button[aria-label="Enviar pedido ao fornecedor"]').click();
    const avisoEnv = await esperarAviso(page, "enviado para");
    check(
      "B7 PC-07: enviar ao fornecedor com e-mail",
      avisoEnv.includes(`Pedido ${PC1} enviado para ${EMAIL_A}`),
      avisoEnv.trim()
    );
    const { data: b7 } = await admin
      .from("compra_envios")
      .select("para")
      .eq("purchase_order_id", b6.id);
    check(
      "B8 banco: envio registrado (compra_envios)",
      (b7 ?? []).length === 1 && b7[0].para === EMAIL_A,
      JSON.stringify(b7 ?? [])
    );
    await page.locator('button[aria-label="Fechar editor"]').click();

    // ------------------------------------------------- C) form rápido (f6) --
    check(
      "C1 form rapido de fornecedor do contrato f6 visivel",
      await todosUnicos(page, [
        'input[placeholder="Nome do fornecedor"]',
        'input[placeholder="E-mail do usuário fornecedor (opcional)"]',
        'button:has-text("Criar fornecedor")',
      ])
    );

    check(
      "C2 form rapido de pedido do contrato f6 visivel",
      await todosUnicos(page, [
        'select[aria-label="Fornecedor do pedido"]',
        'select[aria-label="Item 1"]',
        'input[aria-label="Quantidade 1"]',
        'input[aria-label="Custo unitário 1"]',
        'button:has-text("Criar pedido de compra")',
      ])
    );

    const antes2 = await qtdPedidos(page);
    await page.locator('select[aria-label="Fornecedor do pedido"]').selectOption(fb.id);
    await page.locator('select[aria-label="Item 1"]').selectOption(item.id);
    await page.locator('input[aria-label="Quantidade 1"]').fill("1");
    await page.locator('input[aria-label="Custo unitário 1"]').fill("5");
    await page.locator('button:has-text("Criar pedido de compra")').click();
    await esperarPedidos(page, antes2 + 1);
    PC2 = await ultimoCodigo(fb.id);
    check(
      "C3 form rapido cria pedido sem exigir CNPJ (fora do PC-02)",
      !!PC2 && PC2 !== PC1,
      `${antes2} -> ${await qtdPedidos(page)} | ${PC2}`
    );

    // PC-07 sem e-mail: abre pelo atalho "Atualizar rastreio" da aba Recebimento
    await page.locator('button[aria-label="Aba Recebimento"]').click();
    await linha(page, PC2).getByRole("button", { name: "Atualizar rastreio" }).click();
    await page.locator('button[aria-label="Enviar pedido ao fornecedor"]').waitFor({ timeout: 10000 });
    await page.locator('button[aria-label="Enviar pedido ao fornecedor"]').click();
    const avisoSemEmail = await esperarAviso(page, "não tem e-mail válido");
    check(
      "C4 PC-07: sem e-mail no fornecedor a acao e barrada",
      avisoSemEmail.includes("O fornecedor não tem e-mail válido"),
      avisoSemEmail.trim()
    );
    const { data: c4 } = await admin
      .from("compra_envios")
      .select("id")
      .eq("purchase_order_id", (await admin.from("purchase_orders").select("id").eq("code", PC2).maybeSingle()).data?.id ?? "");
    check("C5 banco: erro nao registra envio", (c4 ?? []).length === 0, `${(c4 ?? []).length}`);
    await page.locator('button[aria-label="Fechar editor"]').click();

    // PC3 e PC4 (fornecedor A) vao receber as notas divergentes
    await page.locator('button[aria-label="Aba Compras"]').click();
    const antes3 = await qtdPedidos(page);
    await page.locator('select[aria-label="Fornecedor do pedido"]').selectOption(fa.id);
    await page.locator('select[aria-label="Item 1"]').selectOption(item.id);
    await page.locator('input[aria-label="Quantidade 1"]').fill("10");
    await page.locator('input[aria-label="Custo unitário 1"]').fill("20");
    await page.locator('button:has-text("Criar pedido de compra")').click();
    await esperarPedidos(page, antes3 + 1);
    PC3 = await ultimoCodigo(fa.id);

    const antes4 = await qtdPedidos(page);
    await page.locator('select[aria-label="Fornecedor do pedido"]').selectOption(fa.id);
    await page.locator('select[aria-label="Item 1"]').selectOption(item.id);
    await page.locator('input[aria-label="Quantidade 1"]').fill("10");
    await page.locator('input[aria-label="Custo unitário 1"]').fill("20");
    await page.locator('button:has-text("Criar pedido de compra")').click();
    await esperarPedidos(page, antes4 + 1);
    PC4 = await ultimoCodigo(fa.id);
    check(
      "C6 pedidos de teste PC3/PC4 criados pelo form rapido",
      !!PC3 && !!PC4 && PC3 !== PC4 && PC3 !== PC1 && PC4 !== PC1,
      `${PC1} ${PC2} ${PC3} ${PC4}`
    );

    // ----------------------------------------------- D) notas recebidas -----
    await page.locator('button[aria-label="Aba Notas recebidas"]').click();
    await page.locator('button[aria-label="Sincronizar notas"]').waitFor({ timeout: 10000 });
    const notasFiltros = ["A tratar", "Tratadas", "Todas"];
    let notasFiltrosOk = true;
    for (const f of notasFiltros) {
      if ((await page.locator(`button[aria-label="Notas ${f}"]`).count()) !== 1) notasFiltrosOk = false;
    }
    check("D1 filtros da aba Notas (a tratar/tratadas/todas)", notasFiltrosOk);
    check(
      "D2 botao Sincronizar notas unico",
      (await page.locator('button[aria-label="Sincronizar notas"]').count()) === 1
    );

    await page.locator('button[aria-label="Sincronizar notas"]').click();
    const avisoSync = await esperarAviso(page, "nota(s) nova(s)");
    check(
      "D3 NE-01: sincronizar traz 2 notas da distribuicao",
      avisoSync.includes("2 nota(s) nova(s) na distribuição DF-e."),
      avisoSync.trim()
    );
    const { data: d3 } = await admin
      .from("nfe_recebidas")
      .select("numero")
      .eq("tenant_id", TENANT)
      .in("numero", DEMO);
    check("D4 banco: notas 900001/900002 persistidas", (d3 ?? []).length === 2, `${(d3 ?? []).length}`);

    check(
      "D5 NE-04: preview compara XML x pedido antes do vinculo",
      (await page.getByText("confere com o pedido").count()) >= 1
    );

    // NE-03/NE-04: o card sai de "a tratar" sozinho quando o vinculo passa —
    // e o aviso novo substitui o anterior, entao o texto vem depois disso
    async function vincular(numero, alvoCodigo) {
      await page
        .locator(`select[aria-label="Pedido para vincular a nota ${numero}"]`)
        .selectOption({ label: `${alvoCodigo} — ${NOME_A}` });
      await page.locator(`button[aria-label="Vincular nota ${numero} ao pedido"]`).click();
      const saiu = await presente(page, `NF-e ${numero}`, false);
      const txt =
        (await page
          .locator('[role="status"]')
          .first()
          .textContent({ timeout: 10000 })
          .catch(() => "")) || "";
      return { saiu, txt };
    }

    const v1 = await vincular("700001", PC1);
    check(
      "D6 vincular nota confere = card sai e aviso sem divergencia",
      v1.saiu && v1.txt.includes("Nota vinculada — comparação sem divergências."),
      v1.txt.trim()
    );

    const { data: n1 } = await admin
      .from("notas_entrada")
      .select("status, tipo, cfop, divergencias, nfe_recebida_id")
      .eq("purchase_order_id", (await admin.from("purchase_orders").select("id").eq("code", PC1).maybeSingle()).data?.id ?? "");
    const { data: r1 } = await admin
      .from("nfe_recebidas")
      .select("manifestacao, purchase_order_id")
      .eq("numero", "700001")
      .maybeSingle();
    const { data: t1 } = await admin
      .from("compra_transporte")
      .select("status")
      .eq(
        "purchase_order_id",
        (await admin.from("purchase_orders").select("id").eq("code", PC1).maybeSingle()).data?.id ?? ""
      )
      .maybeSingle();
    check(
      "D7 banco: nota ok + CFOP 1102 + ciencia + transporte em transito (NE-08)",
      n1?.length === 1 &&
        n1[0].status === "ok" &&
        n1[0].tipo === "fornecedor" &&
        n1[0].cfop === "1102" &&
        n1[0].divergencias.length === 0 &&
        !!n1[0].nfe_recebida_id &&
        r1?.manifestacao === "ciencia" &&
        !!r1?.purchase_order_id &&
        t1?.status === "transito",
      JSON.stringify({ nota: n1?.[0] ?? null, nfe: r1 ?? null, transp: t1 ?? null })
    );

    // NE-04: duas notas divergentes (quantidade e custo)
    const v2 = await vincular("700002", PC3);
    check(
      "D8 vincular nota com quantidade diferente gera 1 divergencia",
      v2.saiu && v2.txt.includes("Nota vinculada com 1 divergência(s) — revise no editor."),
      v2.txt.trim()
    );

    const v3 = await vincular("700003", PC4);
    check(
      "D9 vincular nota com custo diferente gera 1 divergencia",
      v3.saiu && v3.txt.includes("Nota vinculada com 1 divergência(s) — revise no editor."),
      v3.txt.trim()
    );

    // NE-05: aceitar a divergencia do PC3
    await page.locator('button[aria-label="Aba Compras"]').click();
    await linha(page, PC3).getByRole("button", { name: "Resolver divergência" }).click();
    const alertaLoc = page.locator('[role="alert"]').filter({ hasText: "divergente do pedido" }).first();
    await alertaLoc.waitFor({ timeout: 10000 });
    const alerta = (await alertaLoc.textContent()) || "";
    check(
      "D10 editor abre com role=alert listando a divergencia",
      alerta.includes("Nota 700002 divergente do pedido") &&
        alerta.includes("pedido 10 un., nota 8 un."),
      alerta.trim().slice(0, 160)
    );

    await page.locator('button[aria-label="Aceitar assim"]').click();
    const avisoAceite = await esperarAviso(page, "Divergência aceita");
    check(
      "D11 aceitar a divergencia marca a nota como OK",
      avisoAceite.includes("Divergência aceita — nota marcada como OK."),
      avisoAceite.trim()
    );
    const idPo = async (codigo) =>
      (await admin.from("purchase_orders").select("id").eq("code", codigo).maybeSingle()).data?.id ?? "";
    const { data: d11 } = await admin
      .from("notas_entrada")
      .select("status, divergencias, aceita_com")
      .eq("purchase_order_id", await idPo(PC3))
      .maybeSingle();
    check(
      "D12 banco: status ok + divergencia aceita_com",
      d11?.status === "ok" &&
        d11?.divergencias?.length === 1 &&
        (d11?.aceita_com ?? []).length === 1,
      JSON.stringify(d11 ?? {})
    );

    // NE-05: recusar a nota do PC4 (desconhecimento na SEFAZ)
    await linha(page, PC4).getByRole("button", { name: "Resolver divergência" }).click();
    await page.locator('button[aria-label="Recusar nota"]').waitFor({ timeout: 10000 });
    await page.locator('button[aria-label="Recusar nota"]').click();
    const avisoRecusa = await esperarAviso(page, "Nota recusada");
    check(
      "D13 recusar a nota desvincula e volta para aguardando nota",
      avisoRecusa.includes("Nota recusada — a compra voltou para 'aguardando nota'."),
      avisoRecusa.trim()
    );
    const { data: d13 } = await admin
      .from("notas_entrada")
      .select("id")
      .eq("purchase_order_id", await idPo(PC4));
    const { data: d13n } = await admin
      .from("nfe_recebidas")
      .select("manifestacao, purchase_order_id")
      .eq("numero", "700003")
      .maybeSingle();
    check(
      "D14 banco: nota removida e nfe desconhecida/desvinculada",
      (d13 ?? []).length === 0 &&
        d13n?.manifestacao === "desconhecida" &&
        !d13n?.purchase_order_id,
      JSON.stringify({ ne: d13 ?? [], nfe: d13n ?? null })
    );

    // NE-07: desconhecer uma nota sem pedido
    await page.locator('button[aria-label="Aba Notas recebidas"]').click();
    await page.locator('button[aria-label="Desconhecer nota 700004"]').waitFor({ timeout: 10000 });
    await page.locator('button[aria-label="Desconhecer nota 700004"]').click();
    const avisoDesc = await esperarAviso(page, "Nota desconhecida");
    check(
      "D15 NE-07: desconhecer retira a nota das pendencias",
      avisoDesc.includes("Nota desconhecida — não aparece mais como pendência."),
      avisoDesc.trim()
    );
    const { data: d15 } = await admin
      .from("nfe_recebidas")
      .select("manifestacao")
      .eq("numero", "700004")
      .maybeSingle();
    check("D16 banco: manifestacao desconhecida", d15?.manifestacao === "desconhecida", d15?.manifestacao);

    // NE-06: entrada direta (cria EN-#### e fornecedor automatico)
    await page.locator('button[aria-label="Criar entrada direta da nota 700005"]').click();
    const avisoED = await esperarAviso(page, "Entrada direta");
    const codigoEN = (avisoED.match(/EN-[0-9A-Fa-f]{4}/) || [])[0] || null;
    check(
      "D17 NE-06: entrada direta cria EN- com a nota vinculada",
      !!codigoEN && avisoED.includes(`Entrada direta ${codigoEN} criada com a nota vinculada.`),
      avisoED.trim()
    );
    const { data: d17 } = await admin
      .from("purchase_orders")
      .select("id, code, origem, tipo")
      .eq("code", codigoEN ?? "")
      .maybeSingle();
    const { data: d17t } = await admin
      .from("compra_transporte")
      .select("status")
      .eq("purchase_order_id", d17?.id ?? "")
      .maybeSingle();
    const { data: d17n } = await admin
      .from("notas_entrada")
      .select("tipo, status, cfop, divergencias")
      .eq("purchase_order_id", d17?.id ?? "")
      .maybeSingle();
    const { data: d17f } = await admin
      .from("suppliers")
      .select("id, cnpj")
      .eq("tenant_id", TENANT)
      .eq("name", NOME_NOTA)
      .maybeSingle();
    const { data: d17nfe } = await admin
      .from("nfe_recebidas")
      .select("manifestacao")
      .eq("numero", "700005")
      .maybeSingle();
    check(
      "D18 banco: EN- entrada_direta + transporte chegou + fornecedor auto-criado",
      !!d17 && d17.tipo === "entrada_direta" && d17.origem === "nacional" &&
        d17t?.status === "chegou" &&
        d17n?.tipo === "fornecedor" &&
        d17n?.status === "ok" &&
        d17n?.cfop === "2102" &&
        (d17n?.divergencias ?? []).length === 0 &&
        !!d17f &&
        (d17f.cnpj || "").replace(/\D/g, "") === CNPJ_NOTA &&
        d17nfe?.manifestacao === "ciencia",
      JSON.stringify({ po: d17 ?? null, t: d17t ?? null, ne: d17n ?? null, forn: d17f ?? null })
    );

    // ------------------------------------------------- E) importação -------
    await page.locator('button[aria-label="Aba Compras"]').click();
    await page.locator('button[aria-label="Novo pedido de compra"]').click();
    await page.locator('div[aria-label="Etapa grande Pedido de compra"]').waitFor({ timeout: 10000 });
    await page.locator('button[aria-label="Origem importacao"]').click();
    await page.locator('select[aria-label="Fornecedor no editor"]').selectOption(fc.id);
    await page.locator('input[aria-label="Câmbio"]').fill("5");
    await page.locator('select[aria-label="Produto da linha 1"]').selectOption(item.id);
    await page.locator('input[aria-label="Quantidade da linha 1"]').fill("4");
    await page.locator('input[aria-label="Custo da linha 1"]').fill("30");
    await page.locator('button[aria-label="Salvar pedido de compra"]').click();
    const avisoNovo5 = await esperarAviso(page, "criado.");
    PC5 = (avisoNovo5.match(/PC-[0-9A-Fa-f]{8}/) || [])[0] || null;
    const { data: e1 } = await admin
      .from("purchase_orders")
      .select("id, origem, total")
      .eq("code", PC5 ?? "")
      .maybeSingle();
    const { data: e1i } = await admin
      .from("compra_importacao")
      .select("cambio, di, moeda")
      .eq("purchase_order_id", e1?.id ?? "")
      .maybeSingle();
    const { data: e1t } = await admin
      .from("compra_transporte")
      .select("status")
      .eq("purchase_order_id", e1?.id ?? "")
      .maybeSingle();
    check(
      "E1 pedido de importacao salvo com cambio e transporte em producao",
      !!PC5 && e1?.origem === "importacao" && Number(e1i?.cambio) === 5 && !e1i?.di &&
        e1t?.status === "producao",
      JSON.stringify({ pc: PC5, po: e1 ?? null, imp: e1i ?? null, t: e1t ?? null })
    );

    await page.locator('button[aria-label="Emitir NF-e de entrada"]').click();
    const avisoEmitCedo = await esperarAviso(page, "em desembaraço");
    check(
      "E2 emitir antes do desembaraco e barrado",
      avisoEmitCedo.includes("A nota de entrada é emitida quando a carga entra em desembaraço."),
      avisoEmitCedo.trim()
    );

    for (let i = 0; i < 4; i++) {
      await page.locator('button[aria-label="Avançar transporte"]').click();
    }
    const avisoDesemb = await esperarAviso(page, "Transporte: Em desembaraço.");
    const { data: e3 } = await admin
      .from("compra_transporte")
      .select("status")
      .eq("purchase_order_id", e1.id)
      .maybeSingle();
    check(
      "E3 4 avancos levam a producao ate desembaraco (RC-01)",
      avisoDesemb.includes("Transporte: Em desembaraço.") && e3?.status === "desembaraco",
      `aviso=${avisoDesemb.trim()} status=${e3?.status}`
    );

    await page.locator('button[aria-label="Emitir NF-e de entrada"]').click();
    const avisoSemDi = await esperarAviso(page, "Informe o número da DI");
    check(
      "E4 emitir sem DI/DUIMP e barrado",
      avisoSemDi.includes("Informe o número da DI ou DUIMP para emitir a nota de entrada."),
      avisoSemDi.trim()
    );

    await page.locator('input[aria-label="DI ou DUIMP"]').fill(DI);
    await page.locator('button[aria-label="Salvar alterações"]').click();
    const avisoSalvo = await esperarAviso(page, "Pedido salvo.");
    const { data: e5 } = await admin
      .from("compra_importacao")
      .select("di")
      .eq("purchase_order_id", e1.id)
      .maybeSingle();
    check(
      "E5 DI gravada pela edicao",
      avisoSalvo.includes("Pedido salvo.") && e5?.di === DI,
      `aviso=${avisoSalvo.trim()} di=${e5?.di}`
    );

    await page.locator('button[aria-label="Emitir NF-e de entrada"]').click();
    const avisoTx = await esperarAviso(page, "transmitida");
    const numeroPropria = Number((avisoTx.match(/NF-e de entrada (\d+) transmitida/) || [])[1] || 0);
    const { data: e6 } = await admin
      .from("notas_entrada")
      .select("tipo, numero, cfop, status")
      .eq("purchase_order_id", e1.id)
      .maybeSingle();
    check(
      "E6 NI-01: emitir 3102 grava nota propria transmitida",
      numeroPropria > 0 &&
        e6?.tipo === "propria" &&
        String(e6?.numero) === String(numeroPropria) &&
        e6?.cfop === "3102" &&
        e6?.status === "transmitida",
      JSON.stringify({ aviso: avisoTx.trim(), nota: e6 ?? null })
    );

    check(
      "E7 botao Consultar nota de entrada unico",
      await todosUnicos(page, ['button[aria-label="Consultar nota de entrada"]'])
    );
    await page.locator('button[aria-label="Consultar nota de entrada"]').click();
    const avisoAutor = await esperarAviso(page, "autorizada");
    const { data: e7 } = await admin
      .from("notas_entrada")
      .select("status")
      .eq("purchase_order_id", e1.id)
      .maybeSingle();
    check(
      "E8 NI-04: consultar autoriza a NF-e de entrada",
      avisoAutor.includes(`NF-e de entrada ${numeroPropria} autorizada.`) && e7?.status === "ok",
      `${avisoAutor.trim()} | status=${e7?.status}`
    );

    await page.locator('input[aria-label="Quantidade da linha 1"]').fill("11");
    await page.locator('button[aria-label="Salvar alterações"]').click();
    const avisoPC06 = await esperarAviso(page, "já existe");
    check(
      "E9 PC-06: com nota emitida itens ficam bloqueados",
      avisoPC06.includes(
        "A nota de entrada já existe — itens, quantidades, custos, frete e desconto ficam bloqueados."
      ),
      avisoPC06.trim()
    );

    // ------------------------------------------------- F) atraso e funil ----
    await page.locator('input[aria-label="Previsão de chegada"]').fill(ONTEM);
    await page.locator('button[aria-label="Atualizar rastreio"]').click();
    const avisoPrev = await esperarAviso(page, "Transporte atualizado.");
    const { data: f1 } = await admin
      .from("compra_transporte")
      .select("previsao")
      .eq("purchase_order_id", e1.id)
      .maybeSingle();
    check(
      "F1 previsao vencida gravada (RC-02)",
      avisoPrev.includes("Transporte atualizado.") && f1?.previsao === ONTEM,
      `aviso=${avisoPrev.trim()} previsao=${f1?.previsao}`
    );
    await page.locator('button[aria-label="Fechar editor"]').click();

    await presente(page, PC5, true);
    check(
      "F2 linha atrasada exibe o chip Atrasada",
      await todosUnicos(page, [linha(page, PC5).getByText("Atrasada", { exact: true })])
    );

    await page.locator('button[aria-label="Filtro Com problema"]').click();
    const f3ok =
      (await presente(page, PC5, true)) && (await presente(page, PC1, false));
    check("F3 funil 'com problema': atrasada sim, em transito nao", f3ok);
    await page.locator('button[aria-label="Filtro Com problema"]').click();
    const f4ok = (await presente(page, PC1, true)) && (await presente(page, PC5, true));
    check("F4 segundo clique limpa o funil", f4ok);

    // ---------------------------------------------- G) recebimento PC1 ------
    await linha(page, PC1).getByRole("button", { name: "Ver rastreio" }).click();
    await page.locator('button[aria-label="Avançar transporte"]').waitFor({ timeout: 10000 });
    await page.locator('button[aria-label="Avançar transporte"]').click();
    const avisoSaiu = await esperarAviso(page, "Transporte: Saiu para entrega.");
    check("G1 transporte avanca de transito para saiu", avisoSaiu.includes("Saiu para entrega"), avisoSaiu.trim());

    await page.locator('button[aria-label="Registrar chegada na loja"]').click();
    const avisoChegou = await esperarAviso(page, "Transporte: Chegou.");
    const { data: g2 } = await admin
      .from("compra_transporte")
      .select("status")
      .eq("purchase_order_id", await idPo(PC1))
      .maybeSingle();
    check(
      "G2 registro de chegada move o transporte para chegou",
      avisoChegou.includes("Transporte: Chegou.") && g2?.status === "chegou",
      `aviso=${avisoChegou.trim()} status=${g2?.status}`
    );

    await page.locator('div[aria-label="Quadro de conferência"]').waitFor({ timeout: 10000 });
    await page.locator(`input[aria-label="Recebido ${SKU}"]`).fill("8");
    const rotuloConcluir =
      (await page.locator('button[aria-label="Concluir recebimento"]').textContent()) || "";
    check(
      "G3 quadro de conferencia detecta a diferenca no botao",
      rotuloConcluir.trim() === "Concluir com diferença",
      rotuloConcluir.trim()
    );

    await page.locator('button[aria-label="Concluir recebimento"]').click();
    const avisoRec = await esperarAviso(page, "Recebimento concluído");
    const idPO1 = await idPo(PC1);
    const { data: g4 } = await admin
      .from("purchase_receipts")
      .select("id")
      .eq("purchase_order_id", idPO1)
      .maybeSingle();
    const { data: g4i } = await admin
      .from("purchase_order_items")
      .select("quantity, qtd_recebida")
      .eq("purchase_order_id", idPO1);
    const g4s = await lerEstoque(item.id);
    const { data: g4t } = await admin
      .from("financial_titles")
      .select("id, direction")
      .eq("source_type", "purchase_receipt")
      .eq("source_id", g4?.id ?? "");
    const { data: g4p } = await admin
      .from("financial_installments")
      .select("id, number")
      .eq("title_id", g4t?.[0]?.id ?? "");
    const { data: g4po } = await admin
      .from("purchase_orders")
      .select("conferido_em")
      .eq("id", idPO1)
      .maybeSingle();
    const { data: g4n } = await admin
      .from("nfe_recebidas")
      .select("manifestacao")
      .eq("numero", "700001")
      .maybeSingle();
    check(
      "G4 RC-05: conferencia com diferenca grava receipt, estoque e titulo",
      avisoRec.includes("Recebimento concluído — total R$ 160,00.") &&
        avisoRec.includes("1 divergência(s) registrada(s).") &&
        !!g4 &&
        g4i?.length === 1 &&
        Number(g4i?.[0]?.qtd_recebida) === 8 &&
        Number(g4s?.stock_available) === 8 &&
        g4t?.length === 1 &&
        g4t[0].direction === "payable" &&
        (g4p ?? []).length === 1 &&
        !!g4po?.conferido_em &&
        g4n?.manifestacao === "confirmada",
      JSON.stringify({
        aviso: avisoRec.trim(),
        receipts: g4 ? 1 : 0,
        qtd: g4i?.[0]?.qtd_recebida,
        estoque: g4s?.stock_available,
        titulos: (g4t ?? []).length,
        parcelas: (g4p ?? []).length,
        conferido: !!g4po?.conferido_em,
        linhas: g4i?.length,
        manif: g4n?.manifestacao,
      })
    );

    await page.locator('button[aria-label="Marcar parcela 1 como paga"]').click();
    const avisoPaga = await esperarAviso(page, "Parcela 1 marcada como paga.");
    const { data: g5 } = await admin
      .from("financial_installments")
      .select("status, paid_amount")
      .eq("id", g4p?.[0]?.id ?? "")
      .maybeSingle();
    check(
      "G5 5.6: parcela marcada como paga via financial_settle",
      avisoPaga.includes("Parcela 1 marcada como paga.") && g5?.status === "liquidado",
      `aviso=${avisoPaga.trim()} status=${g5?.status}`
    );
    check(
      "G6 etapas da compra marcadas (recebimento e pagamento feitos)",
      await todosUnicos(page, [
        linha(page, PC1).locator('span[aria-label="Etapa Recebimento: feita"]'),
        linha(page, PC1).locator('span[aria-label="Etapa Pagamento: feita"]'),
      ])
    );
    await page.locator('button[aria-label="Fechar editor"]').click();

    // --------------------------------- H) busca, abas e layout 390px --------
    await page.fill('input[aria-label="Buscar compras"]', PC1);
    // a busca compara codigo/fornecedor/CNPJ/nota/rastreio: exigimos que o
    // pedido de importacao saia da lista e que o PC1 continue la
    const sumiuPC5 = await presente(page, PC5, false);
    const h1ok = sumiuPC5 && (await presente(page, PC1, true));
    check("H1 busca por codigo filtra a lista", h1ok);
    await page.fill('input[aria-label="Buscar compras"]', "");
    await presente(page, PC5, true);

    await page.locator('button[aria-label="Aba Notas recebidas"]').click();
    await page.locator('button[aria-label="Notas Tratadas"]').click();
    const h2ok = await presente(page, `Vinculada · ${PC1}`, true);
    check("H2 notas tratadas mostram o vinculo com o pedido", h2ok);
    await page.locator('button[aria-label="Notas Todas"]').click();
    const h2b = (await presente(page, "700001", true)) && (await presente(page, "700005", true));
    check("H3 filtro todas lista vinculadas e sem vinculo", h2b);

    await page.locator('button[aria-label="Aba Recebimento"]').click();
    const receb = ["A caminho (nacional)", "Importação", "Atrasadas", "A conferir"];
    const recebOk =
      (await page.locator("h2").filter({ hasText: /^Recebimento \(/ }).count()) === 1 &&
      (await todosUnicos(page, receb.map((f) => `button[aria-label="Recebimento ${f}"]`)));
    check("H4 aba Recebimento com heading e 4 filtros", recebOk);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const semScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    check("H5 sem rolagem horizontal em 390px", semScroll);
    await page.setViewportSize({ width: 1280, height: 800 });
  } finally {
    // limpeza ---------------------------------------------------------------
    try {
      await limparCompras();
      const estoque = await lerEstoque(item.id);
      if (Number(estoque?.stock_available ?? 0) !== 0) {
        await ajustarEstoque(item.id, 0, "cleanup E2E Compras V1");
      }
      if (empAntes) {
        await admin
          .from("tenant_company")
          .upsert({ tenant_id: TENANT, ...empAntes }, { onConflict: "tenant_id" });
      }
      const { data: sobrou } = await admin
        .from("suppliers")
        .select("id")
        .eq("tenant_id", TENANT)
        .in("name", NOMES);
      const { data: notasFora } = await admin
        .from("nfe_recebidas")
        .select("id")
        .eq("tenant_id", TENANT)
        .in("numero", NUMEROS_NOTAS);
      check(
        "Z1 limpeza: sem fornecedor, pedido ou nota sobrando",
        (sobrou ?? []).length === 0 && (notasFora ?? []).length === 0,
        `forn=${(sobrou ?? []).length} notas=${(notasFora ?? []).length}`
      );
    } catch (e) {
      console.log("cleanup:", e && e.message);
      check("Z1 limpeza: sem fornecedor, pedido ou nota sobrando", false, e && e.message);
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
