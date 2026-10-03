/* E2E PDV v6 — caixa inline na coluna esquerda, teclado do operador,
 * multiplicador de leitor, desconto com limite por perfil, CX-05/CX-07/
 * CX-09/CX-10, NFC-e opcional no comprovante e drawer de comanda em 390px.
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Roda junto de: npm run e2e (executa depois dos f2..sefaz). */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const SKU = "SKU-E2E-PDV6";
const NOME = "Item E2E PDV6";
const PRECO = 25.9;
const SALDO = 5; // 5 = estoque baixo (PDV-09 sinaliza "baixo")
const EMAIL_OPE = "e2e-pdv6@nuvem-de-papel.com.br";
const SENHA_OPE = "E2e#2026Pdv";
const NOME_OPE = "Operador PDV6";

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

async function corpo(page) {
  // Intl do browser forma "R$ 51,80" — normaliza para o includes() casar
  const t = (await page.textContent("body")) ?? "";
  return t.replace(/\u00A0|\u202F/g, " ");
}

// o limite de 10% do desconto (PDV-10) vale para operador/vendedor — o teste
// roda como operador; gerente/master não tem teto (decisão da spec).
async function garantirOperador() {
  const { data: lst } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existente = (lst?.users ?? []).find((u) => u.email?.toLowerCase() === EMAIL_OPE);
  if (existente) {
    await admin.from("profiles").upsert(
      {
        id: existente.id,
        tenant_id: TENANT,
        email: EMAIL_OPE,
        full_name: NOME_OPE,
        role: "operador",
        status: "ativo",
      },
      { onConflict: "id" }
    );
    return;
  }
  const { data: criado, error } = await admin.auth.admin.createUser({
    email: EMAIL_OPE,
    password: SENHA_OPE,
    email_confirm: true,
  });
  if (error) throw new Error("fixture operador PDV6: " + error.message);
  await admin.from("profiles").insert({
    id: criado.user.id,
    tenant_id: TENANT,
    email: EMAIL_OPE,
    full_name: NOME_OPE,
    role: "operador",
    status: "ativo",
  });
}

async function main() {
  const t0 = new Date().toISOString();

  // R) normaliza: caixa fechado antes de começar (igual ao F5) ---------------
  const { data: aberta } = await admin
    .from("caixa_sessions")
    .select("id")
    .eq("status", "aberto")
    .maybeSingle();
  if (aberta) {
    const { data: movs } = await admin
      .from("caixa_movements")
      .select("direction, amount")
      .eq("session_id", aberta.id);
    const gaveta = (movs ?? []).reduce(
      (a, m) => a + (m.direction === "in" ? Number(m.amount) : -Number(m.amount)),
      0
    );
    const { error } = await admin.rpc("pdv_close_cash", { p_counted_amount: gaveta });
    check("R1 caixa legado fechado antes de comecar", !error, error?.message ?? `sessao ${aberta.id}`);
  } else {
    check("R1 nenhum caixa aberto", true);
  }

  const { data: fechadas } = await admin
    .from("caixa_sessions")
    .select("id")
    .eq("status", "fechado")
    .limit(1);
  const temFechada = (fechadas ?? []).length > 0;

  // fixture: item controlado com preço e estoque baixo -----------------------
  let { data: item } = await admin
    .from("catalog_items")
    .select("id, active")
    .eq("sku", SKU)
    .maybeSingle();
  if (!item) {
    const { data: novo, error } = await admin
      .from("catalog_items")
      .insert({ tenant_id: TENANT, sku: SKU, name: NOME, active: true })
      .select("id")
      .single();
    if (error) throw new Error("seed catalog_items: " + error.message);
    item = { id: novo.id, active: true };
  } else if (!item.active) {
    await admin.from("catalog_items").update({ active: true }).eq("id", item.id);
  }
  // item_prices: a PK é (item_id, channel, min_quantity, valid_from), entao o
  // upsert genérico do F5 nao serve aqui — atualiza se já há linha, insere a
  // base do canal se não houver.
  const { data: precos, error: eS } = await admin
    .from("item_prices")
    .select("price, min_quantity")
    .eq("item_id", item.id)
    .eq("channel", "varejo");
  if (eS) throw new Error("leitura item_prices: " + eS.message);
  if (precos?.length) {
    await admin.from("item_prices").update({ price: PRECO }).eq("item_id", item.id).eq("channel", "varejo");
  } else {
    const { error: eP } = await admin.from("item_prices").insert({
      item_id: item.id,
      channel: "varejo",
      price: PRECO,
      min_quantity: 1,
      valid_from: "2020-01-01",
    });
    if (eP) throw new Error("seed item_prices: " + eP.message);
  }
  const { data: est0 } = await admin
    .from("item_stock")
    .select("stock_available")
    .eq("item_id", item.id)
    .maybeSingle();
  const atual = est0 ? Number(est0.stock_available) : 0;
  await admin.rpc("register_stock_movement", {
    p_item_id: item.id,
    p_type: "ajuste",
    p_quantity: SALDO - atual,
    p_reference_type: "manual",
    p_reference_id: null,
    p_notes: "seed E2E PDV6",
    p_created_by: null,
  });

  await garantirOperador();

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();

  try {
    // A) tela de abertura (sem sessão) — roda como operador (dono do caixa) --
    await login(page, EMAIL_OPE, SENHA_OPE);
    await page.goto(BASE + "/pdv", { waitUntil: "domcontentloaded" });
    let texto = await corpo(page);
    check(
      "A1 tela de abertura com Abrir caixa e sem acesso restrito",
      texto.includes("Abrir caixa") && !texto.includes("Acesso restrito")
    );
    check(
      "A2 input do fundo de abertura presente",
      (await page.locator('input[aria-label="Valor de abertura"]').count()) === 1
    );
    check(
      "A3 resumo do ultimo turno quando ha turno fechado (CX-09)",
      !temFechada || texto.includes("Último turno")
    );

    // B) abertura por Enter (CX-02) -----------------------------------------
    await page.fill('input[aria-label="Valor de abertura"]', "100");
    await page.press('input[aria-label="Valor de abertura"]', "Enter");
    await esperarTexto(page, "Caixa aberto com fundo de R$ 100,00");
    check("B1 caixa abre pelo Enter no campo", true);

    // C) busca: estado vazio, 2+ caracteres, estoque baixo, Esc --------------
    await page.locator('input[aria-label="Buscar produto"]').waitFor();
    texto = await corpo(page);
    check("C1 estado vazio 'Pronto para vender'", texto.includes("Pronto para vender"));

    await page.fill('input[aria-label="Buscar produto"]', "a");
    await page.waitForTimeout(250);
    const semResultados = await page.locator('button[aria-label^="Adicionar"]').count();
    check("C2 1 caractere nao mostra resultados (PDV-01)", semResultados === 0, `botoes=${semResultados}`);

    await page.fill('input[aria-label="Buscar produto"]', "PDV6");
    await page.locator(`button[aria-label="Adicionar ${NOME}"]`).waitFor({ timeout: 15000 });
    texto = await corpo(page);
    check("C3 resultados com 2+ caracteres", texto.includes("1 produto encontrado"));
    check("C4 estoque baixo sinalizado (PDV-09)", texto.includes("un. · baixo"));

    await page.press('input[aria-label="Buscar produto"]', "Escape");
    await page.waitForTimeout(200);
    texto = await corpo(page);
    check("C5 Esc limpa a busca (PDV-05)", texto.includes("Pronto para vender"));

    // D) multiplicador + Enter (PDV-03/PDV-04/PDV-06) ------------------------
    await page.fill('input[aria-label="Buscar produto"]', "2*SKU-E2E-PDV6");
    await page.locator('span[aria-label="Multiplicador"]').waitFor();
    check("D1 selo do multiplicador 2x", true);
    await page.press('input[aria-label="Buscar produto"]', "Enter");
    await esperarTexto(page, "Comanda (2)");
    const buscaVal = await page.inputValue('input[aria-label="Buscar produto"]');
    check("D2 Enter entra pelo codigo exato e limpa a busca", buscaVal === "", `busca="${buscaVal}"`);
    texto = await corpo(page);
    check("D3 subtotal 2 x R$ 25,90 = R$ 51,80", texto.includes("R$ 51,80"));

    // E) desconto acima de 10% barrado (PDV-10 servidor + perfil) ------------
    await page.fill('input[aria-label="Desconto"]', "40");
    await page.click('button[aria-label="Registrar venda"]');
    await esperarTexto(page, "acima do limite de 10%");
    texto = await corpo(page);
    check("E1 desconto > 10% do subtotal barrado", texto.includes("acima do limite de 10%"));
    check("E2 nada foi vendido (comanda intacta)", texto.includes("Comanda (2)"));

    // F) venda valida + comprovante + NFC-e opcional -------------------------
    await page.fill('input[aria-label="Desconto"]', "5");
    await page.click('button[aria-label="Registrar venda"]');
    await esperarTexto(page, "Venda registrada");
    texto = await corpo(page);
    check(
      "F1 venda com desconto valida: R$ 46,80",
      texto.includes("Venda registrada: R$ 46,80") && texto.includes("desconto de R$ 5,00")
    );
    check(
      "F2 comprovante nao fiscal com numero V-",
      texto.includes("Comprovante não fiscal") && /Pedido V-\d{4}/.test(texto)
    );

    const { data: pedidos } = await admin
      .from("orders")
      .select("id, total_amount, discount_amount, origem, venda_numero, caixa_sessao_id")
      .eq("origem", "pdv")
      .gte("created_at", t0);
    const meu = (pedidos ?? []).find((p) => Math.abs(Number(p.total_amount) - 46.8) < 0.005);
    check(
      "F3 pedido no banco: 46,80, desconto 5, origem pdv, numero V-",
      !!meu &&
        Number(meu.discount_amount) === 5 &&
        /^V-\d{4}$/.test(meu.venda_numero ?? "") &&
        !!meu.caixa_sessao_id,
      JSON.stringify(meu ?? {})
    );

    const mockOn = env.SEFAZ_MOCK === "1";
    await page.click('button[aria-label="Emitir NFC-e"]');
    if (mockOn) {
      await esperarTexto(page, "NFC-e (mock) autorizada");
      check("F4 NFC-e mock autorizada pelo botao do comprovante", true);
    } else {
      await esperarTexto(page, "NFC-e pendente");
      check("F4 NFC-e fail-closed sem mock (pendencia documentada)", true);
    }

    // G) CX-05: sangria acima do dinheiro da gaveta --------------------------
    await page.selectOption('select[aria-label="Tipo de movimento"]', "sangria");
    await page.fill('input[aria-label="Valor do movimento"]', "50000");
    await page.fill('input[aria-label="Motivo do movimento"]', "teste cx05");
    await page.click('button[aria-label="Registrar movimento"]');
    await esperarTexto(page, "A gaveta tem só R$");
    texto = await corpo(page);
    check("G1 CX-05 sangria acima da gaveta barrada com o valor", texto.includes("A gaveta tem só R$"));
    const { data: sangrias } = await admin
      .from("caixa_movements")
      .select("id")
      .eq("movement_type", "sangria")
      .gte("amount", 50000)
      .gte("created_at", t0);
    check("G2 nenhum movimento de sangria gigante gravado", (sangrias ?? []).length === 0);

    // H) PDV-08 minimo 1 e PDV-11 Limpar ------------------------------------
    await page.fill('input[aria-label="Buscar produto"]', "PDV6");
    await page.locator(`button[aria-label="Adicionar ${NOME}"]`).waitFor();
    await page.click(`button[aria-label="Adicionar ${NOME}"]`);
    await page.click(`button[aria-label="Remover ${NOME}"]`);
    await page.waitForTimeout(200);
    texto = await corpo(page);
    check("H1 menos para em 1 unidade (PDV-08)", texto.includes("Comanda (1)"));

    await page.click('button[aria-label="Limpar comanda"]');
    await page.waitForTimeout(200);
    texto = await corpo(page);
    const descAposLimpar = await page.inputValue('input[aria-label="Desconto"]');
    check(
      "H2 Limpar esvazia a comanda e zera o desconto (PDV-11)",
      texto.includes("Comanda vazia") && descAposLimpar === "",
      `desconto="${descAposLimpar}"`
    );

    // I) F8 leva o foco ao painel Caixa --------------------------------------
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press("F8");
    await page.waitForTimeout(300);
    const foco = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? ""
    );
    check("I1 F8 foca o painel Caixa (coluna esquerda)", foco === "Tipo de movimento", `foco=${foco}`);

    // J) 390px: sem rolagem horizontal, drawer e barra flutuante -------------
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    const semScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    check("J1 sem rolagem horizontal em 390px", semScroll);
    await page.click('button[aria-label="Abrir comanda"]');
    await page.waitForTimeout(400);
    let box = await page.locator('aside[aria-label="Comanda"]').boundingBox();
    check("J2 barra flutuante abre a comanda (drawer)", !!box && box.x < 390, box ? `x=${Math.round(box.x)}` : "sem box");
    await page.click(".pdv-fechar");
    await page.waitForTimeout(400);
    box = await page.locator('aside[aria-label="Comanda"]').boundingBox();
    check("J3 drawer fecha pelo X", !!box && box.x > 390, box ? `x=${Math.round(box.x)}` : "sem box");
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);

    // K) CX-07 resultado ao vivo + CX-10 quadro + fechamento -----------------
    const { data: sessaoAtual } = await admin
      .from("caixa_sessions")
      .select("id")
      .eq("status", "aberto")
      .maybeSingle();
    const { data: movsK } = await admin
      .from("caixa_movements")
      .select("direction, amount")
      .eq("session_id", sessaoAtual?.id ?? "");
    const esperado = (movsK ?? []).reduce(
      (a, m) => a + (m.direction === "in" ? Number(m.amount) : -Number(m.amount)),
      0
    );
    await page.fill('input[aria-label="Valor da contagem"]', esperado.toFixed(2));
    await esperarTexto(page, "Caixa confere.");
    texto = await corpo(page);
    check("K1 CX-07 bate-vale ao vivo ao contar", texto.includes("Caixa confere."));
    check("K2 CX-10 quadro de fechamento com esperado", texto.includes("esperado R$"));
    await page.click('button[aria-label="Fechar caixa"]');
    await esperarTexto(page, "Bate-vale zerado");
    check("K3 fechamento com bate-vale zerado", true);

    // L) estado fechado de volta + resumo do turno ---------------------------
    await page.goto(BASE + "/pdv", { waitUntil: "domcontentloaded" });
    texto = await corpo(page);
    check("L1 volta para a tela de abertura", texto.includes("Abrir caixa"));
    check("L2 resumo do ultimo turno fechado (CX-09)", texto.includes("Último turno"));

    // M) limpeza: pedidos criados nesta execução -----------------------------
    const { data: paraApagar } = await admin
      .from("orders")
      .select("id")
      .eq("origem", "pdv")
      .gte("created_at", t0);
    const ids = (paraApagar ?? []).map((o) => o.id);
    let tituloOk = true;
    if (ids.length) {
      const { data: ts } = await admin.from("financial_titles").select("id").in("source_id", ids);
      if (ts?.length) {
        await admin.from("financial_installments").delete().in("title_id", ts.map((t) => t.id));
        const { error: eT } = await admin.from("financial_titles").delete().in("id", ts.map((t) => t.id));
        tituloOk = !eT;
      }
      const { data: apagados, error: eO } = await admin.from("orders").delete().in("id", ids).select("id");
      check(
        "M1 pedidos da execucao removidos",
        !eO && tituloOk && (apagados ?? []).length === ids.length,
        eO?.message ?? `${ids.length} pedidos`
      );
    } else {
      check("M1 pedidos da execucao removidos", false, "nenhum pedido localizado para limpar");
    }
  } finally {
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
