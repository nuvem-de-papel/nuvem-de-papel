/* E2E Lancamento (0055 - 17/11/2026) + catalogo administrativo por setores.
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Rode: node e2e/lancamento.cjs
 * Cobre:
 *  - cadastro: marcar "Lancamento ate" sugere hoje + 30 (fuso de Brasilia) e
 *    o Salvar grava catalog_items.lancamento_ate;
 *  - vitrine (anonimo): carrossel "Lancamentos" na home + selo "Novo" no card;
 *  - catalogo administrativo (/produtos da equipe): abre SO com a lista de
 *    setores, clicar no setor abre os produtos dele (?setor=), Voltar retorna
 *    a lista, busca acha o produto direto, filtro Lancamento + etiqueta
 *    "Novo ate dd/mm", Tabela/Grade/Novo produto na mesma linha do Voltar;
 *  - vencimento: lancamento_ate no passado = produto normal sozinho (sai do
 *    carrossel, perde o selo, cadastro carrega desmarcado).
 * Semeia o proprio item (SKU-E2E-LANC-*) e apaga no final. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const { email: EMAIL_MASTER, password: SENHA_MASTER } = require("./_credenciais-e2e.cjs");
const TENANT = "00000000-0000-0000-0000-000000000001";
const SKU = `SKU-E2E-LANC-${Date.now()}`;
const NOME = "Caderno E2E Lancamento";
const SETOR = "E2E Lançamento";

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

// mesma regra de src/lib/lancamento.ts (fuso de Brasilia, texto AAAA-MM-DD)
const FMT_BR = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function somarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
const HOJE = FMT_BR.format(new Date());
const PADRAO = somarDias(HOJE, 30);
const ONTEM = somarDias(HOJE, -1);
const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

async function login(page, email, senha) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

async function esperarFeed(page, trecho, timeout = 20000) {
  await page.waitForFunction(
    (t) => (document.querySelector(".ct-feed")?.textContent || "").includes(t),
    trecho,
    { timeout }
  );
  return (await page.locator(".ct-feed").textContent()) || "";
}

// innerText: so o que esta visivel (o textContent do body traria o payload RSC
// com todos os SKUs); minusculo porque etiquetas usam text-transform.
async function textoTela(page) {
  return ((await page.locator("body").innerText()) || "").toLowerCase();
}

async function lerLancamento() {
  const { data } = await admin.from("catalog_items").select("lancamento_ate").eq("sku", SKU).maybeSingle();
  return data?.lancamento_ate ?? null;
}

async function abrirCadastro(page) {
  await page.goto(`${BASE}/configuracoes/cadastro?tela=produto&sku=${encodeURIComponent(SKU)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "Cadastro de produto" }).waitFor({ timeout: 15000 });
  await page.waitForFunction((n) => document.getElementById("ct-prod-descricao")?.value === n, NOME, { timeout: 15000 });
}

async function main() {
  // lixo de rodada anterior que morreu no meio
  await admin.from("catalog_items").delete().like("sku", "SKU-E2E-LANC-%");

  const { data: novo, error: eNovo } = await admin
    .from("catalog_items")
    .insert({ tenant_id: TENANT, sku: SKU, name: NOME, category: SETOR, active: true })
    .select("id")
    .single();
  if (eNovo) throw new Error("seed do item: " + eNovo.message);
  const { error: ePreco } = await admin.from("item_prices").insert({
    item_id: novo.id,
    channel: "varejo",
    price: 19.9,
    min_quantity: 1,
    valid_from: "1970-01-01",
  });
  if (ePreco) throw new Error("seed do preco: " + ePreco.message);

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const ctxEquipe = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctxEquipe.newPage();
    page.on("dialog", (d) => d.accept());
    await login(page, EMAIL_MASTER, SENHA_MASTER);

    // ---------- cadastro ----------
    await abrirCadastro(page);
    check(
      "L1 produto novo abre desmarcado e sem data",
      !(await page.isChecked("#ct-prod-lancamento")) && (await page.inputValue("#ct-prod-lancamento-ate")) === ""
    );
    await page.check("#ct-prod-lancamento");
    const sugerida = await page.inputValue("#ct-prod-lancamento-ate");
    check("L2 marcar sugere hoje + 30 dias", sugerida === PADRAO, `${sugerida} (esperado ${PADRAO})`);
    await page.getByRole("button", { name: "Salvar" }).click();
    const feed = await esperarFeed(page, "Produto salvo");
    check("L3 Salvar grava lancamento_ate", (await lerLancamento()) === PADRAO, `${feed.trim()} | banco ${await lerLancamento()}`);

    // ---------- vitrine (anonimo) ----------
    const ctxAnon = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const loja = await ctxAnon.newPage();
    await loja.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    const noCarrossel = loja.locator(`section[aria-label="Lançamentos"] a[href="/produtos/${SKU}"]`);
    await noCarrossel.first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
    check("L4 home mostra o item no carrossel Lançamentos", (await noCarrossel.count()) > 0);
    check(
      "L5 card do lançamento tem o selo Novo",
      (await loja.locator(`section[aria-label="Lançamentos"] a[href="/produtos/${SKU}"] [data-selo="novo"]`).count()) > 0
    );

    // ---------- catalogo administrativo por setores ----------
    await page.goto(BASE + "/produtos", { waitUntil: "domcontentloaded" });
    const tabelaSetores = page.locator('table[aria-label="Setores"]');
    await tabelaSetores.waitFor({ timeout: 15000 });
    const textoInicial = await textoTela(page);
    check(
      "A1 abre só com a lista de setores (sem produtos)",
      (await page.getByRole("button", { name: `Abrir setor ${SETOR}` }).count()) === 1 && !textoInicial.includes(SKU.toLowerCase())
    );
    // 0057: a lista vem agrupada (um tbody por grupo); a ordem alfabetica vale dentro de cada grupo,
    // e o setor sem mapeamento (fixture E2E) cai no bloco "Sem grupo".
    const blocosSetores = tabelaSetores.locator("tbody[aria-label^='Grupo ']");
    const totalBlocos = await blocosSetores.count();
    let ordemOk = totalBlocos > 0;
    let totalSetores = 0;
    for (let i = 0; i < totalBlocos; i++) {
      const limpos = (await blocosSetores.nth(i).locator("button").allTextContents()).map((s) => s.replace("▸", "").trim());
      totalSetores += limpos.length;
      const ordenados = [...limpos].sort((a, b) => a.localeCompare(b, "pt-BR"));
      if (limpos.join("|") !== ordenados.join("|")) ordemOk = false;
    }
    check("A2 setores em ordem alfabética dentro de cada grupo", ordemOk, `${totalBlocos} grupos, ${totalSetores} setores`);
    check(
      "A2b setor sem mapeamento cai em Sem grupo",
      (await tabelaSetores.locator("tbody[aria-label='Grupo Sem grupo']").getByRole("button", { name: `Abrir setor ${SETOR}` }).count()) === 1
    );

    // botoes na mesma linha do Voltar
    const voltar = page.locator(".page-header-back");
    const novoProd = page.locator(".page-header").getByRole("link", { name: "Novo produto" });
    const grupoVis = page.locator('.page-header [aria-label="Visualização"]');
    const bV = await voltar.boundingBox();
    const bN = await novoProd.boundingBox();
    const centro = (b) => (b ? b.y + b.height / 2 : -999);
    check(
      "A3 Tabela/Grade e Novo produto na linha do Voltar, antes dele",
      (await grupoVis.count()) === 1 && !!bV && !!bN && Math.abs(centro(bV) - centro(bN)) <= 12 && bN.x < bV.x,
      `centros ${centro(bN).toFixed(0)} x ${centro(bV).toFixed(0)}`
    );

    await page.getByRole("button", { name: `Abrir setor ${SETOR}` }).click();
    await page.getByText(SKU, { exact: true }).first().waitFor({ timeout: 10000 });
    check("A4 clicar no setor abre os produtos dele", new URL(page.url()).searchParams.get("setor") === SETOR);
    const textoSetor = await textoTela(page);
    check("A5 etiqueta Novo até dd/mm no catálogo", textoSetor.includes(`novo até ${dataCurta(PADRAO)}`));

    await voltar.click();
    await tabelaSetores.waitFor({ timeout: 10000 });
    check("A6 Voltar retorna à lista de setores", !new URL(page.url()).searchParams.has("setor"));

    await page.fill('input[aria-label="Buscar por SKU ou nome"]', SKU);
    await page.getByText(SKU, { exact: true }).first().waitFor({ timeout: 10000 });
    check("A7 busca acha o produto direto (sem escolher setor)", (await tabelaSetores.count()) === 0);
    await page.getByRole("button", { name: "Limpar" }).click();
    await tabelaSetores.waitFor({ timeout: 10000 });

    await page.selectOption('select[aria-label="Situação"]', "lancamento");
    await page.getByText(SKU, { exact: true }).first().waitFor({ timeout: 10000 });
    check("A8 filtro Lançamento lista o item", true);
    await page.getByRole("button", { name: "Limpar" }).click();
    await tabelaSetores.waitFor({ timeout: 10000 });
    check("A9 Limpar volta para a lista de setores", (await tabelaSetores.count()) === 1);

    // ---------- vencimento: vira produto normal sozinho ----------
    await admin.from("catalog_items").update({ lancamento_ate: ONTEM }).eq("sku", SKU);
    await loja.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await loja.waitForTimeout(800);
    check("V1 vencido sai do carrossel Lançamentos", (await noCarrossel.count()) === 0);
    check("V2 vencido perde o selo Novo", (await loja.locator(`a[href="/produtos/${SKU}"] [data-selo="novo"]`).count()) === 0);

    await page.goto(`${BASE}/produtos?setor=${encodeURIComponent(SETOR)}`, { waitUntil: "domcontentloaded" });
    await page.getByText(SKU, { exact: true }).first().waitFor({ timeout: 15000 });
    const textoVencido = await textoTela(page);
    check("V3 vencido sem etiqueta Novo até no catálogo", !textoVencido.includes("novo até"));

    await abrirCadastro(page);
    check(
      "V4 cadastro carrega vencido desmarcado e sem data",
      !(await page.isChecked("#ct-prod-lancamento")) && (await page.inputValue("#ct-prod-lancamento-ate")) === ""
    );
  } finally {
    await browser.close();
    await admin.from("catalog_items").delete().like("sku", "SKU-E2E-LANC-%");
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERRO:", e.message);
  await admin.from("catalog_items").delete().like("sku", "SKU-E2E-LANC-%");
  process.exit(1);
});
