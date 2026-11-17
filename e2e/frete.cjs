/* E2E FRETE (0028) — cotação Correios na tabela local + checkout.
 * Requisitos: npm run build && npm run start (:3000) + matriz importada
 * (node scripts/importar-frete-correios.cjs → 160 linhas em freight_tabelas).
 * Cobre: opções PAC/SEDEX vindas da TABELA (valor do servidor), escolha de
 * frete OBRIGATÓRIA (sem escolha não fecha), pedido com PAC grava
 * orders.frete + total com frete, retirada grava frete 0, e peso > 20 kg
 * mostra aviso fail-closed sem opções de frete. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL = "e2e-frete@nuvem-de-papel.com.br";
const SENHA = "E2e#2026Test";
const TENANT = "00000000-0000-0000-0000-000000000001";
const CEP = "01310-100"; // região 0 (SP capital) — matriz coberta pelo importador
// vitrine nova (17/11/2026): a lista /produtos nao tem botao de carrinho e a
// vitrine le o saldo do CD. A suite usa item proprio (antes: o 1o da vitrine,
// que vazava reserva no ledger a cada rodada) e devolve CD e ledger no fim.
const { definirSaldoCd, restaurarSaldoCd, adicionarPelaPagina } = require("./_vitrine.cjs");
const SKU_FRETE = "SKU-E2E-FRETE";
const NOME_FRETE = "Caderno E2E Frete";
const PRECO_FRETE = 12;
let itemFreteId = null;
let saldoCdAntes = null;

const resultados = [];
function check(nome, ok, detalhe = "") {
  resultados.push({ nome, ok });
  console.log(`${ok ? "PASS" : "FAIL"} - ${nome}${detalhe ? ` | ${detalhe}` : ""}`);
}

function lerEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function brl(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const env = lerEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});

async function acharUser(email) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  return (data?.users ?? []).find((u) => u.email === email) ?? null;
}

async function limpar() {
  const u = await acharUser(EMAIL);
  if (!u) return;
  const { data: pedidos } = await admin.from("orders").select("id, status").eq("user_id", u.id);
  for (const p of pedidos ?? []) {
    // devolve a reserva antes de apagar (o ledger e imutavel e nao devolve sozinho)
    if (p.status === "aguardando_pagamento") await admin.rpc("release_order_stock", { p_order_id: p.id });
    await admin.from("order_items").delete().eq("order_id", p.id);
    await admin.from("orders").delete().eq("id", p.id);
  }
  await admin.from("addresses").delete().eq("user_id", u.id);
  await admin.from("customers").delete().eq("email", EMAIL);
  await admin.from("profiles").delete().eq("id", u.id);
  await admin.auth.admin.deleteUser(u.id);
}

async function login(page) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", EMAIL);
  await page.fill("#senha", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

async function prepararItem() {
  let { data: item } = await admin.from("catalog_items").select("id, active").eq("sku", SKU_FRETE).maybeSingle();
  if (!item) {
    const { data: novo, error } = await admin
      .from("catalog_items")
      .insert({ tenant_id: TENANT, sku: SKU_FRETE, name: NOME_FRETE, category: "E2E", active: true })
      .select("id")
      .single();
    if (error) throw new Error("falha ao criar item E2E frete: " + error.message);
    item = { id: novo.id, active: true };
  } else if (!item.active) {
    await admin.from("catalog_items").update({ active: true }).eq("id", item.id);
  }
  await admin.from("item_prices").delete().eq("item_id", item.id);
  const { error: errPreco } = await admin
    .from("item_prices")
    .insert({ item_id: item.id, channel: "varejo", price: PRECO_FRETE, min_quantity: 1 });
  if (errPreco) throw new Error("preco E2E frete falhou: " + errPreco.message);
  // ledger com folga para os 2 pedidos (D e E) reservarem
  const { data: est } = await admin.from("item_stock").select("stock_available").eq("item_id", item.id).maybeSingle();
  const disp = Number(est?.stock_available ?? 0);
  if (disp < 5) {
    await admin.rpc("register_stock_movement", {
      p_item_id: item.id, p_type: "entrada", p_quantity: 5 - disp,
      p_reference_type: "manual", p_reference_id: null, p_notes: "seed E2E frete", p_created_by: null,
    });
  }
  return item.id;
}

async function devolverItem() {
  if (!itemFreteId) return;
  const { data: est } = await admin.from("item_stock").select("stock_available").eq("item_id", itemFreteId).maybeSingle();
  const disp = Number(est?.stock_available ?? 0);
  if (disp > 0) {
    await admin.rpc("register_stock_movement", {
      p_item_id: itemFreteId, p_type: "ajuste", p_quantity: -disp,
      p_reference_type: "manual", p_reference_id: null, p_notes: "cleanup E2E frete", p_created_by: null,
    });
  }
  await restaurarSaldoCd(admin, itemFreteId, saldoCdAntes);
  await admin.from("catalog_items").update({ active: false }).eq("id", itemFreteId);
}

async function addItemAoCarrinho(page) {
  await adicionarPelaPagina(page, BASE, SKU_FRETE, 1);
  const cart = JSON.parse(await page.evaluate(() => window.localStorage.getItem("ndp_carrinho_v1") || "[]"));
  return cart[0];
}

async function preencherEnderecoNovo(page) {
  await page.goto(BASE + "/checkout", { waitUntil: "domcontentloaded" });
  await page.fill('input[placeholder="Nome completo"]', "Comprador Frete E2E");
  await page.fill('input[placeholder="00000-000"]', CEP);
  await page.fill('input[placeholder="123"]', "1000");
  await page.locator('label:has-text("Rua") input').first().fill("Avenida Paulista");
  await page.locator('label:has-text("Bairro") input').first().fill("Bela Vista");
  await page.locator('label:has-text("Cidade") input').first().fill("São Paulo");
  await page.locator('label:has-text("UF") input').first().fill("SP");
}

// mesma regra do servidor (actions.ts cotarInterno): menor faixa >= peso, por serviço
async function esperadoDaTabela(itemId, qty) {
  const { data: fisc } = await admin
    .from("item_fiscal_data")
    .select("weight_kg, weight_gross_kg")
    .eq("item_id", itemId)
    .maybeSingle();
  const pesoUnit = Number(fisc?.weight_gross_kg ?? fisc?.weight_kg ?? 0) || 0.3;
  const peso = Math.max(0.3, Math.round(pesoUnit * qty * 100) / 100);

  const { data: empresa } = await admin
    .from("tenant_company")
    .select("endereco")
    .eq("tenant_id", TENANT)
    .maybeSingle();
  const origem = String(empresa?.endereco?.cep ?? "").replace(/\D/g, "");

  const { data: linhas } = await admin
    .from("freight_tabelas")
    .select("servico, valor, prazo_dias, peso_ate")
    .eq("tenant_id", TENANT)
    .eq("origem_cep", origem)
    .eq("destino_regiao", CEP.replace(/\D/g, "")[0])
    .gte("peso_ate", peso)
    .order("peso_ate", { ascending: true });

  const porServico = {};
  for (const svc of ["pac", "sedex"]) {
    const l = (linhas ?? []).find((x) => x.servico === svc);
    if (l) porServico[svc] = { valor: Number(l.valor), prazo: Number(l.prazo_dias) };
  }
  return { peso, porServico, origem };
}

(async () => {
  await limpar();
  itemFreteId = await prepararItem();
  saldoCdAntes = await definirSaldoCd(admin, itemFreteId, 10);

  // A) matriz importada (pré-condição do teste)
  const { count: nLinhas } = await admin
    .from("freight_tabelas")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  check(
    "A1 matriz freight_tabelas importada (160 linhas)",
    (nLinhas ?? 0) >= 160,
    `n=${nLinhas} — se 0, rode: node scripts/importar-frete-correios.cjs`
  );

  const criado = await admin.auth.admin.createUser({
    email: EMAIL,
    password: SENHA,
    email_confirm: true,
  });
  const userId = criado.data.user?.id;
  if (!userId) throw new Error("falha ao criar comprador E2E de frete");
  await admin.from("profiles").insert({
    id: userId,
    tenant_id: TENANT,
    email: EMAIL,
    full_name: "Comprador Frete E2E",
    role: "vendedor",
    status: "ativo",
  });

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // B) cotação na UI vem da tabela (valor/prazo do servidor)
  await login(page);
  const item = await addItemAoCarrinho(page);
  const qty = item?.qty ?? 1;
  const esp = await esperadoDaTabela(item.id, qty);
  check(
    "B1 existe linha na matriz para o peso/CEP",
    !!esp.porServico.pac && !!esp.porServico.sedex,
    `peso=${esp.peso}kg opcoes=${JSON.stringify(esp.porServico)}`
  );

  await preencherEnderecoNovo(page);
  const entrega = page.locator('[data-testid="entrega-frete"]');
  await entrega.locator('label:has-text("Retirar na loja")').waitFor({ timeout: 30000 });
  const textoPac = await entrega.locator('label:has-text("PAC")').textContent();
  const textoSedex = await entrega.locator('label:has-text("SEDEX")').textContent();
  check(
    "B2 UI mostra PAC com valor/prazo da tabela",
    textoPac.includes(brl(esp.porServico.pac.valor)) && textoPac.includes(String(esp.porServico.pac.prazo)),
    `ui="${(textoPac || "").trim()}" esperado=${brl(esp.porServico.pac.valor)}`
  );
  check(
    "B3 UI mostra SEDEX com valor/prazo da tabela",
    textoSedex.includes(brl(esp.porServico.sedex.valor)) && textoSedex.includes(String(esp.porServico.sedex.prazo)),
    `ui="${(textoSedex || "").trim()}" esperado=${brl(esp.porServico.sedex.valor)}`
  );

  // C) escolha obrigatória: sem clicar em nada, confirmar é recusado
  await page.click('button:has-text("Confirmar pedido")');
  const corpoErro = (await page.textContent("body")) || "";
  check(
    "C1 sem escolha de frete o checkout recusa",
    corpoErro.includes("Escolha a modalidade de entrega") && page.url().includes("/checkout"),
    page.url()
  );

  // D) escolhe PAC → pedido nasce com frete da tabela e total = itens + frete
  await entrega.locator('label:has-text("PAC")').click();
  await page.click('button:has-text("Confirmar pedido")');
  await page.waitForURL(/\/conta\/pedidos\?novo=/, { timeout: 25000 });
  const pedidoId = new URL(page.url()).searchParams.get("novo");

  const { data: itemPreco } = await admin
    .from("item_prices")
    .select("price")
    .eq("item_id", item.id)
    .eq("channel", "varejo")
    .limit(1)
    .maybeSingle();
  const precoReal = Number(itemPreco.price);
  const { data: pedido } = await admin.from("orders").select("*").eq("id", pedidoId).maybeSingle();
  const freteDb = Number(pedido?.frete ?? -1);
  const totalEsperado = Math.round((precoReal * qty + esp.porServico.pac.valor) * 100) / 100;
  check(
    "D1 orders.frete = valor PAC da tabela",
    freteDb === Math.round(esp.porServico.pac.valor * 100) / 100,
    `db=${freteDb} tabela=${esp.porServico.pac.valor}`
  );
  check(
    "D2 total_amount = itens + frete",
    Number(pedido?.total_amount) === totalEsperado,
    `db=${pedido?.total_amount} esperado=${totalEsperado}`
  );
  const { data: audit } = await admin
    .from("audit_log")
    .select("after")
    .eq("entity_id", pedidoId)
    .eq("action", "pedido.criar")
    .limit(1)
    .maybeSingle();
  check(
    "D3 audit_log grava modalidade/valor do frete",
    audit?.after?.frete?.modalidade === "pac" && Number(audit?.after?.frete?.valor) === freteDb,
    JSON.stringify(audit?.after?.frete)
  );

  // E) segunda compra: retirada → frete 0 e total só dos itens
  const item2 = await addItemAoCarrinho(page);
  await page.goto(BASE + "/checkout", { waitUntil: "domcontentloaded" });
  const entrega2 = page.locator('[data-testid="entrega-frete"]');
  await entrega2.locator('label:has-text("Retirar na loja")').waitFor({ timeout: 30000 });
  await entrega2.locator('label:has-text("Retirar na loja")').click();
  await page.click('button:has-text("Confirmar pedido")');
  await page.waitForURL(/\/conta\/pedidos\?novo=/, { timeout: 25000 });
  const pedido2Id = new URL(page.url()).searchParams.get("novo");
  const { data: pedido2 } = await admin.from("orders").select("*").eq("id", pedido2Id).maybeSingle();
  const total2 = Math.round(precoReal * (item2?.qty ?? 1) * 100) / 100;
  check("E1 retirada grava frete 0", Number(pedido2?.frete) === 0, `db=${pedido2?.frete}`);
  check(
    "E2 total da retirada = só os itens",
    Number(pedido2?.total_amount) === total2,
    `db=${pedido2?.total_amount} esperado=${total2}`
  );

  // F) peso > 20 kg → aviso fail-closed, sem PAC/SEDEX, retirada ainda disponível
  const itemF = await addItemAoCarrinho(page); // o checkout limpa o carrinho a cada pedido
  {
    const { data: fiscF } = await admin
      .from("item_fiscal_data")
      .select("weight_kg, weight_gross_kg")
      .eq("item_id", itemF.id)
      .maybeSingle();
    const pesoUnitF = Number(fiscF?.weight_gross_kg ?? fiscF?.weight_kg ?? 0) || 0.3;
    // qty p/ passar de 20 kg (max 99 do carrinho; com peso padrão 0.3kg = 70)
    const qtyF = Math.min(99, Math.floor(20 / pesoUnitF) + 1);
    const cart = JSON.parse(await page.evaluate(() => window.localStorage.getItem("ndp_carrinho_v1") || "[]"));
    if (cart.length > 0) {
      cart[0].qty = qtyF;
      await page.evaluate((c) => window.localStorage.setItem("ndp_carrinho_v1", JSON.stringify(c)), cart);
      await page.goto(BASE + "/checkout", { waitUntil: "domcontentloaded" });
      const entrega3 = page.locator('[data-testid="entrega-frete"]');
      await entrega3.locator('label:has-text("Retirar na loja")').waitFor({ timeout: 30000 });
      await page
        .locator('p:has-text("excede 20 kg")')
        .first()
        .waitFor({ timeout: 30000 });
      const temPac = (await entrega3.locator('label:has-text("PAC")').count()) > 0;
      const temSedex = (await entrega3.locator('label:has-text("SEDEX")').count()) > 0;
      check(
        "F1 peso acima de 20kg: aviso exibe e nenhuma opção de frete",
        !temPac && !temSedex,
        `qty=${qtyF} pesoUnit=${pesoUnitF} pac=${temPac} sedex=${temSedex}`
      );
      check(
        "F2 retirada continua disponivel como saida",
        (await entrega3.locator('label:has-text("Retirar na loja")').count()) > 0
      );
    } else {
      check("F1 peso acima de 20kg: aviso exibe e nenhuma opção de frete", false, "carrinho vazio inesperado");
      check("F2 retirada continua disponivel como saida", false, "carrinho vazio inesperado");
    }
  }

  // G) limpeza
  await limpar();
  await devolverItem();
  const depois = await acharUser(EMAIL);
  const { data: sobra } = await admin.from("orders").select("id").eq("user_id", userId);
  check("G1 dados de teste removidos", !depois && (sobra ?? []).length === 0);

  await browser.close();
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch(async (e) => {
  console.error("ERRO FATAL:", e);
  try { await limpar(); await devolverItem(); } catch {}
  process.exit(2);
});
