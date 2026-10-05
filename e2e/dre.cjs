/* E2E do Bloco 2 passo 2 - LANCAMENTOS AUTOMATICOS DO DIARIO + DRE.
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Rode tudo juntos com: npm run e2e
 *
 * E a ultima suite do script `e2e` de proposito. Ela faz DUAS coisas:
 *
 * 1. Cria EXATAMENTE UM pedido proprio (item que ja tem custo cadastrado) e o
 *    leva de aguardando_pagamento -> pago -> cancelado, para exercitar o
 *    gatilho ADIADO de verdade, com COMMIT, nos dois sentidos. Por que um
 *    pedido proprio e nao reaproveitar o dos outros testes: nenhuma suite
 *    anterior vende um item COM custo (0 de 7 itens vendidos tinham
 *    item_commercial_data.cost_price), entao o ramo de CMV nao era coberto.
 *
 * 2. Aproveita os dados ja deixados pelas suites anteriores (que rodam antes)
 *    para conferir o resto do livro: f5/pdv-v6 deixam pedidos PDV em dinheiro,
 *    pix, debito e credito 3x -> `venda:*` e `titulo-liquidacao:*`; compras-v1
 *    deixou `purchase_receive` -> `compra:*`.
 *
 * IMPACTO LIMPO: o diario e imutavel (0021:DIARIO_*_IMUTAVEL), entao nada do
 * que este arquivo escreve consegue ser apagado. Por isso o pedido nasce, prova
 * o que precisa e e CANCELADO: o estorno inverte receita, CMV, estoque e caixa,
 * e o efeito liquido no DRE fica ZERO. O que sobra e trilha de auditoria, nao
 * numero inventado. Producao nunca roda este arquivo - e2e roda contra o build
 * local + staging.
 * */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const NOME_CLIENTE_DRE = "Cliente DRE E2E";
const TOTAL_VENDA = 64.9;

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

async function conta(tabela, filtros = []) {
  let q = admin.from(tabela).select("*", { count: "exact", head: true });
  for (const f of filtros) {
    const [metodo, ...args] = f;
    if (metodo === "like") q = q.like(args[0], args[1]);
    else if (metodo === "eq") q = q.eq(args[0], args[1]);
    else if (metodo === "gt") q = q.gt(args[0], args[1]);
    else if (metodo === "gte") q = q.gte(args[0], args[1]);
    else if (metodo === "is") q = q.is(args[0], args[1]);
    else if (metodo === "in") q = q.in(args[0], args[1]);
    else throw new Error("filtro desconhecido: " + metodo);
  }
  const { count, error } = await q;
  if (error) throw new Error(`${tabela}: ${error.message || JSON.stringify(error)}`);
  return count ?? 0;
}

async function linhasDe(idemKey) {
  const { data: ent, error } = await admin
    .from("journal_entries")
    .select("id, source_type, source_id, description, competencia")
    .eq("tenant_id", TENANT)
    .eq("idempotency_key", idemKey)
    .maybeSingle();
  if (error) throw new Error("journal_entries: " + (error.message || JSON.stringify(error)));
  if (!ent) return { ent: null, linhas: [] };
  const { data: linhas, error: e2 } = await admin
    .from("journal_entry_lines")
    .select("code, debit, credit")
    .eq("entry_id", ent.id);
  if (e2) throw new Error("journal_entry_lines: " + (e2.message || JSON.stringify(e2)));
  return { ent, linhas: linhas ?? [] };
}

const soma = (linhas, campo, codigo) =>
  linhas.filter((l) => l.code === codigo).reduce((a, l) => a + Number(l[campo]), 0);
const totalDe = (linhas, campo) => linhas.reduce((a, l) => a + Number(l[campo]), 0);

/* Deixa tudo zerado se uma execucao anterior morreu no meio: pedidos DRE que
 * sobraram pagos sao cancelados (estorna a receita e o CMV) e depois apagados. */
async function limparResiduos() {
  const { data: clientes } = await admin
    .from("customers")
    .select("id")
    .eq("tenant_id", TENANT)
    .eq("name", NOME_CLIENTE_DRE);
  for (const c of clientes ?? []) {
    const { data: pedidos } = await admin
      .from("orders")
      .select("id, status")
      .eq("tenant_id", TENANT)
      .eq("customer_id", c.id);
    for (const p of pedidos ?? []) {
      if (p.status === "pago" || p.status === "processando") {
        await admin.from("orders").update({ status: "cancelado" }).eq("id", p.id);
      }
      await admin.from("order_items").delete().eq("order_id", p.id);
      await admin.from("orders").delete().eq("id", p.id);
    }
    await admin.from("customers").delete().eq("id", c.id);
  }
}

async function main() {
  await limparResiduos();

  // ============================================================ A. FIXTURE
  const { data: itens, error: eItens } = await admin
    .from("catalog_items")
    .select("id, sku, name, item_commercial_data(cost_price)")
    .eq("active", true);
  if (eItens) throw new Error("catalog_items: " + eItens.message);
  const comCusto = (itens ?? [])
    .map((i) => {
      const d = Array.isArray(i.item_commercial_data) ? i.item_commercial_data[0] : i.item_commercial_data;
      return { id: i.id, sku: i.sku, custo: Number(d?.cost_price ?? 0) };
    })
    .filter((i) => i.custo > 0);
  check("fixture: ha item de catalogo com custo cadastrado", comCusto.length > 0, `itens=${comCusto.length}`);
  const item = comCusto[0];
  if (!item) throw new Error("sem item com custo - impossivel exercitar o CMV");

  const emailDre = `dre-e2e-${Date.now()}@nuvem-de-papel.com.br`;
  const { data: cliente, error: eCli } = await admin
    .from("customers")
    .insert({ tenant_id: TENANT, name: NOME_CLIENTE_DRE, email: emailDre })
    .select("id")
    .single();
  if (eCli) throw new Error("customers: " + (eCli.message || JSON.stringify(eCli)));
  check("fixture: cliente da venda DRE criado", !!cliente?.id, cliente?.id ?? "");

  const pedidoId = randomUUID();
  const cmvEsperado = item.custo; // 1 unidade

  // ================================================== B. PAGA (gatilho real)
  const { error: eIns } = await admin.from("orders").insert({
    id: pedidoId,
    tenant_id: TENANT,
    customer_id: cliente.id,
    channel: "varejo",
    status: "aguardando_pagamento",
    origem: "loja",
    payment_method: "pix",
    total_amount: TOTAL_VENDA,
  });
  if (eIns) throw new Error("orders insert: " + (eIns.message || JSON.stringify(eIns)));

  const { error: eOi } = await admin.from("order_items").insert({
    tenant_id: TENANT,
    order_id: pedidoId,
    item_id: item.id,
    sku: item.sku,
    name: item.sku,
    unit_price: TOTAL_VENDA,
    quantity: 1,
    total: TOTAL_VENDA,
  });
  if (eOi) throw new Error("order_items insert: " + (eOi.message || JSON.stringify(eOi)));

  const { error: ePg } = await admin.from("orders").update({ status: "pago" }).eq("id", pedidoId);
  if (ePg) throw new Error("orders pago: " + (ePg.message || JSON.stringify(ePg)));

  const { ent: venda, linhas: lv } = await linhasDe(`venda:${pedidoId}`);
  check("gatilho: pedido pago gerou o lancamento venda:<id>", !!venda, `chave=venda:${pedidoId}`);
  if (venda) {
    check("gatilho: venda tem 4 linhas (caixa + receita + cmv + estoque)", lv.length === 4, `linhas=${lv.length}`);
    const d = totalDe(lv, "debit");
    const c = totalDe(lv, "credit");
    check("gatilho: lancamento da venda quita (debitos = creditos)", d === c, `D=${d} C=${c}`);
    check(
      "gatilho: receita creditada em 4.1.1 pelo total do pedido",
      Math.abs(soma(lv, "credit", "4.1.1") - TOTAL_VENDA) < 0.005,
      `4.1.1 credito=${soma(lv, "credit", "4.1.1")}`
    );
    check(
      `gatilho: CMV debitado em 5.1.1 pelo custo do item (${item.sku})`,
      Math.abs(soma(lv, "debit", "5.1.1") - cmvEsperado) < 0.005,
      `5.1.1 debito=${soma(lv, "debit", "5.1.1")} esperado=${cmvEsperado}`
    );
    check(
      "gatilho: CMV baixou o estoque (credita 1.1.3)",
      Math.abs(soma(lv, "credit", "1.1.3") - cmvEsperado) < 0.005,
      `1.1.3 credito=${soma(lv, "credit", "1.1.3")}`
    );
    check(
      "gatilho: pix sem titulo entra direto no caixa (debita 1.1.1)",
      Math.abs(soma(lv, "debit", "1.1.1") - TOTAL_VENDA) < 0.005,
      `1.1.1 debito=${soma(lv, "debit", "1.1.1")}`
    );
    check(
      "gatilho: lancamento registra a proveniencia (source_type=venda, source_id=pedido)",
      venda.source_type === "venda" && venda.source_id === pedidoId,
      `source_type=${venda.source_type} source_id=${venda.source_id}`
    );
  }

  // ======================================= C. LIVRO INTEIRO + VIEW (antes do estorno)
  const nVendas = await conta("journal_entries", [["like", "idempotency_key", "venda:%"]]);
  check(
    "diario: pedidos faturados viraram lancamento venda:*",
    nVendas > 0,
    `lancamentos de venda=${nVendas} (nossa venda + suites f5/pdv-v6)`
  );

  const nCompras = await conta("journal_entries", [["like", "idempotency_key", "compra:%"]]);
  check(
    "diario: recebimentos de compra viraram lancamento compra:*",
    nCompras > 0,
    `lancamentos de compra=${nCompras} (suite compras-v1)`
  );

  const nLiq = await conta("journal_entries", [["like", "idempotency_key", "titulo-liquidacao:%"]]);
  check(
    "diario: liquidacoes de titulo viraram lancamento titulo-liquidacao:*",
    nLiq > 0,
    `liquidacoes=${nLiq} (suite f5 - credito 3x)`
  );

  const { data: grupos, error: eGrupos } = await admin
    .from("account_catalog")
    .select("code")
    .eq("aceita_lancamento", false);
  if (eGrupos) throw new Error("account_catalog: " + eGrupos.message);
  const codigosGrupo = (grupos ?? []).map((g) => g.code);
  check("plano: ha contas de GRUPO no catalogo (a trava tem o que barrar)", codigosGrupo.length > 0, `contas de grupo=${codigosGrupo.length}`);

  const nEmGrupo = await conta("journal_entry_lines", [["in", "code", codigosGrupo]]);
  check(
    "diario: nenhuma linha caiu em conta de grupo (so folha aceita lancamento)",
    nEmGrupo === 0,
    `linhas em conta de grupo=${nEmGrupo}`
  );

  const nCaixa = await conta("journal_entry_lines", [["eq", "code", "1.1.1"], ["gt", "debit", 0]]);
  check("diario: vendas a dinheiro/pix entraram no caixa (debita 1.1.1)", nCaixa > 0, `linhas=${nCaixa}`);

  const nReceber = await conta("journal_entry_lines", [["eq", "code", "1.1.2"], ["gt", "credit", 0]]);
  check("diario: credito do PDV debitou contas a receber e foi baixado na liquidacao", nReceber > 0, `linhas=${nReceber}`);

  const nForn = await conta("journal_entry_lines", [["eq", "code", "2.1.1"], ["gt", "credit", 0]]);
  check("diario: compra creditou o fornecedor (2.1.1)", nForn > 0, `linhas=${nForn}`);

  const mesAtual = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const { data: dreBruta, error: eDre } = await admin
    .from("v_dre")
    .select("code, name, valor")
    .eq("dre_grupo", "receita_bruta")
    .gte("mes", mesAtual)
    .gt("valor", 0)
    .limit(20);
  if (eDre) throw new Error("v_dre: " + (eDre.message || JSON.stringify(eDre)));
  check(
    "v_dre: receita bruta do mes de competencia corrente aparece e e positiva",
    (dreBruta ?? []).length > 0,
    (dreBruta ?? []).map((l) => `${l.code} ${l.name}=${l.valor}`).join(", ")
  );

  const { data: dreCmv, error: eCmv } = await admin
    .from("v_dre")
    .select("code, name, valor")
    .eq("dre_grupo", "custo_vendidos")
    .gte("mes", mesAtual)
    .gt("valor", 0)
    .limit(20);
  if (eCmv) throw new Error("v_dre: " + (eCmv.message || JSON.stringify(eCmv)));
  check(
    "v_dre: CMV do mes de competencia corrente aparece e e positivo",
    (dreCmv ?? []).length > 0,
    (dreCmv ?? []).map((l) => `${l.code} ${l.name}=${l.valor}`).join(", ")
  );

  const nSemGrupo = await conta("v_dre", [["is", "dre_grupo", null]]);
  check("v_dre: toda linha vira com secao do DRE preenchida (nenhuma nula)", nSemGrupo === 0, `linhas sem secao=${nSemGrupo}`);

  const nLinhasDre = await conta("v_dre", [["gte", "mes", mesAtual]]);
  check("v_dre: ha linhas na competencia corrente", nLinhasDre > 0, `linhas=${nLinhasDre}`);

  // ==================================== D. CANCELADO (estorno zera o efeito)
  const { error: eCanc } = await admin.from("orders").update({ status: "cancelado" }).eq("id", pedidoId);
  if (eCanc) throw new Error("orders cancelado: " + (eCanc.message || JSON.stringify(eCanc)));

  const { ent: estorno, linhas: le } = await linhasDe(`venda-estorno:${pedidoId}`);
  check("gatilho: cancelamento de venda faturada gerou o estorno", !!estorno, `chave=venda-estorno:${pedidoId}`);
  if (estorno) {
    check("gatilho: estorno tem 4 linhas", le.length === 4, `linhas=${le.length}`);
    check(
      "gatilho: estorno REVERTE a receita (4.1.1 vira debito)",
      Math.abs(soma(le, "debit", "4.1.1") - TOTAL_VENDA) < 0.005,
      `4.1.1 debito=${soma(le, "debit", "4.1.1")}`
    );
    check(
      "gatilho: estorno REVERTE o CMV (5.1.1 vira credito)",
      Math.abs(soma(le, "credit", "5.1.1") - cmvEsperado) < 0.005,
      `5.1.1 credito=${soma(le, "credit", "5.1.1")}`
    );
    check(
      "gatilho: estorno devolve o estoque (1.1.3 vira debito)",
      Math.abs(soma(le, "debit", "1.1.3") - cmvEsperado) < 0.005,
      `1.1.3 debito=${soma(le, "debit", "1.1.3")}`
    );
    check(
      "gatilho: estorno tira do caixa o que entrou (1.1.1 vira credito)",
      Math.abs(soma(le, "credit", "1.1.1") - TOTAL_VENDA) < 0.005,
      `1.1.1 credito=${soma(le, "credit", "1.1.1")}`
    );
    const balancoLiquido =
      soma(lv, "credit", "4.1.1") - soma(lv, "debit", "4.1.1") + soma(le, "credit", "4.1.1") - soma(le, "debit", "4.1.1");
    check("gatilho: efeito liquido da venda cancelada no DRE = 0", Math.abs(balancoLiquido) < 0.005, `liquido=${balancoLiquido}`);
  }

  // ============================================================ E. TELA
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await login(page, EMAIL_MASTER, SENHA_MASTER);

    await page.goto(BASE + "/financeiro", { waitUntil: "domcontentloaded" });
    await page.locator('section[aria-label="DRE"] h2').waitFor({ timeout: 20000 });

    check("DRE UI: secao da DRE renderiza no /financeiro", (await page.locator('section[aria-label="DRE"]').count()) === 1);

    const corpo = page.locator('section[aria-label="DRE"] tbody tr');
    const nRows = await corpo.count();
    check("DRE UI: as 14 linhas do demonstrativo estao montadas", nRows === 14, `linhas=${nRows}`);

    const texto = (await page.locator('section[aria-label="DRE"]').innerText()).replace(/\s+/g, " ");
    check("DRE UI: nao mostra o aviso de 'nenhum lancamento'", !texto.includes("Nenhum lançamento contábil"));
    check("DRE UI: linha de Receita bruta de vendas aparece", texto.includes("Receita bruta de vendas"));
    check("DRE UI: linha de EBITDA aparece", texto.includes("EBITDA"));
    check("DRE UI: linha de Lucro liquido aparece", texto.includes("Lucro líquido do período"));

    const linhasTela = await corpo.allInnerTexts();
    const linhaReceita = (linhasTela.find((l) => l.startsWith("Receita bruta de vendas")) || "").replace(/\s+/g, " ");
    check("DRE UI: receita bruta exibida maior que zero", /R\$\s*[1-9]/.test(linhaReceita), linhaReceita || "(linha nao encontrada)");

    const sel = page.locator('select[aria-label="Competência da DRE"]');
    check("DRE UI: seletor de competencia existe", (await sel.count()) === 1);

    const nOpcoes = (await sel.count()) === 1 ? await sel.locator("option").count() : 0;
    check("DRE UI: seletor tem ao menos uma competencia", nOpcoes >= 1, `opcoes=${nOpcoes}`);
    if (nOpcoes > 1) {
      await sel.selectOption({ index: 1 });
      await page.waitForTimeout(400);
      const nApos = await page.locator('section[aria-label="DRE"] tbody tr').count();
      check("DRE UI: trocar a competencia mantem o demonstrativo montado", nApos === 14, `linhas=${nApos}`);
      await sel.selectOption({ index: 0 });
      await page.waitForTimeout(300);
    }

    const temReceber = await page.getByText("Contas a receber", { exact: false }).count();
    check("DRE UI: secao de Contas a receber continua no lugar", temReceber > 0);
  } finally {
    await browser.close();
  }

  // ============================================================ F. LIMPEZA
  await limparResiduos();
  const { data: restos } = await admin
    .from("orders")
    .select("id")
    .eq("tenant_id", TENANT)
    .eq("customer_id", cliente.id);
  check("F1 limpeza: pedido e cliente DRE fora", (restos ?? []).length === 0, `pedidos=${(restos ?? []).length}`);

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO - " + (e?.stack ?? e));
  process.exit(1);
});
