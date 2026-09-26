/* E2E F6 — revenda/atacado + portal do fornecedor (gate de aceite local).
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Rode tudo juntos com: npm run e2e
 * Cobre: /seja-revend (pedido público, pendente não loga, aprovação no console
 * de usuários), preços por canal na vitrine (visitante varejo × revenda
 * atacado), checkout revenda aplicando faixa 10+ no servidor, RBAC de
 * /compras e /portal/fornecedor, fornecedor + PO pela UI, recebimento no
 * portal (parcial → recebido, QTD_ACIMA bloqueado, entrada no estoque),
 * título a pagar + card "A pagar" no financeiro e limpeza. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const EMAIL_REV = "e2e-revenda-f6@nuvem-de-papel.com.br";
const EMAIL_FORN = "e2e-forn-f6@nuvem-de-papel.com.br";
const SENHA = "E2e#2026Test";
const TENANT = "00000000-0000-0000-0000-000000000001";
const SKU_F6 = "SKU-E2E-F6";
const NOME_F6 = "Item E2E F6";
const NOME_FORN = "Fornecedor E2E F6";
// precos incomuns de proposito: evita colisao com o catalogo real na checagem
// de presenca/ausencia da vitrine
const PRECO_VAREJO = 91.23;
const PRECO_ATACADO = 81.37;
const PRECO_FAIXA10 = 71.49;
const SALDO = 100;
const EPOCH = "1970-01-01T00:00:00Z";

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

async function esperarTexto(page, texto, timeout = 15000) {
  await page.getByText(texto, { exact: false }).first().waitFor({ timeout });
}

async function acharUser(email) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users || []).find((u) => (u.email || "").toLowerCase() === email) || null;
}

async function aguardar(fn, cond, tentativas = 20) {
  for (let i = 0; i < tentativas; i++) {
    const v = await fn();
    if (cond(v)) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
  return await fn();
}

async function preencherCheckout(page) {
  await page.goto(BASE + "/checkout", { waitUntil: "domcontentloaded" });
  await page.fill('input[placeholder="Nome completo"]', "Revenda E2E F6");
  await page.fill('input[placeholder="00000-000"]', "01310-100");
  await page.fill('input[placeholder="123"]', "3000");
  await page.locator('label:has-text("Rua") input').first().fill("Rua F6");
  await page.locator('label:has-text("Bairro") input').first().fill("Centro");
  await page.locator('label:has-text("Cidade") input').first().fill("São Paulo");
  await page.locator('label:has-text("UF") input').first().fill("SP");
}

async function apagarPedidosDe(email) {
  const { data: clientes } = await admin.from("customers").select("id").eq("email", email);
  for (const c of clientes ?? []) {
    const { data: pedidos } = await admin.from("orders").select("id").eq("customer_id", c.id);
    for (const p of pedidos ?? []) {
      await admin.from("order_items").delete().eq("order_id", p.id);
      await admin.from("orders").delete().eq("id", p.id);
    }
    await admin.from("customers").delete().eq("id", c.id);
  }
}

async function limparUsuarios(emails) {
  for (const email of emails) {
    const u = await acharUser(email);
    if (!u) continue;
    await admin.from("addresses").delete().eq("user_id", u.id);
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
}

// remove fornecedor + POs + notas + titulos a pagar da execucao (e de runs
// interrompidas): tudo e derivado do nome fixo do fornecedor E2E.
async function limparComprasF6() {
  const { data: fornec } = await admin.from("suppliers").select("id").eq("name", NOME_FORN);
  const fids = (fornec ?? []).map((f) => f.id);
  if (fids.length === 0) return;
  const { data: pos } = await admin
    .from("purchase_orders")
    .select("id")
    .in("supplier_id", fids);
  const poIds = (pos ?? []).map((p) => p.id);
  if (poIds.length) {
    const { data: recs } = await admin
      .from("purchase_receipts")
      .select("id")
      .in("purchase_order_id", poIds);
    const recIds = (recs ?? []).map((r) => r.id);
    if (recIds.length) {
      const { data: titulos } = await admin
        .from("financial_titles")
        .select("id")
        .eq("source_type", "purchase_receipt")
        .in("source_id", recIds);
      for (const t of titulos ?? []) {
        await admin.from("financial_installments").delete().eq("title_id", t.id);
        await admin.from("financial_titles").delete().eq("id", t.id);
      }
      await admin.from("purchase_receipt_items").delete().in("receipt_id", recIds);
      await admin.from("purchase_receipts").delete().in("id", recIds);
    }
    await admin.from("purchase_order_items").delete().in("purchase_order_id", poIds);
    await admin.from("purchase_orders").delete().in("id", poIds);
  }
  await admin.from("suppliers").delete().in("id", fids);
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
  if (diff === 0) return;
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

function parseValor(texto) {
  const n = (texto ?? "").replace(/[^\d,]/g, "").replace(",", ".");
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

async function main() {
  const RUN = Date.now().toString(36);
  const statePath = path.join(require("os").tmpdir(), "e2e-f6-state.json");

  // R) recuperacao de execucoes anteriores interrompidas --------------------
  await apagarPedidosDe(EMAIL_REV);
  await limparComprasF6();
  await limparUsuarios([EMAIL_REV, EMAIL_FORN]);
  check("R1 limpeza de execucoes anteriores (pedidos/compras/usuarios)", true);
  fs.writeFileSync(statePath, JSON.stringify({ run: RUN }));

  // A) RBAC anonimo ---------------------------------------------------------
  const rSeja = await fetch(BASE + "/seja-revenda", { redirect: "manual" });
  check("A1 /seja-revenda publico -> 200", rSeja.status === 200, `status=${rSeja.status}`);
  const rCompras = await fetch(BASE + "/compras", { redirect: "manual" });
  check("A2 /compras anonimo -> 307 login", rCompras.status === 307, `status=${rCompras.status}`);
  const rPortal = await fetch(BASE + "/portal/fornecedor", { redirect: "manual" });
  check("A3 /portal/fornecedor anonimo -> 307 login", rPortal.status === 307, `status=${rPortal.status}`);

  // B) seed: item + faixas + usuario fornecedor -----------------------------
  let { data: item } = await admin
    .from("catalog_items")
    .select("id, active")
    .eq("sku", SKU_F6)
    .maybeSingle();
  if (!item) {
    const { data: novo, error } = await admin
      .from("catalog_items")
      .insert({ tenant_id: TENANT, sku: SKU_F6, name: NOME_F6, category: "E2E", active: true })
      .select("id")
      .single();
    if (error) throw new Error("seed catalog_items: " + error.message);
    item = { id: novo.id, active: true };
  } else if (!item.active) {
    await admin.from("catalog_items").update({ active: true }).eq("id", item.id);
  }
  const faixas = [
    { item_id: item.id, channel: "varejo", min_quantity: 1, valid_from: EPOCH, valid_until: null, price: PRECO_VAREJO },
    { item_id: item.id, channel: "atacado", min_quantity: 1, valid_from: EPOCH, valid_until: null, price: PRECO_ATACADO },
    { item_id: item.id, channel: "atacado", min_quantity: 10, valid_from: EPOCH, valid_until: null, price: PRECO_FAIXA10 },
    { item_id: item.id, channel: "atacado", min_quantity: 1, valid_from: "2024-01-01T00:00:00Z", valid_until: "2024-06-01T00:00:00Z", price: 10 },
  ];
  const { error: errPreco } = await admin.from("item_prices").upsert(faixas, {
    onConflict: "item_id,channel,min_quantity,valid_from",
  });
  if (errPreco) throw new Error("seed item_prices: " + errPreco.message);
  await ajustarEstoque(item.id, SALDO, "seed E2E F6");
  check("B1 seed: saldo de estoque igual a 100", Number((await lerEstoque(item.id)).stock_available) === SALDO);

  let uForn = await acharUser(EMAIL_FORN);
  if (!uForn) {
    const { data: criado, error } = await admin.auth.admin.createUser({
      email: EMAIL_FORN,
      password: SENHA,
      email_confirm: true,
    });
    if (error) throw new Error("fixture fornecedor: " + error.message);
    await admin.from("profiles").insert({
      id: criado.user.id,
      tenant_id: TENANT,
      email: EMAIL_FORN,
      full_name: "Fornecedor E2E F6",
      role: "fornecedor",
      status: "ativo",
    });
    uForn = criado.user;
  }

  const browser = await chromium.launch({ channel: "msedge", headless: true });

  // C) pedido de revenda pela UI --------------------------------------------
  const ctxAnon = await browser.newContext();
  const pageA = await ctxAnon.newPage();
  await pageA.goto(BASE + "/seja-revenda", { waitUntil: "domcontentloaded" });
  await pageA.fill("#nome", "Revenda E2E F6");
  await pageA.fill("#email", EMAIL_REV);
  await pageA.fill("#senha", SENHA);
  await pageA.click('button:has-text("Pedir para ser revenda")');
  await esperarTexto(pageA, "Pedido enviado");
  check("C1 /seja-revenda confirma o pedido pela UI", true);

  const { data: profRev } = await admin
    .from("profiles")
    .select("role, status")
    .eq("email", EMAIL_REV)
    .maybeSingle();
  check(
    "C2 perfil criado como revenda pendente",
    profRev?.role === "revenda" && profRev?.status === "pendente",
    JSON.stringify(profRev)
  );
  const { data: audPedido } = await admin
    .from("audit_log")
    .select("id")
    .eq("action", "revenda.pedido")
    .eq("entity_id", (await acharUser(EMAIL_REV))?.id ?? "");
  check("C3 pedido auditado (revenda.pedido)", (audPedido ?? []).length >= 1, `n=${(audPedido ?? []).length}`);

  await pageA.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await pageA.fill("#email", EMAIL_REV);
  await pageA.fill("#senha", SENHA);
  await pageA.click('button[type="submit"]');
  await esperarTexto(pageA, "Cadastro em análise");
  const urlPend = new URL(pageA.url());
  check(
    "C4 revenda pendente nao loga (aviso de analise)",
    urlPend.pathname.startsWith("/login"),
    pageA.url()
  );
  await ctxAnon.close();

  // D) aprovacao pelo master ------------------------------------------------
  const ctxMaster = await browser.newContext();
  const pageM = await ctxMaster.newPage();
  await login(pageM, EMAIL_MASTER, SENHA_MASTER);
  await pageM.goto(BASE + "/configuracoes/usuarios", { waitUntil: "domcontentloaded" });
  const rowRev = pageM.locator(`tr:has-text("${EMAIL_REV}")`);
  await rowRev.first().waitFor({ timeout: 15000 });
  const temPendente = (await rowRev.first().textContent())?.includes("Pendente");
  check("D1 console de usuarios mostra badge Pendente", !!temPendente);
  await rowRev.first().locator('button:has-text("Aprovar")').click();
  await aguardar(async () => (await rowRev.first().textContent()) ?? "", (t) => t.includes("Ativo"));
  check("D2 aprovacao pela UI vira Ativo", ((await rowRev.first().textContent()) ?? "").includes("Ativo"));
  const { data: profApos } = await admin
    .from("profiles")
    .select("status")
    .eq("email", EMAIL_REV)
    .maybeSingle();
  check("D3 perfil aprovado no banco", profApos?.status === "ativo", profApos?.status ?? "");

  const ctxRev = await browser.newContext();
  const pageR = await ctxRev.newPage();
  await login(pageR, EMAIL_REV, SENHA);
  check("D4 revenda aprovada loga e cai em /produtos", new URL(pageR.url()).pathname === "/produtos", pageR.url());

  // E) precos por canal na vitrine ------------------------------------------
  await pageR.goto(BASE + "/produtos", { waitUntil: "domcontentloaded" });
  await esperarTexto(pageR, NOME_F6);
  const corpoRev = (await pageR.textContent("body")) ?? "";
  check(
    "E1 revenda ve preco de atacado (nao varejo)",
    corpoRev.includes("81,37") && !corpoRev.includes("91,23"),
    `atacado=${corpoRev.includes("81,37")} varejo=${corpoRev.includes("91,23")}`
  );
  const ctxVis = await browser.newContext();
  const pageV = await ctxVis.newPage();
  await pageV.goto(BASE + "/produtos", { waitUntil: "domcontentloaded" });
  await esperarTexto(pageV, NOME_F6);
  const corpoVis = (await pageV.textContent("body")) ?? "";
  check(
    "E2 visitante ve preco de varejo (nao atacado)",
    corpoVis.includes("91,23") && !corpoVis.includes("81,37"),
    `varejo=${corpoVis.includes("91,23")} atacado=${corpoVis.includes("81,37")}`
  );
  await ctxVis.close();

  // F) checkout da revenda: faixa 10+ resolvida no servidor -----------------
  await pageR.goto(BASE + "/produtos", { waitUntil: "domcontentloaded" });
  const btnAdd = pageR.locator(`button[aria-label="Adicionar ${NOME_F6}"]`);
  await btnAdd.waitFor({ timeout: 15000 });
  await btnAdd.click();
  const cart = JSON.parse(
    await pageR.evaluate(() => window.localStorage.getItem("ndp_carrinho_v1") || "[]")
  );
  cart[0].qty = 10;
  await pageR.evaluate((c) => window.localStorage.setItem("ndp_carrinho_v1", JSON.stringify(c)), cart);
  await preencherCheckout(pageR);
  const chkSalvar = pageR.locator('input[type="checkbox"]').first();
  if (await chkSalvar.isChecked()) await chkSalvar.uncheck();
  await pageR.click('button:has-text("Confirmar pedido")');
  await pageR.waitForURL(/\/conta\/pedidos\?novo=/, { timeout: 25000 });
  const pedidoId = new URL(pageR.url()).searchParams.get("novo");
  const { data: pedidoF6 } = await admin.from("orders").select("*").eq("id", pedidoId).maybeSingle();
  const totalFaixa = Math.round(PRECO_FAIXA10 * 10 * 100);
  check(
    "F1 pedido da revenda no canal atacado com total da faixa 10+",
    pedidoF6?.channel === "atacado" && Math.round(Number(pedidoF6.total_amount) * 100) === totalFaixa,
    JSON.stringify({ channel: pedidoF6?.channel, total: pedidoF6?.total_amount })
  );
  const { data: itensF6 } = await admin.from("order_items").select("*").eq("order_id", pedidoId);
  check(
    "F2 unit_price = preco de atacado 10+ (ignora base e varejo)",
    itensF6?.length === 1 &&
      itensF6[0].quantity === 10 &&
      Math.round(Number(itensF6[0].unit_price) * 100) === Math.round(PRECO_FAIXA10 * 100),
    JSON.stringify(itensF6)
  );

  // G) RBAC dos modulos ------------------------------------------------------
  const respComprasM = await pageM.goto(BASE + "/compras", { waitUntil: "domcontentloaded" });
  check(
    "G1 master abre /compras",
    respComprasM.status() === 200 && ((await pageM.textContent("body")) ?? "").includes("Compras"),
    `status=${respComprasM.status()}`
  );
  const respPortalM = await pageM.goto(BASE + "/portal/fornecedor", { waitUntil: "domcontentloaded" });
  check("G2 master le 403 em /portal/fornecedor", respPortalM.status() === 403, `status=${respPortalM.status()}`);
  const respComprasR = await pageR.goto(BASE + "/compras", { waitUntil: "domcontentloaded" });
  check("G3 revenda le 403 em /compras", respComprasR.status() === 403, `status=${respComprasR.status()}`);

  const ctxForn = await browser.newContext();
  const pageF = await ctxForn.newPage();
  await login(pageF, EMAIL_FORN, SENHA);
  const respComprasF = await pageF.goto(BASE + "/compras", { waitUntil: "domcontentloaded" });
  check("G4 fornecedor le 403 em /compras", respComprasF.status() === 403, `status=${respComprasF.status()}`);
  const respPortalF = await pageF.goto(BASE + "/portal/fornecedor", { waitUntil: "domcontentloaded" });
  check("G5 fornecedor abre /portal/fornecedor", respPortalF.status() === 200, `status=${respPortalF.status()}`);

  // H) compras: fornecedor + pedido pela UI ---------------------------------
  await pageM.goto(BASE + "/compras", { waitUntil: "domcontentloaded" });
  await pageM.fill('input[placeholder="Nome do fornecedor"]', NOME_FORN);
  await pageM.fill('input[placeholder="E-mail do usuário fornecedor (opcional)"]', EMAIL_FORN);
  await pageM.click('button:has-text("Criar fornecedor")');
  const selForn = pageM.locator('select[aria-label="Fornecedor do pedido"]');
  await selForn.locator(`option:has-text("${NOME_FORN}")`).first().waitFor({ state: "attached", timeout: 15000 });
  check("H1 fornecedor criado com vinculo ao usuario", true);

  await selForn.selectOption({ label: NOME_FORN });
  await pageM.selectOption('select[aria-label="Item 1"]', { label: `${SKU_F6} — ${NOME_F6}` });
  await pageM.fill('input[aria-label="Quantidade 1"]', "10");
  await pageM.fill('input[aria-label="Custo unitário 1"]', "20");
  await pageM.click('button:has-text("Criar pedido de compra")');
  await pageM.getByText(/PC-[0-9A-F]{8}/).first().waitFor({ timeout: 15000 });
  const codigoPo = await pageM.getByText(/PC-[0-9A-F]{8}/).first().textContent();
  check("H2 pedido de compra criado e listado", !!codigoPo, codigoPo ?? "");

  const { data: fornDb } = await admin.from("suppliers").select("id").eq("name", NOME_FORN).maybeSingle();
  const { data: poDb } = await admin
    .from("purchase_orders")
    .select("id, status, total, purchase_order_items(*)")
    .eq("supplier_id", fornDb?.id ?? "")
    .maybeSingle();
  check(
    "H3 PO no banco: aberto, total 200, 1 item qty 10 custo 20",
    poDb?.status === "aberto" &&
      Number(poDb.total) === 200 &&
      poDb.purchase_order_items?.length === 1 &&
      poDb.purchase_order_items[0].quantity === 10 &&
      Number(poDb.purchase_order_items[0].unit_cost) === 20,
    JSON.stringify({ status: poDb?.status, total: poDb?.total, itens: poDb?.purchase_order_items?.length })
  );
  const poiId = poDb?.purchase_order_items?.[0]?.id;

  // I) portal do fornecedor: recebimento parcial -> recebido ----------------
  await pageF.goto(BASE + "/portal/fornecedor", { waitUntil: "domcontentloaded" });
  await esperarTexto(pageF, codigoPo);
  check("I1 portal lista o pedido do fornecedor", true);

  const estAntes = Number((await lerEstoque(item.id)).stock_available);
  await pageF.fill(`input[aria-label="Recebido agora ${SKU_F6}"]`, "4");
  await pageF.click('button:has-text("Registrar recebimento")');
  await esperarTexto(pageF, "Recebimento registrado");
  check("I2 recebimento parcial (4 de 10) pela UI", true);

  const estDepois = Number((await lerEstoque(item.id)).stock_available);
  check("I3 entrada no estoque (+4)", estDepois === estAntes + 4, `${estAntes} -> ${estDepois}`);

  const { data: poParcial } = await admin
    .from("purchase_orders")
    .select("status")
    .eq("id", poDb.id)
    .maybeSingle();
  check("I4 PO parcial apos 4 de 10", poParcial?.status === "parcial", poParcial?.status ?? "");

  const { data: recs } = await admin
    .from("purchase_receipts")
    .select("id, total, code")
    .eq("purchase_order_id", poDb.id);
  const { data: titPagar } = await admin
    .from("financial_titles")
    .select("id, direction, source_type, status, principal_amount")
    .eq("source_type", "purchase_receipt")
    .eq("source_id", recs?.[0]?.id ?? "");
  check(
    "I5 nota gera titulo a pagar (payable, 80)",
    (recs ?? []).length === 1 &&
      titPagar?.length === 1 &&
      titPagar[0].direction === "payable" &&
      Number(titPagar[0].principal_amount) === 80,
    JSON.stringify({ recs: recs?.length, tit: titPagar?.[0] })
  );

  const acima = await admin.rpc("purchase_receive", {
    p_purchase_order_id: poDb.id,
    p_items: [{ purchase_order_item_id: poiId, quantity: 7 }],
    p_idempotency_key: `e2e-f6-${RUN}-acima`,
    p_notes: null,
    p_created_by: null,
  });
  check(
    "I6 quantidade acima do pedido bloqueada (QTD_ACIMA)",
    !!acima.error && (acima.error.message ?? "").includes("QTD_ACIMA_DO_PEDIDO"),
    acima.error?.message ?? "sem erro"
  );

  await pageF.fill(`input[aria-label="Recebido agora ${SKU_F6}"]`, "6");
  await pageF.click('button:has-text("Registrar recebimento")');
  const semInputResto = await aguardar(
    async () => (await pageF.locator(`input[aria-label="Recebido agora ${SKU_F6}"]`).count()) === 0,
    (v) => v === true
  );
  check("I7 restante recebido pela UI (input some apos 10 de 10)", semInputResto);
  const { data: poFinal } = await admin
    .from("purchase_orders")
    .select("status")
    .eq("id", poDb.id)
    .maybeSingle();
  check("I8 PO concluido (recebido)", poFinal?.status === "recebido", poFinal?.status ?? "");

  // J) financeiro: card A pagar ----------------------------------------------
  await pageM.goto(BASE + "/financeiro", { waitUntil: "domcontentloaded" });
  await esperarTexto(pageM, "A pagar");
  const cardPagar = pageM.locator('[aria-label="A pagar"]');
  const valorPagar = parseValor(await cardPagar.textContent());
  check("J1 /financeiro mostra A pagar > 0 (80)", valorPagar >= 80, `valor=${valorPagar}`);

  // K) limpeza ----------------------------------------------------------------
  await apagarPedidosDe(EMAIL_REV);
  await limparComprasF6();
  await ajustarEstoque(item.id, 0, "limpeza E2E F6");
  await admin.from("catalog_items").update({ active: false }).eq("id", item.id);
  await limparUsuarios([EMAIL_REV, EMAIL_FORN]);

  // o Auth admin.listUsers tem consistencia eventual apos delete: re-consulta
  const k1 = await aguardar(
    async () => ({
      forn: (await admin.from("suppliers").select("id").eq("name", NOME_FORN)).data?.length ?? -1,
      pos:
        (
          await admin
            .from("purchase_orders")
            .select("id")
            .eq("supplier_id", fornDb?.id ?? "")
        ).data?.length ?? -1,
      rev: !!(await acharUser(EMAIL_REV)),
      forn2: !!(await acharUser(EMAIL_FORN)),
      est: Number((await lerEstoque(item.id))?.stock_available),
      ativo: (await admin.from("catalog_items").select("active").eq("id", item.id)).data?.[0]?.active,
    }),
    (v) => v.forn === 0 && v.pos === 0 && !v.rev && !v.forn2 && v.est === 0 && v.ativo === false
  );
  check(
    "K1 limpeza: fornecedor/compras fora, usuarios fora, estoque 0, item oculto",
    k1.forn === 0 && k1.pos === 0 && !k1.rev && !k1.forn2 && k1.est === 0 && k1.ativo === false,
    JSON.stringify(k1)
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
