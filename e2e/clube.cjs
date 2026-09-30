/* E2E F7 - Clube de assinantes (gate de aceite local).
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido
 * (MP_WEBHOOK_SECRET + MP_MOCK=1 para o webhook local).
 * Rode tudo juntos com: npm run e2e
 * Cobre: planos publicos do /clube, assinatura pelo fluxo da UI (pendente),
 * ativacao via webhook preapproval assinado (HMAC + modo mock) idempotente,
 * painel do assinante, beneficio no checkout (desconto aplicado no total do
 * pedido), gestao de planos no painel com RBAC, cancelamento encerrando o
 * ciclo e limpeza. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const { createHmac } = require("crypto");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_COMP = "e2e-comprador@nuvem-de-papel.com.br";
const SENHA_COMP = "E2e#2026Test";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const SKU_CLUBE = "SKU-E2E-CLUBE";
const NOME_CLUBE = "Item E2E Clube";
const PLAN_CODE = "papel";
const WEBHOOK_IDS = ["mock-pre-fantasma"];

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

async function acharUser(email) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users || []).find((u) => (u.email || "").toLowerCase() === email) || null;
}

async function login(page, email, senha) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

async function enviarWebhookPreapproval(preId, status) {
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = "e2e-clube-req";
  const manifesto = `id:${preId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", env.MP_WEBHOOK_SECRET).update(manifesto).digest("hex");
  const corpo = JSON.stringify({ type: "preapproval", data: { id: preId }, status });
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

async function preencherCheckout(page) {
  await page.goto(BASE + "/checkout", { waitUntil: "domcontentloaded" });
  await page.fill('input[placeholder="Nome completo"]', "Comprador E2E");
  await page.fill('input[placeholder="00000-000"]', "01310-100");
  await page.fill('input[placeholder="123"]', "2000");
  await page.locator('label:has-text("Rua") input').first().fill("Rua Augusta");
  await page.locator('label:has-text("Bairro") input').first().fill("Consolacao");
  await page.locator('label:has-text("Cidade") input').first().fill("Sao Paulo");
  await page.locator('label:has-text("UF") input').first().fill("SP");
}

async function aguardar(fn, cond, tentativas = 20) {
  for (let i = 0; i < tentativas; i++) {
    const v = await fn();
    if (cond(v)) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  return await fn();
}

async function garantirComprador() {
  let u = await acharUser(EMAIL_COMP);
  if (!u) {
    const criado = await admin.auth.admin.createUser({
      email: EMAIL_COMP,
      password: SENHA_COMP,
      email_confirm: true,
    });
    const userId = criado.data.user?.id;
    if (!userId) throw new Error("falha ao criar comprador E2E");
    await admin.from("profiles").insert({
      id: userId,
      tenant_id: TENANT,
      email: EMAIL_COMP,
      full_name: "Comprador E2E",
      role: "vendedor",
      status: "ativo",
    });
    u = { id: userId };
  }
  return u;
}

async function prepararItem() {
  let { data: item } = await admin
    .from("catalog_items")
    .select("id, active")
    .eq("sku", SKU_CLUBE)
    .maybeSingle();
  if (!item) {
    const { data: novo, error } = await admin
      .from("catalog_items")
      .insert({ tenant_id: TENANT, sku: SKU_CLUBE, name: NOME_CLUBE, category: "E2E", active: true })
      .select("id")
      .single();
    if (error) throw new Error("falha ao criar item E2E clube: " + error.message);
    await admin.from("item_prices").insert({
      item_id: novo.id,
      channel: "varejo",
      price: 10,
      min_quantity: 1,
    });
    item = { id: novo.id, active: true };
  } else if (!item.active) {
    await admin.from("catalog_items").update({ active: true }).eq("id", item.id);
  }
  const { data: estoque } = await admin
    .from("item_stock")
    .select("stock_available")
    .eq("item_id", item.id)
    .maybeSingle();
  const saldo = Number(estoque?.stock_available ?? 0);
  if (saldo !== 0) {
    const { error } = await admin.rpc("register_stock_movement", {
      p_item_id: item.id,
      p_type: "ajuste",
      p_quantity: -saldo,
      p_reference_type: "manual",
      p_reference_id: null,
      p_notes: "reset E2E F7",
      p_created_by: null,
    });
    if (error) throw new Error("reset de estoque falhou: " + error.message);
  }
  const { error: errEntrada } = await admin.rpc("register_stock_movement", {
    p_item_id: item.id,
    p_type: "entrada",
    p_quantity: 1,
    p_reference_type: "manual",
    p_reference_id: null,
    p_notes: "seed E2E F7",
    p_created_by: null,
  });
  if (errEntrada) throw new Error("seed de estoque falhou: " + errEntrada.message);
  return item.id;
}

async function limparPedidosDoUsuario(userId) {
  const { data: pedidos } = await admin.from("orders").select("id, status").eq("user_id", userId);
  for (const p of pedidos ?? []) {
    if (["aguardando_pagamento", "pago", "processando"].includes(p.status)) {
      await admin.rpc("release_order_stock", { p_order_id: p.id });
    }
    await admin.from("order_items").delete().eq("order_id", p.id);
    await admin.from("orders").delete().eq("id", p.id);
  }
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    // setup --------------------------------------------------------------
    await admin
      .from("club_plans")
      .update({ discount_pct: 5, active: true })
      .eq("tenant_id", TENANT)
      .eq("code", PLAN_CODE);
    const comprador = await garantirComprador();
    await admin.from("club_subscriptions").delete().eq("profile_id", comprador.id);
    await limparPedidosDoUsuario(comprador.id);
    await admin.from("webhook_events").delete().in("external_id", WEBHOOK_IDS);
    const itemId = await prepararItem();

    const { data: planoPapel } = await admin
      .from("club_plans")
      .select("id, name, price_monthly, discount_pct")
      .eq("tenant_id", TENANT)
      .eq("code", PLAN_CODE)
      .single();
    if (!planoPapel) throw new Error("seed dos planos ausente (migration 0012 aplicada?)");

    // A) planos publicos --------------------------------------------------
    const rAnon = await fetch(BASE + "/clube");
    check("A1 /clube abre para anônimo", rAnon.status === 200, `status=${rAnon.status}`);
    const htmlAnon = await rAnon.text();
    check("A2 banner do Clube presente", htmlAnon.includes("Clube Nuvem de Papel"));
    const { count: nPlanos } = await admin
      .from("club_plans")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", TENANT)
      .eq("active", true);
    check("A3 seed com 3 planos ativos", nPlanos === 3, `n=${nPlanos}`);

    const ctxAnon = await browser.newContext();
    const pageAnon = await ctxAnon.newPage();
    await pageAnon.goto(BASE + "/clube", { waitUntil: "domcontentloaded" });
    check(
      "A4 visitante sem conta vê 'Entrar e assinar'",
      (await pageAnon.locator('a:has-text("Entrar e assinar")').count()) >= 1
    );
    await ctxAnon.close();

    // B) assinatura pela UI ------------------------------------------------
    const ctxComp = await browser.newContext();
    const page = await ctxComp.newPage();
    await login(page, EMAIL_COMP, SENHA_COMP);
    await page.goto(BASE + "/clube", { waitUntil: "domcontentloaded" });
    const btnAssinar = page.locator('button:has-text("Assinar agora")').first();
    check("B1 assinante logado vê 'Assinar agora'", await btnAssinar.isVisible().catch(() => false));
    await btnAssinar.click();
    await page.waitForURL(/\/conta\/assinatura/, { timeout: 20000 });
    check("B2 navegou para o painel da assinatura", page.url().includes("/conta/assinatura"), page.url());

    const pendente = await aguardar(
      () =>
        admin
          .from("club_subscriptions")
          .select("id, status, mp_preapproval_id, plan_id")
          .eq("tenant_id", TENANT)
          .eq("profile_id", comprador.id)
          .maybeSingle(),
      (r) => r.data
    );
    check(
      "B3 assinatura pendente criada com preapproval mock",
      pendente.data?.status === "pendente" &&
        String(pendente.data?.mp_preapproval_id || "").startsWith("mock-pre-"),
      JSON.stringify(pendente.data)
    );
    const assinaturaId = pendente.data?.id;

    await page.goto(BASE + "/clube", { waitUntil: "domcontentloaded" });
    check(
      "B4 /clube já mostra o acesso ao painel",
      (await page.locator('a:has-text("Ver minha assinatura")').count()) >= 1
    );

    // C) ativacao via webhook preapproval ---------------------------------
    const hook1 = await enviarWebhookPreapproval(pendente.data.mp_preapproval_id, "approved");
    check(
      "C1 webhook preapproval assinado processado",
      hook1.status === 200 && hook1.json.status === "processado",
      JSON.stringify(hook1.json)
    );
    const ativa = await aguardar(
      () =>
        admin
          .from("club_subscriptions")
          .select("status, current_period_start, current_period_end")
          .eq("id", assinaturaId)
          .maybeSingle(),
      (r) => r.data?.status === "ativa"
    );
    check(
      "C2 assinatura ativa com periodo preenchido",
      ativa.data?.status === "ativa" &&
        !!ativa.data?.current_period_start &&
        !!ativa.data?.current_period_end,
      JSON.stringify(ativa.data)
    );
    const hook2 = await enviarWebhookPreapproval(pendente.data.mp_preapproval_id, "approved");
    check(
      "C3 replay do webhook e idempotente",
      hook2.status === 200 && hook2.json.status === "duplicado",
      JSON.stringify(hook2.json)
    );
    const hookFantasma = await enviarWebhookPreapproval("mock-pre-fantasma", "approved");
    check(
      "C4 preapproval desconhecido vira 200 (sem loop de retry)",
      hookFantasma.status === 200 && hookFantasma.json.status === "sem_assinatura",
      JSON.stringify(hookFantasma.json)
    );

    // D) painel do assinante ------------------------------------------------
    await page.goto(BASE + "/conta/assinatura", { waitUntil: "domcontentloaded" });
    const corpoPainel = (await page.textContent("body")) || "";
    check("D1 painel mostra o plano assinado", corpoPainel.includes(planoPapel.name));
    check("D2 painel mostra status Ativa", corpoPainel.includes("Ativa"));
    await page.goto(BASE + "/clube", { waitUntil: "domcontentloaded" });
    check(
      "D3 /clube logado aponta 'Minha assinatura'",
      (await page.locator('a:has-text("Minha assinatura")').count()) >= 1
    );

    // E) beneficio no checkout ---------------------------------------------
    await page.evaluate(() => window.localStorage.removeItem("ndp_carrinho_v1"));
    await page.goto(BASE + "/produtos", { waitUntil: "domcontentloaded" });
    await page.locator(`button[aria-label="Adicionar ${NOME_CLUBE}"]`).click();
    await preencherCheckout(page);
    const chkSalvar = page.locator('input[type="checkbox"]').first();
    if (await chkSalvar.isChecked()) await chkSalvar.uncheck();
    await page.click('button:has-text("Confirmar pedido")');
    await page.waitForURL(/\/conta\/pedidos\?novo=/, { timeout: 25000 });
    const pedidoId = new URL(page.url()).searchParams.get("novo");
    check("E1 pedido criado pelo fluxo do clube", !!pedidoId);
    const { data: pedido } = await admin
      .from("orders")
      .select("total_amount, discount_amount")
      .eq("id", pedidoId)
      .maybeSingle();
    check(
      "E2 desconto de 5% aplicado no total (10,00 → 9,50)",
      Number(pedido?.discount_amount) === 0.5 && Number(pedido?.total_amount) === 9.5,
      JSON.stringify(pedido)
    );

    // F) gestao de planos no painel (RBAC) ----------------------------------
    const ctxMaster = await browser.newContext();
    const pageM = await ctxMaster.newPage();
    await login(pageM, EMAIL_MASTER, SENHA_MASTER);
    await pageM.goto(BASE + "/configuracoes/clube", { waitUntil: "domcontentloaded" });
    const corpoMaster = (await pageM.textContent("body")) || "";
    check("F1 master abre a gestão do Clube", corpoMaster.includes("Novo plano"));
    const cardPlano = pageM.locator("section").filter({ hasText: `código: ${PLAN_CODE}` }).first();
    await cardPlano.locator("label", { hasText: "Desconto (%)" }).locator("input").fill("6");
    await cardPlano.locator('button:has-text("Salvar plano")').click();
    await pageM.locator('text= salvo.').first().waitFor({ timeout: 15000 });
    const aposSalvar = await aguardar(
      () =>
        admin
          .from("club_plans")
          .select("discount_pct")
          .eq("tenant_id", TENANT)
          .eq("code", PLAN_CODE)
          .maybeSingle(),
      (r) => Number(r.data?.discount_pct) === 6
    );
    check("F2 desconto editado pelo painel persistiu (6%)", Number(aposSalvar.data?.discount_pct) === 6, JSON.stringify(aposSalvar.data));

    const ctxC2 = await browser.newContext();
    const pageC2 = await ctxC2.newPage();
    await login(pageC2, EMAIL_COMP, SENHA_COMP);
    const respC2 = await pageC2.goto(BASE + "/configuracoes/clube", { waitUntil: "domcontentloaded" });
    // middleware devolve 403 direto; a page tem o redirect(/crm) como rede
    const barrado = respC2.status() === 403 || pageC2.url().includes("/crm");
    check(
      "F3 vendedor é barrado (RBAC 403 ou /crm)",
      barrado,
      `status=${respC2.status()} url=${pageC2.url()}`
    );
    await ctxC2.close();

    // G) cancelamento encerra o ciclo ---------------------------------------
    page.on("dialog", (d) => d.accept());
    await page.goto(BASE + "/conta/assinatura", { waitUntil: "domcontentloaded" });
    const btnCancelar = page.locator('button:has-text("Cancelar assinatura")');
    check("G1 painel oferece cancelamento", await btnCancelar.isVisible().catch(() => false));
    await btnCancelar.click();
    const cancelada = await aguardar(
      () =>
        admin
          .from("club_subscriptions")
          .select("status")
          .eq("id", assinaturaId)
          .maybeSingle(),
      (r) => r.data?.status === "cancelada"
    );
    check("G2 assinatura cancelada no banco", cancelada.data?.status === "cancelada", JSON.stringify(cancelada.data));
    const corpoPos = await aguardar(
      async () => (await page.textContent("body")) || "",
      (t) => t.includes("Cancelada")
    );
    check("G3 painel mostra status Cancelada", corpoPos.includes("Cancelada"));
    await page.goto(BASE + "/clube", { waitUntil: "domcontentloaded" });
    check(
      "G4 /clube libera assinar de novo",
      (await page.locator('button:has-text("Assinar agora")').count()) >= 1
    );

    // H) limpeza -------------------------------------------------------------
    await limparPedidosDoUsuario(comprador.id);
    await admin.from("club_subscriptions").delete().eq("profile_id", comprador.id);
    await admin.from("webhook_events").delete().in("external_id", WEBHOOK_IDS);
    await admin
      .from("club_plans")
      .update({ discount_pct: 5 })
      .eq("tenant_id", TENANT)
      .eq("code", PLAN_CODE);
    const { data: pedidosRestantes } = await admin
      .from("orders")
      .select("id, customer_id")
      .eq("user_id", comprador.id);
    if ((pedidosRestantes ?? []).length > 0) {
      console.log(`AVISO - ${pedidosRestantes.length} pedido(s) do comprador restaram`);
    }
    await ctxMaster.close();
    await ctxComp.close();
  } finally {
    await browser.close();
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nresumo: ${resultados.length} checks, ${falhas} falhas`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
