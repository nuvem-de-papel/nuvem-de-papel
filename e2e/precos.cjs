/* E2E Tabela de preços (Bloco 5 passo 2) - /configuracoes/precos:
 *   P1     a rota passa pelo middleware e manda anônimo p/ /login;
 *   P3     o menu Configurações traz o link "Tabela de preços";
 *   P4     a tela carrega com o produto recém-criado no seletor;
 *   P5/P6  valida faixa mínima no cliente e vigência (fim < início) no servidor;
 *   P7/P8  cria faixa de atacado (10 un @ R$ 9,90) e de varejo (1 un @ R$ 12,50);
 *   P9     INVARIANTE: regravar a mesma (canal, faixa) deixa UMA linha só -
 *          é o que impede o checkout de escolher preço de forma indefinida;
 *   P10    edição pela tabela atualiza o preço;
 *   P11    vigência futura marcada como "Futura";
 *   P12    produto sem nenhuma faixa aparece no aviso de "sem preço";
 *   P13    filtro reduz a lista e o estado vazio aparece;
 *   P14    remover a faixa apaga a linha.
 * Sincronização: depois de cada gravação espera-se o botão voltar a ficar
 * habilitado (a gravação é um transition) e o VALOR esperado aparecer na
 * tabela - ler antes disso mostra a tela de uma gravação atrás e, pior,
 * deixaria os campos já preenchidos serem sobrescritos pelo reset do formulário.
 * Requisitos: npm run build && npm run start (:3000).
 * Roda junto de: npm run e2e (executa depois de vendedores). */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EPOCH = Date.now();
// "0..." mantém estes SKUs no COMEÇO da ordenação por sku, para o aviso de
// "produto sem preço" (que lista os 8 primeiros) sempre citá-los.
const SKU = `0E2E-PRE-${EPOCH}`;
const SKU2 = `0E2E-PRE2-${EPOCH}`;
const ITEM = "Item E2E Tabela de Precos";
const AMANHA = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const ONTEM_NUNCA = "2029-01-01";
const FUTURO = "2030-01-01";
const BTN_SALVAR = 'button[aria-label="Salvar faixa de preco"]';

function lerEnv() {
  const env = {};
  for (const linha of fs
    .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)) {
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

async function presente(page, seletor, deve = true, timeout = 15000) {
  try {
    await page.waitForSelector(seletor, { state: deve ? "attached" : "detached", timeout });
    return true;
  } catch {
    return !deve;
  }
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

async function statusCom(page, texto, timeout = 15000) {
  try {
    await page
      .locator('p[role="status"]')
      .filter({ hasText: texto })
      .first()
      .waitFor({ state: "attached", timeout });
    return true;
  } catch {
    return false;
  }
}

/** espera a gravação terminar (botão reabilitado) antes de mexer nos campos */
async function aguardarParado(page, timeout = 30000) {
  try {
    await page.waitForFunction(
      (sel) => {
        const b = document.querySelector(sel);
        return !!b && !b.disabled;
      },
      BTN_SALVAR,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/** clica em Salvar e espera a transição terminar */
async function salvar(page) {
  await page.click(BTN_SALVAR);
  return aguardarParado(page);
}

/** espera a LINHA da faixa mostrar o valor esperado (garante refresh do RSC).
 * O Intl do Chrome separa "R$" do valor com espaço inquebrável fino (U+202F),
 * por isso o texto é normalizado antes de comparar. */
async function aguardarLinha(page, canal, faixa, texto, timeout = 25000) {
  const sel = `[aria-label="Editar preco ${SKU} ${canal} faixa ${faixa}"]`;
  try {
    await page.waitForFunction(
      ([s, t]) => {
        const btn = document.querySelector(s);
        const tr = btn && btn.closest("tr");
        if (!tr) return false;
        return tr.innerText.replace(/[  ]/g, " ").includes(t);
      },
      [sel, texto],
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

async function contarFaixas(page, canal, faixa) {
  const sel =
    canal && faixa
      ? `[aria-label="Editar preco ${SKU} ${canal} faixa ${faixa}"]`
      : `[aria-label^="Editar preco ${SKU} "]`;
  return page.$$eval(sel, (els) => els.length);
}

function feedbackAtual(page) {
  return page
    .$$eval('p[role="status"]', (els) => els.map((e) => e.innerText).join(" | "))
    .catch(() => "");
}

async function limpar() {
  const { data } = await admin
    .from("catalog_items")
    .select("id")
    .eq("tenant_id", TENANT)
    .like("sku", "0E2E-PRE%");
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length > 0) await admin.from("catalog_items").delete().in("id", ids);
}

async function main() {
  await limpar();

  const { data: item1, error: erro1 } = await admin
    .from("catalog_items")
    .insert({ tenant_id: TENANT, sku: SKU, name: ITEM, active: true })
    .select("id")
    .single();
  if (erro1 || !item1) throw new Error("nao criou o item de teste: " + (erro1?.message ?? ""));
  const { data: item2, error: erro2 } = await admin
    .from("catalog_items")
    .insert({ tenant_id: TENANT, sku: SKU2, name: "Item E2E sem preco", active: true })
    .select("id")
    .single();
  if (erro2 || !item2) throw new Error("nao criou o item 2: " + (erro2?.message ?? ""));

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    // ------------------------------------------------------------------ P1 --
    const anonCtx = await browser.newContext();
    const anon = await anonCtx.newPage();
    await anon.goto(BASE + "/configuracoes/precos", { waitUntil: "domcontentloaded" });
    await anon
      .waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 30000 })
      .catch(() => {});
    check(
      "P1 rota /configuracoes/precos manda anonimo p/ /login",
      /\/login/.test(anon.url()),
      anon.url()
    );
    await anonCtx.close();

    const page = await browser.newPage();
    page.on("dialog", (d) => void d.accept());

    // ------------------------------------------------------------------ P2 --
    await login(page, EMAIL_MASTER, SENHA_MASTER);
    check("P2 login no painel", true);

    // ------------------------------------------------------------------ P3 --
    await page.goto(BASE + "/configuracoes/precos", { waitUntil: "domcontentloaded" });
    let temLink = await presente(page, 'a[href="/configuracoes/precos"]', true, 8000);
    if (!temLink) {
      await page.click('button[aria-controls="admin-config-sub"]').catch(() => {});
      temLink = await presente(page, 'a[href="/configuracoes/precos"]', true, 8000);
    }
    check("P3 menu Configuracoes traz Tabela de precos", temLink);

    // ------------------------------------------------------------------ P4 --
    const temSelect = await presente(page, 'select[aria-label="Produto da faixa"]', true, 30000);
    check("P4 tela de tabela de precos carregou", temSelect);
    const opcoes = temSelect
      ? await page.$eval('select[aria-label="Produto da faixa"]', (s) =>
          Array.from(s.options).map((o) => o.textContent)
        )
      : [];
    check(
      "P4b produto criado aparece no seletor",
      opcoes.some((o) => (o || "").includes(SKU)),
      `${opcoes.length} opcoes`
    );
    await page.selectOption('select[aria-label="Produto da faixa"]', item1.id);

    // ------------------------------------------------------------------ P5 --
    await page.fill('input[aria-label="Faixa minima"]', "0");
    await salvar(page);
    check("P5 faixa minima 0 e recusada", await statusCom(page, "a partir de 1"));

    // ------------------------------------------------------------------ P6 --
    await page.fill('input[aria-label="Faixa minima"]', "10");
    await page.selectOption('select[aria-label="Canal da faixa"]', "atacado");
    await page.fill('input[aria-label="Preco da faixa"]', "9.90");
    await page.fill('input[aria-label="Inicio da vigencia"]', FUTURO);
    await page.fill('input[aria-label="Fim da vigencia"]', ONTEM_NUNCA);
    await salvar(page);
    check(
      "P6 vigencia invalida recusada pelo servidor",
      await statusCom(page, "depois do inicio")
    );

    // ------------------------------------------------------------------ P7 --
    await page.fill('input[aria-label="Inicio da vigencia"]', new Date().toISOString().slice(0, 10));
    await page.fill('input[aria-label="Fim da vigencia"]', "");
    await salvar(page);
    const p7 = await presente(page, `[aria-label="Editar preco ${SKU} atacado faixa 10"]`, true, 25000);
    check("P7 faixa de atacado criada (10 un @ R$ 9,90)", p7 && (await aguardarLinha(page, "atacado", "10", "R$ 9,90")));

    // ------------------------------------------------------------------ P8 --
    await page.selectOption('select[aria-label="Canal da faixa"]', "varejo");
    await page.fill('input[aria-label="Faixa minima"]', "1");
    await page.fill('input[aria-label="Preco da faixa"]', "12.50");
    await salvar(page);
    const p8 = await presente(page, `[aria-label="Editar preco ${SKU} varejo faixa 1"]`, true, 25000);
    check("P8 faixa de varejo criada (1 un @ R$ 12,50)", p8 && (await aguardarLinha(page, "varejo", "1", "R$ 12,50")));

    // ------------------------------------------------------------------ P9 --
    // regravar a MESMA (canal, faixa) com outro preço: precisa sobrar 1 linha.
    await page.selectOption('select[aria-label="Canal da faixa"]', "atacado");
    await page.fill('input[aria-label="Faixa minima"]', "10");
    await page.fill('input[aria-label="Preco da faixa"]', "7.25");
    await salvar(page);
    const p9ok = await aguardarLinha(page, "atacado", "10", "R$ 7,25");
    const qtdP9 = await contarFaixas(page, "atacado", "10");
    check("P9 regravar a faixa deixa UMA linha so", p9ok && qtdP9 === 1, `linhas=${qtdP9}`);

    // ----------------------------------------------------------------- P10 --
    await page.click(`[aria-label="Editar preco ${SKU} atacado faixa 10"]`);
    const editando = await temTexto(page, "Editando faixa 10");
    await page.fill('input[aria-label="Preco da faixa"]', "6.40");
    await salvar(page);
    const p10ok = await aguardarLinha(page, "atacado", "10", "R$ 6,40");
    check("P10 edicao pela tabela abriu o formulario", editando);
    check("P10b preco atualizado (R$ 6,40)", p10ok);

    // ----------------------------------------------------------------- P11 --
    await page.selectOption('select[aria-label="Canal da faixa"]', "varejo");
    await page.fill('input[aria-label="Faixa minima"]', "20");
    await page.fill('input[aria-label="Preco da faixa"]', "5.00");
    await page.fill('input[aria-label="Inicio da vigencia"]', AMANHA);
    await salvar(page);
    const p11 = await presente(page, `[aria-label="Editar preco ${SKU} varejo faixa 20"]`, true, 25000);
    const p11ok = p11 && (await aguardarLinha(page, "varejo", "20", "Futura"));
    check(
      "P11 vigencia futura marcada como Futura",
      p11ok,
      p11ok ? "" : `feedback: ${await feedbackAtual(page)}`
    );

    // ----------------------------------------------------------------- P12 --
    check("P12 aviso de produto sem preco cita o SKU sem faixa", await statusCom(page, SKU2));

    // ----------------------------------------------------------------- P13 --
    await page.fill('input[aria-label="Filtrar por SKU ou nome"]', "nao-existe-xyz");
    const vazio = await presente(page, "text=Nenhuma faixa por aqui", true, 10000);
    check("P13 filtro sem resultado mostra o estado vazio", vazio);
    await page.fill('input[aria-label="Filtrar por SKU ou nome"]', SKU);
    const qtdFiltro = await contarFaixas(page, null, null);
    check("P13b filtro devolve so as faixas do produto", qtdFiltro === 3, `linhas=${qtdFiltro}`);
    await page.fill('input[aria-label="Filtrar por SKU ou nome"]', "");

    // ----------------------------------------------------------------- P14 --
    await page.click(`[aria-label="Remover preco ${SKU} atacado faixa 10"]`);
    const sumiu = await presente(
      page,
      `[aria-label="Remover preco ${SKU} atacado faixa 10"]`,
      false,
      25000
    );
    const qtdDepois = await contarFaixas(page, null, null);
    check("P14 faixa removida da tabela", sumiu && qtdDepois === 2, `linhas=${qtdDepois}`);

    await page.close();
  } finally {
    await browser.close();
    await limpar();
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO - " + (e?.stack ?? e));
  process.exit(1);
});
