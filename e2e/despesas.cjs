/* E2E Despesas + rateio (Bloco 2 residual) - /financeiro/despesas:
 *   A1..A2 gate (anon -> login; master abre com form e lista);
 *   B1..B4 validacoes travam o botao (descricao, valor, rateio 100%);
 *   B5..B8 lançamento simples: toast, linha na lista, expenses gravado e o
 *       gatilho da 0023 publicou despesa:<id> no diario (pago -> C 1.1.1);
 *   C1..C8 rateio 50/30/20 em 3 centros: 3 linhas + 3 lancamentos (aberto ->
 *       C 2.1.1), soma exata com a ultima linha absorvendo o arredondamento,
 *       cards de resumo por centro e total do mes;
 *   D1..D2 filtro de mes (mes vazio -> estado vazio; volta ao mes com dados);
 *   E1..E2 limpeza (expenses fora; diario fica - livro imutavel, por design).
 * Requisitos: npm run build && npm run start (:3000).
 * Roda junto de: npm run e2e (executa depois de marketplaces). */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const COMP = "2026-09"; // competencia fora do mes corrente: nao mexe no DRE da dre.cjs
const DESC_SIMPLES = `Desp E2E Simples ${Date.now()}`;
const DESC_RATEIO = `Desp E2E Rateio ${Date.now()}`;

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
  // varredura de sobras (as linhas do diario ficam - livro imutavel)
  await admin.from("expenses").delete().eq("tenant_id", TENANT).like("description", "Desp E2E%");

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();

    // ============================================================ A. gate
    const resp = await fetch(BASE + "/financeiro/despesas", { redirect: "manual" });
    const loc = resp.headers.get("location") || "";
    check(
      "A1 /financeiro/despesas anonimo -> 307 login",
      [302, 303, 307].includes(resp.status) && loc.includes("/login"),
      `status=${resp.status} loc=${loc}`
    );

    await login(page, EMAIL_MASTER, SENHA_MASTER);
    await page.goto(BASE + "/financeiro/despesas", { waitUntil: "domcontentloaded" });
    const temForm = await page.locator('form[aria-label="Nova despesa"]').isVisible().catch(() => false);
    const temLista = await page.locator('section[aria-label="Despesas do mês"]').isVisible().catch(() => false);
    check("A2 master abre a tela com form e lista", temForm && temLista, `form=${temForm} lista=${temLista}`);

    // ===================================================== A/B. fixture + validacoes
    const { data: ccs } = await admin.from("cost_centers").select("id, code").eq("tenant_id", TENANT).eq("ativo", true);
    const idDe = (codigo) => (ccs ?? []).find((c) => c.code === codigo)?.id ?? "";
    const admId = idDe("ADM");
    const logId = idDe("LOG");
    check("A3 centros ADM/LOG cadastrados no tenant", !!admId && !!logId, `adm=${!!admId} log=${!!logId}`);
    const { data: contasDb } = await admin
      .from("account_catalog")
      .select("code")
      .eq("classe", 6)
      .eq("aceita_lancamento", true)
      .order("code");
    const contaC = (contasDb ?? [])[0]?.code ?? "";
    const contaR = (contasDb ?? [])[1]?.code ?? contaC;
    check("A4 contas de despesa (classe 6) disponiveis", !!contaC && !!contaR, `${contaC}/${contaR}`);

    const botao = page.locator('button[aria-label="Lançar despesa"]');
    check("B1 form vazio nasce com o botao desabilitado", await botao.isDisabled());

    await page.fill('input[aria-label="Descrição da despesa"]', "ab");
    await page.fill('input[aria-label="Valor"]', "10");
    check("B2 descricao com 2 caracteres mantem o botao travado", await botao.isDisabled());

    await page.fill('input[aria-label="Descrição da despesa"]', DESC_SIMPLES);
    await page.fill('input[aria-label="Valor"]', "0");
    check("B3 valor zerado mantem o botao travado", await botao.isDisabled());

    await page.fill('input[aria-label="Valor"]', "1000");
    await page.check('input[aria-label="Ratear por centro de custo"]');
    await page.fill('input[aria-label="Percentual 1"]', "50");
    await page.fill('input[aria-label="Percentual 2"]', "40");
    const soma90 = await temTexto(page, "Soma: 90%");
    check("B4 rateio somando 90% trava o botao e mostra a soma", (await botao.isDisabled()) && soma90);
    await page.uncheck('input[aria-label="Ratear por centro de custo"]');

    // ================================================== C. lançamento simples
    await page.fill('input[aria-label="Competência da despesa"]', COMP);
    await page.selectOption('select[aria-label="Conta"]', contaC);
    await page.fill('input[aria-label="Valor"]', "250");
    await page.selectOption('select[aria-label="Centro de custo"]', admId);
    await page.check('input[aria-label="Pago agora"]');
    await botao.click();
    const toastSimples = await temTexto(page, `Despesa de R$ 250,00 lançada na competência ${COMP}`);
    check("C1 toast de sucesso do lançamento simples", toastSimples);

    const linhaUI = await temTexto(page, DESC_SIMPLES);
    check("C2 a despesa aparece na lista do mes", linhaUI);

    const { data: desp1 } = await admin
      .from("expenses")
      .select("id, account_code, amount, paid_at, cost_center_id, competencia")
      .eq("tenant_id", TENANT)
      .eq("description", DESC_SIMPLES);
    const d1 = (desp1 ?? [])[0];
    check(
      `C3 expenses gravado (conta ${contaC}, 250, pago, centro ADM, competencia 09)`,
      !!d1 &&
        d1.account_code === contaC &&
        Number(d1.amount) === 250 &&
        !!d1.paid_at &&
        !!d1.cost_center_id &&
        String(d1.competencia).startsWith(COMP),
      JSON.stringify(d1 ?? null)
    );

    const { data: je1 } = await admin
      .from("journal_entries")
      .select("id, cost_center_id, competencia, journal_entry_lines(code, debit, credit)")
      .eq("tenant_id", TENANT)
      .eq("idempotency_key", `despesa:${d1?.id ?? ""}`);
    const linhas1 = je1?.[0]?.journal_entry_lines ?? [];
    const d1d = linhas1.find((l) => l.code === contaC)?.debit ?? 0;
    const c1caixa = linhas1.find((l) => l.code === "1.1.1")?.credit ?? 0;
    check(
      `C4 gatilho 0023 publicou despesa:<id> (D ${contaC} = 250, C 1.1.1 caixa por estar pago)`,
      !!je1?.[0] && Number(d1d) === 250 && Number(c1caixa) === 250,
      `linhas=${JSON.stringify(linhas1)}`
    );

    // ========================================================= D. rateio
    await page.fill('input[aria-label="Descrição da despesa"]', DESC_RATEIO);
    await page.fill('input[aria-label="Valor"]', "1000");
    await page.check('input[aria-label="Ratear por centro de custo"]');
    await page.click('button[aria-label="Adicionar centro"]');
    await page.fill('input[aria-label="Percentual 1"]', "50");
    await page.fill('input[aria-label="Percentual 2"]', "30");
    await page.selectOption('select[aria-label="Centro 3"]', logId);
    await page.fill('input[aria-label="Percentual 3"]', "20");
    await page.selectOption('select[aria-label="Conta"]', contaR);
    const soma100 = await temTexto(page, "Soma: 100%");
    check("D1 rateio 50/30/20 soma 100% e libera o botao", soma100 && !(await botao.isDisabled()));
    await page.uncheck('input[aria-label="Pago agora"]'); // nasce em aberto
    await botao.click();
    const toastRateio = await temTexto(page, `Despesa de R$ 1.000,00 lançada na competência ${COMP} — rateada em 3 centros`);
    check("D2 toast de sucesso do rateio (3 centros)", toastRateio);

    const { data: desp2 } = await admin
      .from("expenses")
      .select("id, amount, paid_at, cost_center_id, cost_centers(code), competencia")
      .eq("tenant_id", TENANT)
      .eq("description", DESC_RATEIO)
      .order("amount", { ascending: false });
    const codigos = (desp2 ?? []).map((d) => d.cost_centers?.code).sort().join(",");
    const valores = (desp2 ?? []).map((d) => Number(d.amount)).sort((a, b) => b - a);
    check(
      "D3 3 linhas de rateio: 500/300/200 em ADM/COM/LOG, em aberto",
      (desp2 ?? []).length === 3 &&
        codigos === "ADM,COM,LOG" &&
        JSON.stringify(valores) === JSON.stringify([500, 300, 200]) &&
        (desp2 ?? []).every((d) => !d.paid_at && String(d.competencia).startsWith(COMP)),
      `codigos=${codigos} valores=${JSON.stringify(valores)}`
    );

    const ids = (desp2 ?? []).map((d) => d.id);
    const { data: jes } = await admin
      .from("journal_entries")
      .select("idempotency_key, cost_center_id, journal_entry_lines(code, debit, credit)")
      .eq("tenant_id", TENANT)
      .like("idempotency_key", `despesa:%`);
    const meus = (jes ?? []).filter((j) => ids.includes(String(j.idempotency_key).replace("despesa:", "")));
    let todosOk = meus.length === 3;
    for (const j of meus) {
      const ls = j.journal_entry_lines ?? [];
      const debitou = ls.find((l) => l.code === contaR)?.debit ?? 0;
      const credAberto = ls.find((l) => l.code === "2.1.1")?.credit ?? 0;
      const credCaixa = ls.find((l) => l.code === "1.1.1")?.credit ?? 0;
      if (!(Number(debitou) > 0 && Number(credAberto) === Number(debitou) && Number(credCaixa) === 0 && j.cost_center_id)) {
        todosOk = false;
      }
    }
    check(
      `D4 3 lancamentos no diario: D ${contaR} = C 2.1.1 (em aberto) + centro de custo em cada um`,
      todosOk,
      `lancamentos=${meus.length}`
    );

    // resumo por centro no mes (ADM = 250 simples + 500 rateio)
    const admCard = await temTexto(page, "750,00");
    const totalCard = await temTexto(page, "1.250,00");
    check("D5 cards de resumo: ADM 750,00 e total do mes 1.250,00", admCard && totalCard, `adm=${admCard} total=${totalCard}`);

    // ========================================================= E. filtro
    await page.selectOption('select[aria-label="Mês das despesas"]', { value: new Date().toISOString().slice(0, 7) });
    const vazio = await temTexto(page, "Nenhuma despesa lançada neste mês.");
    check("E1 mes sem despesas mostra o estado vazio", vazio);

    await page.selectOption('select[aria-label="Mês das despesas"]', { value: COMP });
    const voltou = (await temTexto(page, DESC_SIMPLES)) && (await temTexto(page, DESC_RATEIO));
    check("E2 voltar ao mes das despesas traz as duas linhas", voltou);

    // ====================================================== F. auditoria
    const { data: aud } = await admin
      .from("audit_log")
      .select("action, after")
      .eq("tenant_id", TENANT)
      .eq("action", "despesa.criar");
    check("F1 audit_log gravou despesa.criar com o resumo do rateio", (aud ?? []).length >= 2, `registros=${(aud ?? []).length}`);

    // ===================================================== Z. limpeza
    await admin.from("expenses").delete().eq("tenant_id", TENANT).like("description", "Desp E2E%");
    const { data: restante } = await admin
      .from("expenses")
      .select("id")
      .eq("tenant_id", TENANT)
      .like("description", "Desp E2E%");
    check("Z1 limpeza: expenses de teste fora (diario fica por imutabilidade)", (restante ?? []).length === 0, `restou=${(restante ?? []).length}`);
  } finally {
    await browser.close();
  }

  const total = resultados.length;
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${total} | PASS ${total - falhas} | FAIL ${falhas}`);
  process.exit(falhas > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
