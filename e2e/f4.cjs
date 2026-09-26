/* E2E F4 — estoque + logística (gate de aceite local).
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido
 * (MP_WEBHOOK_SECRET + MP_MOCK=1 para o webhook local).
 * Rode tudo juntos com: npm run e2e
 * Cobre: vitrine com saldo/badge, corrida de última unidade (exatamente 1
 * vence), checkout bloqueado com saldo esgotado (pedido compensado),
 * cancelamento devolvendo reserva, entrada manual, pagamento via webhook
 * (assinatura HMAC + modo mock local) com baixa de estoque idempotente,
 * fila de expedição (separar/enviar/entregue), transição inválida bloqueada
 * pelo banco, RBAC de /logistica e limpeza. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const { createHmac } = require("crypto");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_COMP = "e2e-comprador@nuvem-de-papel.com.br";
const SENHA_COMP = "E2e#2026Test";
const EMAIL_FORN = "e2e-fornecedor@nuvem-de-papel.com.br";
const SENHA_FORN = "E2e#2026Test";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const SKU_F4 = "SKU-E2E-F4";
const NOME_F4 = "Caderno E2E F4";
const WEBHOOK_IDS = ["f4-pag-1", "f4-pag-2"];

function lerEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const env = lerEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const resultados = [];
function check(nome, cond, detalhe = "") {
  resultados.push({ ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"} - ${nome}${detalhe ? " | " + detalhe : ""}`);
}

async function acharUser(email) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users || []).find((u) => (u.email || "").toLowerCase() === email) || null;
}

async function lerEstoque(itemId) {
  const { data } = await admin
    .from("item_stock")
    .select("stock_available, stock_on_hand")
    .eq("item_id", itemId)
    .maybeSingle();
  return data;
}

async function contarMov(itemId, tipo, refId = null) {
  let q = admin
    .from("stock_movements")
    .select("*", { count: "exact", head: true })
    .eq("item_id", itemId)
    .eq("movement_type", tipo);
  if (refId) q = q.eq("reference_id", refId);
  const { count } = await q;
  return count ?? 0;
}

async function apagarPedidosDosClientes(emails) {
  const { data: clientes } = await admin.from("customers").select("id").in("email", emails);
  const cids = (clientes ?? []).map((c) => c.id);
  if (cids.length === 0) return [];
  const { data: pedidos } = await admin.from("orders").select("id").in("customer_id", cids);
  const pids = (pedidos ?? []).map((p) => p.id);
  for (const pid of pids) {
    await admin.from("order_items").delete().eq("order_id", pid);
    await admin.from("orders").delete().eq("id", pid);
  }
  await admin.from("customers").delete().in("id", cids);
  return pids;
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

async function prepararItem() {
  let { data: item } = await admin.from("catalog_items").select("id, active").eq("sku", SKU_F4).maybeSingle();
  if (!item) {
    const { data: novo, error } = await admin
      .from("catalog_items")
      .insert({ tenant_id: TENANT, sku: SKU_F4, name: NOME_F4, category: "E2E", active: true })
      .select("id")
      .single();
    if (error) throw new Error("falha ao criar item E2E: " + error.message);
    await admin.from("item_prices").insert({ item_id: novo.id, channel: "varejo", price: 10, min_quantity: 1 });
    item = { id: novo.id, active: true };
  } else if (!item.active) {
    await admin.from("catalog_items").update({ active: true }).eq("id", item.id);
  }
  // zera o saldo de execuções anteriores e deixa exatamente 1
  const atual = await lerEstoque(item.id);
  if (atual && atual.stock_available !== 0) {
    const { error } = await admin.rpc("register_stock_movement", {
      p_item_id: item.id, p_type: "ajuste", p_quantity: -Number(atual.stock_available),
      p_reference_type: "manual", p_reference_id: null, p_notes: "reset E2E F4", p_created_by: null,
    });
    if (error) throw new Error("reset de estoque falhou: " + error.message);
  }
  const { error: errEntrada } = await admin.rpc("register_stock_movement", {
    p_item_id: item.id, p_type: "entrada", p_quantity: 1,
    p_reference_type: "manual", p_reference_id: null, p_notes: "seed E2E F4", p_created_by: null,
  });
  if (errEntrada) throw new Error("seed de estoque falhou: " + errEntrada.message);
  return item.id;
}

async function criarPedidoReserva(itemId) {
  const { data: cli } = await admin
    .from("customers")
    .upsert({ tenant_id: TENANT, email: EMAIL_COMP, name: "Comprador E2E" }, { onConflict: "tenant_id,email" })
    .select("id")
    .single();
  const { data: p, error } = await admin
    .from("orders")
    .insert({ tenant_id: TENANT, customer_id: cli.id, channel: "varejo", status: "aguardando_pagamento", total_amount: 10 })
    .select("id")
    .single();
  if (error) throw new Error("falha ao criar pedido reserva: " + error.message);
  await admin.from("order_items").insert({
    tenant_id: TENANT, order_id: p.id, item_id: itemId,
    sku: SKU_F4, name: NOME_F4, unit_price: 10, quantity: 1, total: 10,
  });
  return p.id;
}

async function login(page, email, senha) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

async function preencherCheckout(page) {
  await page.goto(BASE + "/checkout", { waitUntil: "domcontentloaded" });
  await page.fill('input[placeholder="Nome completo"]', "Comprador E2E");
  await page.fill('input[placeholder="00000-000"]', "01310-100");
  await page.fill('input[placeholder="123"]', "2000");
  await page.locator('label:has-text("Rua") input').first().fill("Rua Augusta");
  await page.locator('label:has-text("Bairro") input').first().fill("Consolação");
  await page.locator('label:has-text("Cidade") input').first().fill("São Paulo");
  await page.locator('label:has-text("UF") input').first().fill("SP");
}

async function aguardar(fn, cond, tentativas = 15) {
  for (let i = 0; i < tentativas; i++) {
    const v = await fn();
    if (cond(v)) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  return await fn();
}

async function enviarWebhook(pagId, pedidoId, status) {
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = "e2e-f4-req";
  const manifesto = `id:${pagId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", env.MP_WEBHOOK_SECRET).update(manifesto).digest("hex");
  const corpo = JSON.stringify({ type: "payment", data: { id: pagId }, status, external_reference: pedidoId });
  const resp = await fetch(BASE + "/api/webhooks/mercadopago", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-signature": `ts=${ts},v1=${v1}`,
      "x-request-id": requestId,
    },
    body: corpo,
  });
  return { status: resp.status, json: await resp.json().catch(() => ({})) };
}

(async () => {
  // limpeza de execuções anteriores (reserva ativa + pedidos + usuários)
  const emails = [EMAIL_COMP, EMAIL_FORN];
  {
    const { data: clientes } = await admin.from("customers").select("id").in("email", emails);
    const cids = (clientes ?? []).map((c) => c.id);
    if (cids.length) {
      const { data: velhos } = await admin.from("orders").select("id, status").in("customer_id", cids);
      for (const o of velhos ?? []) {
        if (o.status === "aguardando_pagamento") {
          await admin.rpc("release_order_stock", { p_order_id: o.id });
        }
      }
    }
  }
  await apagarPedidosDosClientes(emails);
  await limparUsuarios(emails);
  await admin.from("webhook_events").delete().in("external_id", WEBHOOK_IDS);

  const itemId = await prepararItem();

  const criadoComp = await admin.auth.admin.createUser({ email: EMAIL_COMP, password: SENHA_COMP, email_confirm: true });
  const userId = criadoComp.data.user?.id;
  if (!userId) throw new Error("falha ao criar comprador E2E");
  await admin.from("profiles").insert({ id: userId, tenant_id: TENANT, email: EMAIL_COMP, full_name: "Comprador E2E", role: "vendedor", status: "ativo" });

  const browser = await chromium.launch({ channel: "msedge", headless: true });

  // A) RBAC: anônimo é redirecionado
  const rAnon = await fetch(BASE + "/logistica", { redirect: "manual" });
  check("A1 /logistica anonimo -> 307 login", rAnon.status === 307 && (rAnon.headers.get("location") || "").includes("/login"), `status=${rAnon.status}`);

  // B) vitrine com saldo 1 + comprador adiciona ao carrinho
  const ctxComp = await browser.newContext();
  const page = await ctxComp.newPage();
  await login(page, EMAIL_COMP, SENHA_COMP);
  await page.goto(BASE + "/produtos", { waitUntil: "domcontentloaded" });
  const textoVitrine = (await page.textContent("body")) || "";
  check("B1 vitrine mostra ultimas 1 unidade", textoVitrine.includes("Últimas 1 unidades"));
  const btnItem = page.locator(`button[aria-label="Adicionar ${NOME_F4}"]`);
  await btnItem.waitFor({ timeout: 15000 });
  check("B2 botao do item habilitado com saldo", !(await btnItem.isDisabled()));
  await btnItem.click();
  const badge = await page.locator('a[aria-label^="Carrinho com"]').getAttribute("aria-label");
  check("B3 carrinho com 1 item E2E", (badge || "").includes("1"), badge);

  // C) corrida: 2 pedidos disputam a unidade restante
  const pedidoX = await criarPedidoReserva(itemId);
  const pedidoY = await criarPedidoReserva(itemId);
  const [rx, ry] = await Promise.all([
    admin.rpc("reserve_order_stock", { p_order_id: pedidoX }),
    admin.rpc("reserve_order_stock", { p_order_id: pedidoY }),
  ]);
  const venceus = [rx, ry].filter((r) => !r.error);
  const falharam = [rx, ry].filter((r) => r.error);
  check(
    "C1 corrida: exatamente 1 reserva vence e a outra leva ESTOQUE_INSUFICIENTE",
    venceus.length === 1 &&
      falharam.length === 1 &&
      (falharam[0].error.message || "").includes("ESTOQUE_INSUFICIENTE"),
    JSON.stringify({ ok: venceus.length, erro: falharam[0]?.error?.message?.slice(0, 60) })
  );
  const estoqueAposCorrida = await lerEstoque(itemId);
  check("C2 saldo esgotado apos corrida", Number(estoqueAposCorrida?.stock_available) === 0, JSON.stringify(estoqueAposCorrida));

  // D) vitrine esgotada: botao desabilitado
  await page.goto(BASE + "/produtos", { waitUntil: "domcontentloaded" });
  const btnEsgotado = page.locator(`button[aria-label="${NOME_F4} esgotado"]`);
  await btnEsgotado.waitFor({ timeout: 15000 });
  check("D1 botao esgotado desabilitado na vitrine", await btnEsgotado.isDisabled());
  const textoEsgotado = (await page.textContent("body")) || "";
  check("D2 card mostra Esgotado", textoEsgotado.includes("Esgotado"));

  // E) checkout com saldo esgotado → erro amigavel e pedido compensado
  await preencherCheckout(page);
  const chkSalvar = page.locator('input[type="checkbox"]').first();
  if (await chkSalvar.isChecked()) await chkSalvar.uncheck();
  await page.click('button:has-text("Confirmar pedido")');
  await page.locator("text=Estoque insuficiente").first().waitFor({ timeout: 20000 });
  const urlAposErro = page.url();
  check("E1 checkout explica saldo insuficiente e nao navega", urlAposErro.includes("/checkout"));
  const { data: pedidosComp1 } = await admin.from("orders").select("id").eq("user_id", userId);
  check("E2 pedido nao criado (compensado)", (pedidosComp1 ?? []).length === 0, `n=${(pedidosComp1 ?? []).length}`);

  // F) master cancela os 2 pedidos da fila → reserva devolvida
  const ctxMaster = await browser.newContext();
  const pageM = await ctxMaster.newPage();
  await login(pageM, EMAIL_MASTER, SENHA_MASTER);
  await pageM.goto(BASE + "/logistica", { waitUntil: "domcontentloaded" });
  const linhaFila = pageM.locator('tr:has-text("Comprador E2E")');
  check("F1 fila mostra os 2 pedidos E2E", (await linhaFila.count()) === 2, `n=${await linhaFila.count()}`);
  await linhaFila.first().locator('button:has-text("Cancelar")').click();
  await pageM.locator("text=estoque reservado devolvido").first().waitFor({ timeout: 15000 });
  await pageM.locator('tr:has-text("Comprador E2E")').first().locator('button:has-text("Cancelar")').click();
  const estoqueAposCancel = await aguardar(
    () => lerEstoque(itemId),
    (v) => Number(v?.stock_available) === 1
  );
  check("F2 cancelamento devolveu a reserva (saldo=1)", Number(estoqueAposCancel?.stock_available) === 1, JSON.stringify(estoqueAposCancel));

  // G) entrada manual de 7 unidades via formulario
  await pageM.goto(BASE + "/logistica", { waitUntil: "domcontentloaded" });
  await pageM.locator("select").first().selectOption(itemId);
  await pageM.locator('input[type="number"]').first().fill("7");
  await pageM.click('button:has-text("Registrar")');
  await pageM.locator("text=entrada registrado (+7)").first().waitFor({ timeout: 15000 });
  const estoqueAposEntrada = await lerEstoque(itemId);
  check("G1 entrada manual somou 7 (saldo=8)", Number(estoqueAposEntrada?.stock_available) === 8, JSON.stringify(estoqueAposEntrada));

  // H) checkout completo do comprador → reserva → webhook pago → baixa
  await page.evaluate(() => window.localStorage.removeItem("ndp_carrinho_v1"));
  await page.goto(BASE + "/produtos", { waitUntil: "domcontentloaded" });
  await page.locator(`button[aria-label="Adicionar ${NOME_F4}"]`).click();
  await preencherCheckout(page);
  const chkSalvar2 = page.locator('input[type="checkbox"]').first();
  if (await chkSalvar2.isChecked()) await chkSalvar2.uncheck();
  await page.click('button:has-text("Confirmar pedido")');
  await page.waitForURL(/\/conta\/pedidos\?novo=/, { timeout: 25000 });
  const pedidoG = new URL(page.url()).searchParams.get("novo");
  check("H1 pedido criado com reserva (saldo=7)", !!pedidoG);
  const estoqueH = await lerEstoque(itemId);
  check("H2 reserva aplicada (disponivel=7, fisico=8)", Number(estoqueH?.stock_available) === 7 && Number(estoqueH?.stock_on_hand) === 8, JSON.stringify(estoqueH));

  const hook1 = await enviarWebhook(WEBHOOK_IDS[0], pedidoG, "approved");
  check("H3 webhook assinado processado", hook1.status === 200 && hook1.json.status === "processado", JSON.stringify(hook1.json));
  const { data: pedidoGPos } = await admin.from("orders").select("status").eq("id", pedidoG).maybeSingle();
  check("H4 pedido pago", pedidoGPos?.status === "pago", pedidoGPos?.status);
  const estoqueH2 = await lerEstoque(itemId);
  check("H5 baixa de estoque (disponivel=7, fisico=7)", Number(estoqueH2?.stock_available) === 7 && Number(estoqueH2?.stock_on_hand) === 7, JSON.stringify(estoqueH2));
  const vendas = await contarMov(itemId, "venda", pedidoG);
  check("H6 ledger tem exatamente 1 venda deste pedido", vendas === 1, `vendas=${vendas}`);

  const hook2 = await enviarWebhook(WEBHOOK_IDS[0], pedidoG, "approved");
  check("H7 replay do webhook e idempotente", hook2.status === 200 && hook2.json.status === "duplicado", JSON.stringify(hook2.json));
  const vendas2 = await contarMov(itemId, "venda", pedidoG);
  check("H8 replay nao descontou em dobro", vendas2 === 1, `vendas=${vendas2}`);

  // I) expedição: separar → enviar → entregue (TODOS os cliques escopados à
  // linha do pedido E2E — a fila pode conter pedidos reais do staging)
  await pageM.goto(BASE + "/logistica", { waitUntil: "domcontentloaded" });
  const rowG = pageM.locator(`tr:has-text("Comprador E2E")`);
  check("I1 pedido pago na fila de expedicao", (await rowG.count()) === 1, `n=${await rowG.count()}`);
  const lerStatus = async () => (await admin.from("orders").select("status").eq("id", pedidoG).maybeSingle()).data?.status;

  await rowG.locator('button:has-text("Separar")').click();
  await pageM.locator("text=marcado como processando").first().waitFor({ timeout: 15000 });
  const stProc = await aguardar(lerStatus, (s) => s === "processando");
  check("I2 status processando", stProc === "processando", stProc);

  await rowG.locator('button:has-text("Enviar")').click();
  await pageM.locator("text=marcado como em rota").first().waitFor({ timeout: 15000 });
  const stRota = await aguardar(lerStatus, (s) => s === "em_rota");
  check("I3 status em_rota", stRota === "em_rota", stRota);

  await rowG.locator('button:has-text("Entregue")').click();
  await pageM.locator("text=marcado como entregue").first().waitFor({ timeout: 15000 });
  const stEnt = await aguardar(lerStatus, (s) => s === "entregue");
  check("I4 status entregue", stEnt === "entregue", stEnt);
  const filaVazia = await aguardar(
    async () => await pageM.locator('tr:has-text("Comprador E2E")').count(),
    (n) => n === 0
  );
  check("I5 pedido saiu da fila apos entrega", filaVazia === 0, `n=${filaVazia}`);
  const { count: auditorias } = await admin
    .from("audit_log")
    .select("*", { count: "exact", head: true })
    .eq("action", "logistica.avancar")
    .eq("entity_id", pedidoG);
  check("I6 transicoes auditadas (3)", auditorias === 3, `n=${auditorias}`);

  // J) transicao invalida bloqueada pelo banco
  const { error: errTrans } = await admin
    .from("orders")
    .update({ status: "pago" })
    .eq("id", pedidoG)
    .eq("status", "entregue");
  check("J1 TRANSICAO_INVALIDA no banco", (errTrans?.message || "").includes("TRANSICAO_INVALIDA"), (errTrans?.message || "").slice(0, 60));

  // K) RBAC: /logistica exige papel operacional (role flip no perfil do
  // comprador — o LoginForm já bloqueia login de papel não-operacional)
  const rCompLog = await page.goto(BASE + "/logistica", { waitUntil: "domcontentloaded" });
  check("K1 vendedor (operacional) abre /logistica", rCompLog?.status() === 200, `status=${rCompLog?.status()}`);
  await admin.from("profiles").update({ role: "fornecedor" }).eq("id", userId);
  const rBloq = await page.goto(BASE + "/logistica", { waitUntil: "domcontentloaded" });
  check("K2 papel nao-operacional bloqueado (403)", rBloq?.status() === 403, `status=${rBloq?.status()}`);
  await admin.from("profiles").update({ role: "vendedor" }).eq("id", userId);
  const rRest = await page.goto(BASE + "/produtos", { waitUntil: "domcontentloaded" });
  check("K3 papel restaurado (200)", rRest?.status() === 200, `status=${rRest?.status()}`);

  // L) limpeza
  await admin.rpc("release_order_stock", { p_order_id: pedidoG });
  const restante = await lerEstoque(itemId);
  if (restante && restante.stock_available !== 0) {
    await admin.rpc("register_stock_movement", {
      p_item_id: itemId, p_type: "ajuste", p_quantity: -Number(restante.stock_available),
      p_reference_type: "manual", p_reference_id: null, p_notes: "cleanup E2E F4", p_created_by: null,
    });
  }
  await admin.from("catalog_items").update({ active: false }).eq("id", itemId);
  const pids = await apagarPedidosDosClientes(emails);
  await admin.from("webhook_events").delete().in("external_id", WEBHOOK_IDS);
  await admin.from("audit_log").delete().eq("entity", "orders").in("entity_id", [...pids, pedidoG, pedidoX, pedidoY].filter(Boolean));
  await admin.from("audit_log").delete().eq("entity", "catalog_items").eq("entity_id", itemId);
  await limparUsuarios(emails);

  const itemFinal = await admin.from("catalog_items").select("active").eq("id", itemId).maybeSingle();
  const estoqueFinal = await lerEstoque(itemId);
  const userFinal = await acharUser(EMAIL_COMP);
  const { data: pedidosFinal } = await admin.from("orders").select("id").in("customer_id", (await admin.from("customers").select("id").in("email", emails)).data?.map((c) => c.id) ?? []);
  check(
    "L1 limpeza: item oculto, saldo 0, usuarios e pedidos removidos",
    itemFinal.data?.active === false && Number(estoqueFinal?.stock_available) === 0 && !userFinal && (pedidosFinal ?? []).length === 0,
    JSON.stringify({ active: itemFinal.data?.active, saldo: estoqueFinal?.stock_available, user: !!userFinal, pedidos: (pedidosFinal ?? []).length })
  );

  await browser.close();
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch(async (e) => {
  console.error("ERRO FATAL:", e);
  process.exit(2);
});
