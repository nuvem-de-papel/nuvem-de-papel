/* E2E Venda manual (telefone/balcao) — 0040: venda COMPLETA sem caixa aberto.
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Rode tudo juntos com: npm run e2e (executa depois de vendas-v5).
 * Cobre: botao "Nova venda" na Vendas Detalhada, PF pix retira com desconto
 * (titulo liquidado + parcela paga), PJ fiado 3x com entrega (titulo aberto +
 * 3 parcelas na regua de cobranca + linha na Expedicao), cliente existente
 * pela busca com cartao 2x, origem "Manual" na coluna da aba Vendas,
 * idempotencia, trava de estoque; limpeza no fim. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const { t0Banco } = require("./_relogio-banco.cjs");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const SKU = "SKU-E2E-VMAN";
const NOME_ITEM = "Item E2E Venda Manual";
const PRECO_VAREJO = 25.9;
const PRECO_ATACADO = 20;
const SALDO_ALVO = 10;
const NOME_PF = "Cliente E2E PF VMan";
const CPF_PF = "52998224725";
const NOME_PJ = "Empresa E2E VMan Ltda";
const CNPJ_PJ = "11222333000181";

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

function r2(v) {
  return Math.round(v * 100) / 100;
}

async function main() {
  // seed: item controlado com precos + estoque --------------------------------
  let { data: item } = await admin
    .from("catalog_items")
    .select("id, active")
    .eq("sku", SKU)
    .maybeSingle();
  if (!item) {
    const { data: novo, error } = await admin
      .from("catalog_items")
      .insert({ tenant_id: TENANT, sku: SKU, name: NOME_ITEM, active: true })
      .select("id")
      .single();
    if (error) throw new Error("seed catalog_items: " + error.message);
    item = { id: novo.id, active: true };
  } else if (!item.active) {
    await admin.from("catalog_items").update({ active: true }).eq("id", item.id);
  }
  // item_prices tem PK de 4 colunas desde a 0009 - onConflict precisa da PK
  for (const [channel, price] of [["varejo", PRECO_VAREJO], ["atacado", PRECO_ATACADO]]) {
    await admin.from("item_prices").upsert(
      { item_id: item.id, channel, price, min_quantity: 1, valid_from: "1970-01-01T00:00:00Z" },
      { onConflict: "item_id,channel,min_quantity,valid_from" }
    );
  }
  const { data: est0 } = await admin
    .from("item_stock")
    .select("stock_available")
    .eq("item_id", item.id)
    .maybeSingle();
  const atual0 = est0 ? Number(est0.stock_available) : 0;
  if (atual0 !== SALDO_ALVO) {
    await admin.rpc("register_stock_movement", {
      p_item_id: item.id,
      p_type: "ajuste",
      p_quantity: SALDO_ALVO - atual0,
      p_reference_type: "manual",
      p_reference_id: null,
      p_notes: "seed E2E VMan",
      p_created_by: null,
    });
  }

  // t0 no RELOGIO DO BANCO (padrao f5: created_at tambem e now() do Supabase)
  const t0 = await t0Banco(admin, TENANT);
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await login(page, EMAIL_MASTER, SENHA_MASTER);

    // A) botao "Nova venda" na Vendas Detalhada --------------------------------
    await page.goto(BASE + "/vendas", { waitUntil: "domcontentloaded" });
    const btnNova = page.locator('a[aria-label="Nova venda"]');
    check("A1 /vendas tem o botao Nova venda", (await btnNova.count()) === 1);
    await btnNova.click();
    await page.waitForURL("**/vendas/nova", { timeout: 15000 });
    check("A2 abre /vendas/nova", page.url().endsWith("/vendas/nova"));
    check(
      "A3 os 4 blocos estao na tela (cliente/itens/pagamento/entrega)",
      (await page.locator('button[aria-label="Registrar venda"]').count()) === 1 &&
        (await page.locator('section[aria-label="Resumo da venda"]').count()) === 1
    );

    // B) venda 1: PF + pix + retira + desconto ----------------------------------
    await page.click('button[aria-label="Novo cliente na hora"]');
    await page.fill('input[aria-label="Nome completo"]', NOME_PF);
    await page.fill('input[aria-label="CPF"]', "529.982.247-25");
    await page.fill('input[aria-label="Telefone"]', "(11) 98765-4321");
    await page.fill('input[aria-label="Buscar produto"]', SKU);
    await page.click(`button[aria-label="Adicionar ${NOME_ITEM}"]`);
    await page.click(`button[aria-label="Aumentar ${NOME_ITEM}"]`); // 2 unidades
    await page.fill('input[aria-label="Desconto em reais"]', "5");
    // metodo pix ja vem selecionado; entrega ja vem em "retira"
    await page.click('button[aria-label="Registrar venda"]');
    const aviso1 = await page
      .locator('div[role="status"]')
      .innerText({ timeout: 15000 })
      .catch(() => "");
    check("B1 aviso de sucesso (retira no balcao)", /retirada no balcão/i.test(aviso1), aviso1.slice(0, 90));
    await page.waitForURL((u) => u.pathname === "/vendas", { timeout: 15000 }).catch(() => {});

    const { data: cliB } = await admin.from("customers").select("id").eq("documento", CPF_PF).maybeSingle();
    const { data: ped1 } = await admin
      .from("orders")
      .select("id, origem, etapa, status, payment_method, channel, total_amount, discount_amount, venda_numero, customer_id")
      .eq("tenant_id", TENANT)
      .eq("origem", "manual")
      .eq("customer_id", cliB?.id ?? "00000000-0000-0000-0000-000000000000")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const esp1 = r2(PRECO_VAREJO * 2 - 5);
    check(
      "B2 pedido: origem manual, etapa venda, pago, pix, total 46.80, numero V-",
      ped1?.origem === "manual" && ped1?.etapa === "venda" && ped1?.status === "pago" &&
        ped1?.payment_method === "pix" && ped1?.channel === "varejo" &&
        Number(ped1?.total_amount) === esp1 && Number(ped1?.discount_amount) === 5 &&
        /^V-/.test(ped1?.venda_numero ?? ""),
      JSON.stringify(ped1)
    );

    const { data: cli1 } = await admin
      .from("customers")
      .select("id, name, documento, telefone, ativo")
      .eq("id", ped1?.customer_id ?? "")
      .maybeSingle();
    check(
      "B3 cliente PF criado completo",
      cli1?.name === NOME_PF && cli1?.documento === CPF_PF && cli1?.telefone === "11987654321" && cli1?.ativo === true,
      JSON.stringify(cli1)
    );

    const { data: tit1 } = await admin
      .from("financial_titles")
      .select("id, status, source_type, source_id")
      .eq("source_id", ped1?.id ?? "")
      .eq("source_type", "manual")
      .maybeSingle();
    const { data: parc1 } = await admin
      .from("financial_installments")
      .select("status, paid_amount")
      .eq("title_id", tit1?.id ?? "");
    check(
      "B4 pix: titulo manual LIQUIDADO com parcela paga 46.80 (entra na régua de cobrança como quitado)",
      tit1?.status === "liquidado" && parc1?.length === 1 &&
        parc1[0].status === "liquidado" && Number(parc1[0].paid_amount) === esp1,
      JSON.stringify({ tit1, parc1 })
    );

    const { data: st1 } = await admin.from("item_stock").select("stock_available").eq("item_id", item.id).maybeSingle();
    check("B5 estoque baixou 2 (10->8)", Number(st1?.stock_available) === 8, `saldo=${st1?.stock_available}`);

    const { data: ent1 } = await admin.from("entregas").select("id").eq("order_id", ped1?.id ?? "");
    check("B6 retira: nenhuma linha de Expedicao", (ent1 ?? []).length === 0);

    const { data: aud1 } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_id", ped1?.id ?? "")
      .eq("action", "venda.manual");
    check("B7 acao auditada venda.manual", (aud1 ?? []).length === 1);

    // C) venda 2: PJ + fiado 3x + entrega ---------------------------------------
    await page.goto(BASE + "/vendas/nova", { waitUntil: "domcontentloaded" });
    await page.click('button[aria-label="Novo cliente na hora"]');
    await page.click('button[aria-label="Pessoa jurídica"]');
    await page.fill('input[aria-label="Razão social"]', NOME_PJ);
    await page.fill('input[aria-label="CNPJ"]', "11.222.333/0001-81");
    await page.fill('input[aria-label="Telefone"]', "(11) 3333-4444");
    await page.fill('input[aria-label="Buscar produto"]', SKU);
    await page.click(`button[aria-label="Adicionar ${NOME_ITEM}"]`);
    await page.click('button[aria-label="Canal atacado"]');
    await page.click('button[aria-label="Pagamento Fiado (a prazo)"]');
    await page.selectOption('select[aria-label="Parcelas"]', "3");
    await page.click('button[aria-label="Entregar no endereço"]');
    await page.fill('input[aria-label="Logradouro da entrega"]', "Rua das Flores");
    await page.fill('input[aria-label="Número da entrega"]', "123");
    await page.fill('input[aria-label="Bairro da entrega"]', "Centro");
    await page.fill('input[aria-label="Cidade da entrega"]', "Sao Paulo");
    await page.fill('input[aria-label="UF da entrega"]', "SP");
    await page.fill('input[aria-label="Transportadora"]', "E2E Transportes");
    await page.fill('input[aria-label="Observação da entrega"]', "portao azul");
    await page.click('button[aria-label="Registrar venda"]');
    const aviso2 = await page
      .locator('div[role="status"]')
      .innerText({ timeout: 15000 })
      .catch(() => "");
    check("C1 aviso de sucesso (com entrega agendada)", /entrega agendada/i.test(aviso2), aviso2.slice(0, 90));

    const { data: ped2 } = await admin
      .from("orders")
      .select("id, origem, payment_method, channel, condicao, total_amount, status, customer_id")
      .eq("tenant_id", TENANT)
      .eq("origem", "manual")
      .eq("payment_method", "fiado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    check(
      "C2 pedido fiado: atacado, condicao 3x, pago, total 20",
      ped2?.channel === "atacado" && ped2?.condicao === "3x" && ped2?.status === "pago" &&
        Number(ped2?.total_amount) === PRECO_ATACADO,
      JSON.stringify(ped2)
    );

    const { data: cli2 } = await admin.from("customers").select("name, documento").eq("id", ped2?.customer_id ?? "").maybeSingle();
    check(
      "C3 cliente PJ (razao social + CNPJ 14)",
      cli2?.name === NOME_PJ && cli2?.documento === CNPJ_PJ,
      JSON.stringify(cli2)
    );

    const { data: tit2 } = await admin
      .from("financial_titles")
      .select("id, status, principal_amount")
      .eq("source_id", ped2?.id ?? "")
      .maybeSingle();
    const { data: parc2 } = await admin
      .from("financial_installments")
      .select("number, status, due_date, principal_amount")
      .eq("title_id", tit2?.id ?? "")
      .order("number");
    const soma2 = (parc2 ?? []).reduce((a, p) => a + Number(p.principal_amount), 0);
    check(
      "C4 fiado: titulo ABERTO + 3 parcelas abertas somando 20 (regua de cobranca cobre)",
      tit2?.status === "aberto" && parc2?.length === 3 &&
        parc2.every((p) => p.status === "aberto") && r2(soma2) === PRECO_ATACADO,
      JSON.stringify(parc2)
    );

    const { data: ent2 } = await admin
      .from("entregas")
      .select("status, endereco, transportadora, observacao")
      .eq("order_id", ped2?.id ?? "")
      .maybeSingle();
    check(
      "C5 entrega aguardando com endereco/transportadora/observacao",
      ent2?.status === "aguardando" && ent2?.endereco?.logradouro === "Rua das Flores" &&
        ent2?.endereco?.uf === "SP" && ent2?.transportadora === "E2E Transportes" &&
        ent2?.observacao === "portao azul",
      JSON.stringify(ent2)
    );

    const { data: st2 } = await admin.from("item_stock").select("stock_available").eq("item_id", item.id).maybeSingle();
    check("C6 estoque baixou mais 1 (8->7)", Number(st2?.stock_available) === 7, `saldo=${st2?.stock_available}`);

    // D) venda 3: cliente EXISTENTE pela busca + cartao 2x -----------------------
    await page.goto(BASE + "/vendas/nova", { waitUntil: "domcontentloaded" });
    await page.fill('input[aria-label="Buscar cliente"]', CPF_PF);
    await page.click(`button[aria-label="Selecionar cliente ${NOME_PF}"]`);
    await page.fill('input[aria-label="Buscar produto"]', SKU);
    await page.click(`button[aria-label="Adicionar ${NOME_ITEM}"]`);
    await page.click('button[aria-label="Pagamento Cartão de crédito"]');
    await page.selectOption('select[aria-label="Parcelas"]', "2");
    await page.click('button[aria-label="Registrar venda"]');
    const aviso3 = await page
      .locator('div[role="status"]')
      .innerText({ timeout: 15000 })
      .catch(() => "");
    check("D1 venda com cliente existente registrada", /Venda registrada/i.test(aviso3), aviso3.slice(0, 90));

    const { data: ped3 } = await admin
      .from("orders")
      .select("id, payment_method, total_amount, customer_id")
      .eq("tenant_id", TENANT)
      .eq("origem", "manual")
      .eq("payment_method", "cartao")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    check(
      "D2 cartao: mesmo cliente da busca e total 25.90",
      ped3?.customer_id === ped1?.customer_id && Number(ped3?.total_amount) === PRECO_VAREJO,
      JSON.stringify(ped3)
    );
    const { data: tit3 } = await admin
      .from("financial_titles")
      .select("id, status")
      .eq("source_id", ped3?.id ?? "")
      .maybeSingle();
    const { data: parc3 } = await admin
      .from("financial_installments")
      .select("number, status, principal_amount")
      .eq("title_id", tit3?.id ?? "")
      .order("number");
    check(
      "D3 cartao: titulo aberto com 2 parcelas (12.95 x2)",
      tit3?.status === "aberto" && parc3?.length === 2 &&
        parc3.every((p) => p.status === "aberto" && Math.abs(Number(p.principal_amount) - 12.95) < 0.005),
      JSON.stringify(parc3)
    );

    // E) os pedidos aparecem na aba Vendas com a origem "Manual" ---------------
    await page.goto(BASE + "/vendas", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const corpo = await page.locator("body").innerText();
    check(
      "E1 aba Vendas mostra origem Manual (varejo e atacado)",
      corpo.toLowerCase().includes("manual · varejo") && corpo.toLowerCase().includes("manual · atacado")
    );

    // F) idempotencia (RPC direto, padrao f5) -----------------------------------
    const chave = `e2e-vman-${Date.now().toString(36)}-idem`;
    const argIdem = {
      p_items: [{ item_id: item.id, quantity: 1 }],
      p_payment_method: "pix",
      p_channel: "varejo",
      p_installments: 1,
      p_customer_id: ped1.customer_id,
      p_customer: null,
      p_entrega: null,
      p_idempotency_key: chave,
    };
    const r1i = await admin.rpc("manual_register_sale", argIdem);
    const r2i = await admin.rpc("manual_register_sale", argIdem);
    check(
      "F1 mesma chave nao cria duas vendas",
      !r1i.error && !r2i.error && r1i.data?.duplicate === false && r2i.data?.duplicate === true &&
        r1i.data?.order_id === r2i.data?.order_id,
      JSON.stringify({ e1: r1i.error?.message, e2: r2i.error?.message, d: r2i.data?.duplicate })
    );

    // G) trava de estoque --------------------------------------------------------
    const rEst = await admin.rpc("manual_register_sale", {
      p_items: [{ item_id: item.id, quantity: 99999 }],
      p_payment_method: "pix",
      p_channel: "varejo",
      p_installments: 1,
      p_customer_id: ped1.customer_id,
      p_customer: null,
      p_entrega: null,
      p_idempotency_key: `e2e-vman-${Date.now().toString(36)}-est`,
    });
    check(
      "G1 saldo insuficiente derruba a venda inteira",
      !!rEst.error && /ESTOQUE/.test(rEst.error.message),
      rEst.error?.message ?? "sem erro"
    );
    const { data: st3 } = await admin.from("item_stock").select("stock_available").eq("item_id", item.id).maybeSingle();
    check(
      "G2 a de 99.999 nao mexeu no saldo (7 -1 da venda D -1 da F = 5)",
      Number(st3?.stock_available) === 5,
      `saldo=${st3?.stock_available}`
    );

    // H) pedido manual fora do filtro "Importar da loja" --------------------------
    const { data: loja } = await admin
      .from("orders")
      .select("id")
      .eq("origem", "loja")
      .is("pedido_numero", null)
      .in("id", [ped1?.id, ped2?.id, ped3?.id].filter(Boolean));
    check("H1 nenhum pedido manual aparece em Importar da loja", (loja ?? []).length === 0);
  } finally {
    await browser.close();
  }

  // I) limpeza -------------------------------------------------------------------
  const { data: restos } = await admin
    .from("orders")
    .select("id")
    .eq("tenant_id", TENANT)
    .eq("origem", "manual")
    .gte("created_at", t0);
  const ids = (restos ?? []).map((r) => r.id);

  // títulos NÃO liquidados primeiro (parcelas abertas nao tem settlement);
  // os liquidados (pix) ficam - financial_settlements e imutavel (padrao f5).
  const { data: titulos } = await admin
    .from("financial_titles")
    .select("id, status")
    .in("source_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const abertos = (titulos ?? []).filter((t) => t.status !== "liquidado").map((t) => t.id);
  if (abertos.length) {
    await admin.from("financial_installments").delete().in("title_id", abertos);
    await admin.from("financial_titles").delete().in("id", abertos);
  }
  if (ids.length) await admin.from("orders").delete().in("id", ids);

  const { data: restosFim } = await admin
    .from("orders")
    .select("id")
    .eq("tenant_id", TENANT)
    .eq("origem", "manual")
    .gte("created_at", t0);
  check("I1 pedidos da execucao removidos", (restosFim ?? []).length === 0);

  const { data: cliFim } = await admin
    .from("customers")
    .select("id")
    .in("documento", [CPF_PF, CNPJ_PJ]);
  if ((cliFim ?? []).length) await admin.from("customers").delete().in("id", cliFim.map((c) => c.id));
  const { data: cliAinda } = await admin.from("customers").select("id").in("documento", [CPF_PF, CNPJ_PJ]);
  check("I2 clientes E2E removidos", (cliAinda ?? []).length === 0);

  const { data: estFim } = await admin
    .from("item_stock")
    .select("stock_available")
    .eq("item_id", item.id)
    .maybeSingle();
  if (Number(estFim?.stock_available) !== SALDO_ALVO) {
    await admin.rpc("register_stock_movement", {
      p_item_id: item.id,
      p_type: "ajuste",
      p_quantity: SALDO_ALVO - Number(estFim?.stock_available),
      p_reference_type: "manual",
      p_reference_id: null,
      p_notes: "limpeza E2E VMan",
      p_created_by: null,
    });
  }
  const { data: estVolta } = await admin
    .from("item_stock")
    .select("stock_available")
    .eq("item_id", item.id)
    .maybeSingle();
  check("I3 estoque de volta ao alvo (10)", Number(estVolta?.stock_available) === SALDO_ALVO);

  await admin.from("catalog_items").update({ active: false }).eq("id", item.id);
  check("I4 item fixture inativo", true);

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO - " + (e?.stack ?? e));
  process.exit(1);
});
