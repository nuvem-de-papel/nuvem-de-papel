/* E2E F3 — carrinho → checkout → pedido (gate de aceite local).
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Rode tudo juntos com: npm run e2e
 * Cobre: carrinho/UI, preço FORJADO do cliente IGNORADO (servidor manda),
 * pedido+itens+endereço+cliente criados, /conta/pedidos com RLS (outro
 * usuário não vê), webhook exige assinatura (401 sem ela), limpeza total. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_COMP = "e2e-comprador@nuvem-de-papel.com.br";
const SENHA_COMP = "E2e#2026Test";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";

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
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

const resultados = [];
function check(nome, cond, detalhe = "") {
  resultados.push({ ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"} - ${nome}${detalhe ? " | " + detalhe : ""}`);
}

async function acharUser(email) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users || []).find((u) => (u.email || "").toLowerCase() === email) || null;
}

async function limpar() {
  const u = await acharUser(EMAIL_COMP);
  if (!u) return;
  const { data: pedidos } = await admin.from("orders").select("id").eq("user_id", u.id);
  for (const p of pedidos ?? []) {
    await admin.from("order_items").delete().eq("order_id", p.id);
    await admin.from("orders").delete().eq("id", p.id);
  }
  await admin.from("addresses").delete().eq("user_id", u.id);
  await admin.from("customers").delete().eq("email", EMAIL_COMP);
  await admin.from("profiles").delete().eq("id", u.id);
  await admin.auth.admin.deleteUser(u.id);
}

async function login(page, email, senha) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

(async () => {
  await limpar();

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

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // A) checkout sem sessão → login
  const rAnon = await fetch(BASE + "/checkout", { redirect: "manual" });
  check("A1 checkout anonimo -> 307 login", rAnon.status === 307 && (rAnon.headers.get("location") || "").includes("/login"), `status=${rAnon.status}`);

  // B) carrinho: adicionar 2x do mesmo item → badge 2
  await login(page, EMAIL_COMP, SENHA_COMP);
  await page.goto(BASE + "/produtos", { waitUntil: "domcontentloaded" });
  const btnAdd = page.locator('button[aria-label^="Adicionar"]').first();
  await btnAdd.waitFor({ timeout: 15000 });
  await btnAdd.click();
  await btnAdd.click();
  const badge = await page.locator('a[aria-label^="Carrinho com"]').getAttribute("aria-label");
  check("B1 badge do carrinho = 2", (badge || "").includes("2"), badge);

  await page.goto(BASE + "/carrinho", { waitUntil: "domcontentloaded" });
  check("B2 /carrinho lista o item", (await page.locator("text=×").count()) > 0 || (await page.locator('button[aria-label^="Remover"]').count()) > 0);

  // preço REAL do banco + preço forjado no localStorage
  const carrinho = JSON.parse(await page.evaluate(() => window.localStorage.getItem("ndp_carrinho_v1") || "[]"));
  check("B3 carrinho tem 1 SKU com qty 2", carrinho.length === 1 && carrinho[0].qty === 2, JSON.stringify(carrinho));
  const itemId = carrinho[0].id;
  const { data: precoRow } = await admin.from("item_prices").select("price").eq("item_id", itemId).eq("channel", "varejo").limit(1).maybeSingle();
  const precoReal = Number(precoRow.price);
  const totalEsperado = precoReal * 2;

  carrinho[0].price = 0.01;
  await page.evaluate((c) => window.localStorage.setItem("ndp_carrinho_v1", JSON.stringify(c)), carrinho);

  // C) checkout: endereço novo, pix, salvar endereço
  await page.goto(BASE + "/checkout", { waitUntil: "domcontentloaded" });
  check("C1 /checkout abre logado", (await page.locator('button:has-text("Confirmar pedido")').count()) > 0);
  await page.fill('input[placeholder="Nome completo"]', "Comprador E2E");
  await page.fill('input[placeholder="00000-000"]', "01310-100");
  await page.fill('input[placeholder="123"]', "1000");
  await page.locator('label:has-text("Rua") input').first().fill("Avenida Paulista");
  await page.locator('label:has-text("Bairro") input').first().fill("Bela Vista");
  await page.locator('label:has-text("Cidade") input').first().fill("São Paulo");
  await page.locator('label:has-text("UF") input').first().fill("SP");
  await page.click('button:has-text("Confirmar pedido")');
  await page.waitForURL(/\/conta\/pedidos\?novo=/, { timeout: 25000 });
  const pedidoId = new URL(page.url()).searchParams.get("novo");
  check("C2 redireciona para meus pedidos com pedido", !!pedidoId, page.url());
  const banner = (await page.textContent("body")) || "";
  check("C3 banner de pagamento pendente", banner.includes("pagamento online será ativado"));

  // D) banco: pedido/itens/endereço/cliente corretos E preço real (ignora forja)
  const { data: pedido } = await admin.from("orders").select("*").eq("id", pedidoId).maybeSingle();
  check("D1 pedido existe e aguarda pagamento", pedido?.status === "aguardando_pagamento", JSON.stringify({ status: pedido?.status }));
  check("D2 total = preço REAL do servidor (forja ignorada)", Number(pedido?.total_amount) === totalEsperado, `db=${pedido?.total_amount} esperado=${totalEsperado}`);
  check("D3 pedido ligado ao usuario + canal varejo + pix", pedido?.user_id === userId && pedido?.channel === "varejo" && pedido?.payment_method === "pix");
  check("D4 snapshot de endereco salvo", pedido?.address_snapshot?.uf === "SP" && pedido?.address_snapshot?.cidade === "São Paulo", JSON.stringify(pedido?.address_snapshot));
  const { data: itensDb } = await admin.from("order_items").select("*").eq("order_id", pedidoId);
  check("D5 order_items com snapshot e qty 2", itensDb?.length === 1 && itensDb[0].quantity === 2 && Number(itensDb[0].unit_price) === precoReal, JSON.stringify(itensDb));
  const { data: enderecos } = await admin.from("addresses").select("*").eq("user_id", userId);
  check("D6 endereco salvo para reuso", enderecos?.length === 1 && enderecos[0].cep === "01310100");
  const { data: cliente } = await admin.from("customers").select("*").eq("email", EMAIL_COMP).maybeSingle();
  check("D7 customer upsert criado", !!cliente);

  // E) /conta/pedidos mostra o pedido
  const temPedido = (await page.textContent("body")) || "";
  check("E1 pedido visivel em /conta/pedidos", temPedido.includes("Aguardando pagamento") && temPedido.includes(pedidoId.slice(0, 8).toUpperCase()));

  // F) RLS: dono vê 1 pedido; master (sem pedidos) vê 0
  const sessComp = await anon.auth.signInWithPassword({ email: EMAIL_COMP, password: SENHA_COMP });
  const sessMaster = await anon.auth.signInWithPassword({ email: EMAIL_MASTER, password: SENHA_MASTER });
  const comoComp = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${sessComp.data.session.access_token}` } },
    auth: { persistSession: false },
  });
  const comoMaster = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${sessMaster.data.session.access_token}` } },
    auth: { persistSession: false },
  });
  const { data: vComp } = await comoComp.from("orders").select("id");
  const { data: vMaster } = await comoMaster.from("orders").select("id");
  check("F1 RLS: dono ve os proprios pedidos", (vComp ?? []).length >= 1, `n=${(vComp ?? []).length}`);
  check("F2 RLS: outro usuario nao ve pedidos alheios", (vMaster ?? []).length === 0, `n=${(vMaster ?? []).length}`);

  // G) webhook com segredo local configurado: sem assinatura → 401
  const rHook = await fetch(BASE + "/api/webhooks/mercadopago", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "payment", data: { id: "123" } }),
  });
  check("G1 webhook sem assinatura (segredo ativo) -> 401", rHook.status === 401, `status=${rHook.status}`);

  // H) limpeza
  await limpar();
  const depois = await acharUser(EMAIL_COMP);
  const { data: pedidosRestantes } = await admin.from("orders").select("id").eq("customer_id", cliente?.id ?? "00000000-0000-0000-0000-000000000000");
  check("H1 dados de teste removidos", !depois && (pedidosRestantes ?? []).length === 0);

  await browser.close();
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch(async (e) => {
  console.error("ERRO FATAL:", e);
  try { await limpar(); } catch {}
  process.exit(2);
});
