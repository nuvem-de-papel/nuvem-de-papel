/* E2E Conciliacao bancaria (0027) - /financeiro/conciliacao:
 *   A1..A2 gate (anon -> login; master abre com form e lista);
 *   B1..B3 validacoes da importacao (vazio/lixo travam; cabecalho CSV
 *       nao vira linha);
 *   C1..C5 importacao CSV (toast, extrato gravado, 3 linhas com sinal,
 *       linhas na UI, card de pendentes = 3);
 *   D1..D4 importacao OFX + dedupe por FITID (reimportar nao duplica);
 *   E1..E8 conciliacao: sugestao preenchida (despesa paga de 132,45),
 *       conciliar/ignorar/desconciliar/reabrir com banco conferido;
 *   F1..F5 filtros de status e mes;
 *   G1..G3 audit_log (extrato.importar/conciliar/ignorar/desconciliar/reabrir);
 *   H1..H2 limpeza (extratos fora por cascade; despesa-cenario fora -
 *       o diario fica, livro imutavel por design).
 * Requisitos: npm run build && npm run start (:3000) + migration 0027 aplicada.
 * Roda junto de: npm run e2e (executa depois de despesas). */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const TS = Date.now();
const DESC_CENARIO = `Desp E2E Concil ${TS}`;
const CSV = [
  "data;descricao;valor",
  `05/09/2026;Pix recebido da loja ${TS};450,00`,
  `12/09/2026;Pagamento fornecedor E2E ${TS};-132,45`,
  `20/09/2026;Tarifa bancaria E2E ${TS};-18,90`,
].join("\n");
const OFX = [
  "OFXHEADER:100",
  "<OFX>",
  "<BANKTRANLIST>",
  "<STMTTRN>",
  "<TRNTYPE>XFER",
  "<DTPOSTED>20260915",
  "<TRNAMT>89.90",
  `<FITID>E2E-FIT-${TS}-1`,
  `<MEMO>Recebimento pix marketplace ${TS}`,
  "</STMTTRN>",
  "<STMTTRN>",
  "<TRNTYPE>FEE",
  "<DTPOSTED>20260918",
  "<TRNAMT>-55.00",
  `<FITID>E2E-FIT-${TS}-2`,
  `<MEMO>Tarifa de conta ${TS}`,
  "</STMTTRN>",
  "</BANKTRANLIST>",
  "</OFX>",
].join("\n");

function lerEnv() {
  const env = {};
  const arquivo = path.join(__dirname, "..", ".env.local");
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
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

async function temTexto(page, texto, timeout = 15000) {
  const alvo = texto.toLowerCase();
  try {
    await page.waitForFunction(
      (t) => document.body.innerText.toLowerCase().includes(t),
      alvo,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // varredura de sobras (extratos somem por cascade; o diario fica)
  await admin.from("bank_extratos").delete().eq("tenant_id", TENANT);
  await admin.from("expenses").delete().eq("tenant_id", TENANT).like("description", "Desp E2E Concil%");

  // cenario: despesa PAGA em 12/09 (vira candidata de conciliacao)
  const { data: desp, error: erroDesp } = await admin
    .from("expenses")
    .insert({
      tenant_id: TENANT,
      competencia: "2026-09-01",
      description: DESC_CENARIO,
      account_code: "6.1.1",
      amount: 132.45,
      paid_at: "2026-09-12",
      recurring: false,
    })
    .select("id")
    .single();
  if (erroDesp || !desp) throw new Error("falha ao criar despesa-cenario: " + (erroDesp?.message ?? ""));
  const despId = desp.id;

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();

    // ============================================================ A. gate
    const resp = await fetch(BASE + "/financeiro/conciliacao", { redirect: "manual" });
    const loc = resp.headers.get("location") || "";
    check(
      "A1 /financeiro/conciliacao anonimo -> 307 login",
      [302, 303, 307].includes(resp.status) && loc.includes("/login"),
      `status=${resp.status} loc=${loc}`
    );

    await login(page, EMAIL_MASTER, SENHA_MASTER);
    await page.goto(BASE + "/financeiro/conciliacao", { waitUntil: "domcontentloaded" });
    const temForm = await page
      .locator('form[aria-label="Formulário de importação"]')
      .isVisible()
      .catch(() => false);
    const temLista = await page
      .locator('section[aria-label="Linhas do extrato"]')
      .isVisible()
      .catch(() => false);
    check("A2 master abre a tela com form e lista", temForm && temLista, `form=${temForm} lista=${temLista}`);

    // ==================================================== B. validacoes
    const ta = page.locator('textarea[aria-label="Extrato (CSV ou OFX)"]');
    const btn = page.locator('button[aria-label="Importar extrato"]');

    check("B1 textarea vazia mantem o botao desabilitado", await btn.isDisabled());

    await ta.fill("abc");
    check("B2 texto sem linha reconhecida mantem o botao desabilitado", await btn.isDisabled());

    await ta.fill(CSV);
    const reconhecidas = await page.locator('p[aria-label="Linhas reconhecidas"]').innerText();
    check(
      "B3 cabecalho do CSV nao vira linha (3 reconhecidas de 4)",
      reconhecidas.includes("3 linha(s) reconhecida(s)"),
      reconhecidas
    );

    // ================================================== C. importacao CSV
    await page.fill('input[aria-label="Competência do extrato"]', "2026-09");
    await btn.click();
    const okCsv = await temTexto(page, "3 linha(s) importada(s)");
    check("C1 toast da importacao CSV", okCsv);

    const { data: extratos1 } = await admin
      .from("bank_extratos")
      .select("id, fonte, competencia, linhas_total, linhas_novas")
      .eq("tenant_id", TENANT)
      .order("created_at", { ascending: false });
    const extCsv = (extratos1 ?? []).find((e) => e.fonte === "csv");
    check(
      "C2 extrato CSV gravado (competencia 09, 3/3 linhas)",
      !!extCsv &&
        String(extCsv.competencia).slice(0, 10) === "2026-09-01" &&
        extCsv.linhas_total === 3 &&
        extCsv.linhas_novas === 3,
      JSON.stringify(extCsv ?? null)
    );

    const { data: linhasCsv } = await admin
      .from("bank_linhas")
      .select("data, descricao, valor, status, fitid")
      .eq("tenant_id", TENANT);
    const acha = (pref) => (linhasCsv ?? []).find((l) => String(l.descricao).startsWith(pref));
    const lPix = acha("Pix recebido da loja");
    const lPag = acha("Pagamento fornecedor E2E");
    const lTar = acha("Tarifa bancaria E2E");
    check(
      "C3 3 linhas CSV com data e sinal certos (450 / -132,45 / -18,90)",
      !!lPix && !!lPag && !!lTar &&
        lPix.data === "2026-09-05" && Number(lPix.valor) === 450 &&
        lPag.data === "2026-09-12" && Number(lPag.valor) === -132.45 &&
        lTar.data === "2026-09-20" && Number(lTar.valor) === -18.9 &&
        lPix.status === "pendente" && lPix.fitid === null,
      JSON.stringify([lPix, lPag, lTar].filter(Boolean).map((l) => [l.data, l.valor, l.status]))
    );

    const uiPix = await temTexto(page, "Pix recebido da loja");
    const uiTar = await temTexto(page, "Tarifa bancaria E2E");
    check("C4 linhas aparecem na tabela da UI", uiPix && uiTar);

    const cardPend = await page.locator('[aria-label="Linhas pendentes"] .display').first().innerText();
    check("C5 card de pendentes = 3", cardPend.trim() === "3", `card=${cardPend.trim()}`);

    // ================================================ D. OFX + dedupe
    await ta.fill(OFX);
    const reconOfx = await page.locator('p[aria-label="Linhas reconhecidas"]').innerText();
    check("D1 OFX reconhece as 2 transacoes", reconOfx.includes("2 linha(s) reconhecida(s)"), reconOfx);

    await btn.click();
    const okOfx = await temTexto(page, "2 linha(s) importada(s)");
    check("D2 toast da importacao OFX", okOfx);

    await ta.fill(OFX);
    await btn.click();
    const okDup = await temTexto(page, "2 repetida(s) ignorada(s)");
    const okZero = await temTexto(page, "0 linha(s) importada(s)");
    check("D3 reimportar o mesmo OFX nao duplica (0 novas, 2 repetidas)", okDup && okZero);

    const { data: todasLinhas } = await admin
      .from("bank_linhas")
      .select("id")
      .eq("tenant_id", TENANT);
    const { data: todosExtratos } = await admin
      .from("bank_extratos")
      .select("id, fonte")
      .eq("tenant_id", TENANT);
    check(
      "D4 banco: 5 linhas (3 CSV + 2 OFX) em 3 extratos",
      (todasLinhas ?? []).length === 5 && (todosExtratos ?? []).length === 3,
      `linhas=${(todasLinhas ?? []).length} extratos=${(todosExtratos ?? []).length}`
    );

    // ============================================== E. conciliacao de verdade
    const linhaPag = page.locator("tr", { hasText: "Pagamento fornecedor E2E" });
    const selPag = linhaPag.locator("select");
    const valorSel = await selPag.inputValue().catch(() => "");
    check(
      "E1 sugestao pre-carregada na linha da despesa paga",
      valorSel === `despesa:${despId}`,
      `select=${valorSel} esperado=despesa:${despId}`
    );

    await linhaPag.locator('button[aria-label^="Conciliar linha"]').click();
    const okConc = await temTexto(page, "Linha conciliada.");
    check("E2 toast do conciliar", okConc);

    const { data: posConc } = await admin
      .from("bank_linhas")
      .select("status, ref_tipo, ref_id, conciliada_by, conciliada_em")
      .eq("descricao", `Pagamento fornecedor E2E ${TS}`)
      .maybeSingle();
    check(
      "E3 banco: linha conciliada com vinculo para a despesa e carimbo",
      !!posConc &&
        posConc.status === "conciliada" &&
        posConc.ref_tipo === "despesa" &&
        posConc.ref_id === despId &&
        !!posConc.conciliada_by &&
        !!posConc.conciliada_em,
      JSON.stringify(posConc)
    );

    let cardConc = "";
    try {
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[aria-label="Linhas conciliadas"] .display');
          return !!el && (el.textContent || "").trim() === "1";
        },
        { timeout: 8000 }
      );
      cardConc = await page.locator('[aria-label="Linhas conciliadas"] .display').first().innerText();
    } catch {
      cardConc = await page
        .locator('[aria-label="Linhas conciliadas"] .display')
        .first()
        .innerText()
        .catch(() => "?");
    }
    check("E4 card de conciliadas = 1", cardConc.trim() === "1", `card=${cardConc.trim()}`);

    const linhaTar = page.locator("tr", { hasText: "Tarifa bancaria E2E" });
    await linhaTar.locator('button[aria-label^="Ignorar linha"]').click();
    const okIgn = await temTexto(page, "Linha marcada como ignorada.");
    const { data: posIgn } = await admin
      .from("bank_linhas")
      .select("status, ref_tipo")
      .eq("descricao", `Tarifa bancaria E2E ${TS}`)
      .maybeSingle();
    check(
      "E5 ignorar: toast + banco status ignorada sem vinculo",
      okIgn && posIgn?.status === "ignorada" && !posIgn.ref_tipo,
      JSON.stringify(posIgn)
    );

    await linhaPag.locator('button[aria-label^="Desconciliar linha"]').click();
    const okDesc = await temTexto(page, "Linha voltou para pendente.");
    const { data: posDesc } = await admin
      .from("bank_linhas")
      .select("status, ref_tipo, ref_id")
      .eq("descricao", `Pagamento fornecedor E2E ${TS}`)
      .maybeSingle();
    check(
      "E6 desconciliar: toast + banco pendente com vinculo limpo",
      okDesc && posDesc?.status === "pendente" && !posDesc.ref_tipo && !posDesc.ref_id,
      JSON.stringify(posDesc)
    );

    await linhaTar.locator('button[aria-label^="Reabrir linha"]').click();
    const okReab = await temTexto(page, "Linha voltou para pendente.");
    const { data: posReab } = await admin
      .from("bank_linhas")
      .select("status, ref_tipo")
      .eq("descricao", `Tarifa bancaria E2E ${TS}`)
      .maybeSingle();
    check(
      "E7 reabrir linha ignorada: banco volta para pendente",
      okReab && posReab?.status === "pendente" && !posReab.ref_tipo,
      JSON.stringify(posReab)
    );

    await linhaPag.locator('button[aria-label^="Conciliar linha"]').click();
    const okConc2 = await temTexto(page, "Linha conciliada.");
    const { data: posConc2 } = await admin
      .from("bank_linhas")
      .select("status, ref_id")
      .eq("descricao", `Pagamento fornecedor E2E ${TS}`)
      .maybeSingle();
    check(
      "E8 conciliar de novo depois do desconciliar",
      okConc2 && posConc2?.status === "conciliada" && posConc2.ref_id === despId,
      JSON.stringify(posConc2)
    );

    // ==================================================== F. filtros
    await page.selectOption('select[aria-label="Status das linhas"]', "pendentes");
    await page.waitForTimeout(300);
    const nPend = await page.locator('section[aria-label="Linhas do extrato"] tbody tr').count();
    check("F1 filtro pendentes mostra 4 linhas", nPend === 4, `n=${nPend}`);

    await page.selectOption('select[aria-label="Status das linhas"]', "ignoradas");
    const vazioStatus = await temTexto(page, "Nenhuma linha com este status.");
    check("F2 filtro ignoradas (zerado) mostra o estado vazio", vazioStatus);

    await page.selectOption('select[aria-label="Status das linhas"]', "todas");
    await page.waitForTimeout(300);
    const nTodas = await page.locator('section[aria-label="Linhas do extrato"] tbody tr').count();
    check("F3 filtro todas mostra 5 linhas", nTodas === 5, `n=${nTodas}`);

    await page.selectOption('select[aria-label="Mês do extrato"]', "2026-10");
    const vazioMes = await temTexto(page, "Nenhuma linha neste mês.");
    check("F4 mes sem extrato mostra o estado vazio", vazioMes);

    await page.selectOption('select[aria-label="Mês do extrato"]', "2026-09");
    await page.waitForTimeout(300);
    const nVolta = await page.locator('section[aria-label="Linhas do extrato"] tbody tr').count();
    check("F5 voltar ao mes do extrato traz as 5 linhas", nVolta === 5, `n=${nVolta}`);

    // ==================================================== G. auditoria
    const { data: aud } = await admin
      .from("audit_log")
      .select("action, after")
      .eq("tenant_id", TENANT)
      .like("action", "extrato.%");
    const imports = (aud ?? []).filter((a) => a.action === "extrato.importar");
    check(
      "G1 audit extrato.importar (>= 2, uma delas com 3 novas)",
      imports.length >= 2 && imports.some((a) => a.after?.novas === 3 && a.after?.total === 3),
      `registros=${imports.length}`
    );
    check(
      "G2 audit conciliar + ignorar + desconciliar",
      (aud ?? []).some((a) => a.action === "extrato.conciliar") &&
        (aud ?? []).some((a) => a.action === "extrato.ignorar") &&
        (aud ?? []).some((a) => a.action === "extrato.desconciliar"),
      `total=${(aud ?? []).length}`
    );
    check(
      "G3 audit extrato.reabrir",
      (aud ?? []).some((a) => a.action === "extrato.reabrir"),
      ""
    );

    // ==================================================== H. limpeza
    await admin.from("bank_extratos").delete().eq("tenant_id", TENANT);
    const { data: restantes } = await admin
      .from("bank_linhas")
      .select("id")
      .eq("tenant_id", TENANT);
    check(
      "H1 limpeza: extratos fora levam as linhas (cascade) - diario intocado",
      (restantes ?? []).length === 0,
      `restou=${(restantes ?? []).length}`
    );

    await admin.from("expenses").delete().eq("tenant_id", TENANT).like("description", "Desp E2E Concil%");
    const { data: despFora } = await admin
      .from("expenses")
      .select("id")
      .eq("tenant_id", TENANT)
      .like("description", "Desp E2E Concil%");
    check("H2 limpeza: despesa-cenario fora (as de teste anteriores tambem)", (despFora ?? []).length === 0);
  } finally {
    await browser.close();
  }

  const total = resultados.length;
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${total} | PASS ${total - falhas} | FAIL ${falhas}`);
  if (falhas > 0) process.exit(1);
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
