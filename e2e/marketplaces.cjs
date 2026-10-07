/* E2E Marketplaces (Modulo 1 - kernel):
 *   S1      a tela /configuracoes/marketplaces abre com o resumo;
 *   S2..S3  os 10 canais do catalogo aparecem (7 generalistas / 3 nichados);
 *   S4      conta com nome curto e recusada;
 *   S5      conta criada e listada (Mercado Livre);
 *   S6      ping enfileira exatamente 1 job;
 *   S7      ping repetido nao duplica (dedupe da fila);
 *   S8      processar fila conclui o ping ("ping local ok");
 *   S9      o ultimo ping da conta e preenchido;
 *   S10     validacao do produto-mestre conclui ("produto-mestre valido");
 *   S11     publicar enfileira o anuncio e falha HONESTAMENTE com
 *           "adaptador pendente (Modulo 2)" (o registro de adaptadores esta
 *           vazio - M2 liga o Mercado Livre);
 *   S12..S14 endpoint de webhook: 401 sem segredo, 200 com segredo e o
 *           replay do mesmo event_id volta "duplicado" (idempotente);
 *   S15     o job processar_webhook entra na fila;
 *   S16     remover conta limpa a linha.
 * Requisitos: npm run build && npm run start (:3000) + MARKETPLACE_WEBHOOK_SECRET no .env.local.
 * Roda junto de: npm run e2e (executa depois de clientes). */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EPOCH = Date.now();
const SKU = `SKU-E2E-MKT-${EPOCH}`;
const NOME_ITEM = `Item E2E Marketplaces ${EPOCH}`;
const LABEL = `Conta E2E MKT ${EPOCH}`;
const EVENTO = `EVT-E2E-${EPOCH}`;

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

// toda action da tela e um POST para a propria rota
function esperaAcao(page) {
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/configuracoes/marketplaces"),
    { timeout: 25000 }
  );
}

async function filaPendente(page) {
  return page.$eval('div[aria-label="Fila pendente"]', (el) => Number(el.innerText.trim()));
}

async function esperaPendentes(page, alvo) {
  return page
    .waitForFunction(
      (n) => {
        const el = document.querySelector('div[aria-label="Fila pendente"]');
        return !!el && Number(el.innerText.trim()) === n;
      },
      alvo,
      { timeout: 20000 }
    )
    .then(() => true)
    .catch(() => false);
}

// sobras de execucoes anteriores. A fila do staging so existe para o E2E
// (nao ha worker de producao aqui), entao a varredura zera os jobs do tenant:
// sem isso, jobs orfaos de uma run anterior (conta ja removida => account_id
// null, fora do filtro por conta) aparecem na fila e contaminam os contadores.
async function limpar() {
  await admin.from("marketplace_jobs").delete().eq("tenant_id", TENANT);
  // contas do TENANTE inteiro (nao so as "Conta E2E MKT%"): uma conta manual
  // criada pela UI esconde o botao "Adicionar conta" do canal e quebra a S4 -
  // a run fica refem do ultimo humano que clicou na tela. Anuncios caem em
  // cascata (account_id references marketplace_accounts on delete cascade).
  await admin.from("marketplace_accounts").delete().eq("tenant_id", TENANT);
  await admin.from("marketplace_webhooks").delete().eq("tenant_id", TENANT).like("event_id", "EVT-E2E-%");
  await admin.from("catalog_items").delete().eq("tenant_id", TENANT).like("sku", "SKU-E2E-MKT-%");
}

async function main() {
  await limpar();

  // produto-mestre completo para o M1 validar sem depender de base alheia
  const { data: item, error: erroItem } = await admin
    .from("catalog_items")
    .insert({ tenant_id: TENANT, sku: SKU, name: NOME_ITEM })
    .select("id")
    .single();
  if (erroItem || !item) throw new Error("falha ao criar item E2E: " + (erroItem?.message ?? "sem id"));

  const { error: erroPreco } = await admin
    .from("item_prices")
    .insert({ item_id: item.id, channel: "varejo", price: 19.9, min_quantity: 1 });
  if (erroPreco) throw new Error("falha ao criar preco E2E: " + erroPreco.message);

  const { error: erroEstoque } = await admin
    .from("item_stock")
    .insert({ item_id: item.id, tenant_id: TENANT, stock_available: 5, stock_on_hand: 5 });
  if (erroEstoque) throw new Error("falha ao criar estoque E2E: " + erroEstoque.message);

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  page.on("dialog", (d) => void d.accept());

  try {
    await login(page, EMAIL_MASTER, SENHA_MASTER);

    // ------------------------------------------------------------- S1 ----
    await page.goto(BASE + "/configuracoes/marketplaces", { waitUntil: "domcontentloaded" });
    const abriu = await temTexto(page, "pendente(s)", 30000);
    check("S1 tela de marketplaces abre", abriu);
    if (!abriu) throw new Error("tela de marketplaces nao abriu");

    // ------------------------------------------------------------- S2 ----
    const nCanais = await page.$$eval('[aria-label^="Canal "]', (els) => els.length);
    check("S2 os 10 canais do catalogo aparecem", nCanais === 10, `encontrados ${nCanais}`);

    // ------------------------------------------------------------- S3 ----
    const segmentos = await temTexto(page, "7 generalistas · 3 nichados", 5000);
    check("S3 contagem de segmentos (7 / 3)", segmentos);

    // ------------------------------------------------------------- S4 ----
    await page.click('button[aria-label="Adicionar conta Mercado Livre"]');
    await page.fill('input[aria-label="Nome da conta Mercado Livre"]', "A");
    const rCurto = esperaAcao(page);
    await page.click('button[aria-label="Salvar conta Mercado Livre"]');
    await rCurto;
    const recusou = await temTexto(page, "Nome da conta precisa de 2 a 80 caracteres.", 10000);
    check("S4 conta com nome curto e recusada", recusou);

    // ------------------------------------------------------------- S5 ----
    await page.fill('input[aria-label="Nome da conta Mercado Livre"]', LABEL);
    const rCria = esperaAcao(page);
    await page.click('button[aria-label="Salvar conta Mercado Livre"]');
    await rCria;
    const temPing = await presente(page, `button[aria-label="Ping ${LABEL}"]`, true, 25000);
    check("S5 conta criada e listada", temPing, LABEL);

    // ------------------------------------------------------------- S6 ----
    const antes = await filaPendente(page);
    const rPing1 = esperaAcao(page);
    await page.click(`button[aria-label="Ping ${LABEL}"]`);
    await rPing1;
    const subiu = await esperaPendentes(page, antes + 1);
    check("S6 ping enfileira exatamente 1 job", subiu, `pendentes ${antes} -> ${antes + 1}`);

    // ------------------------------------------------------------- S7 ----
    const rPing2 = esperaAcao(page);
    await page.click(`button[aria-label="Ping ${LABEL}"]`);
    await rPing2;
    await page.waitForTimeout(800); // re-render pos-action
    const depois = await filaPendente(page);
    check("S7 ping repetido nao duplica (dedupe)", depois === antes + 1, `pendentes=${depois}`);

    // ------------------------------------------------------------- S8 ----
    const rProc1 = esperaAcao(page);
    await page.click('button[aria-label="Processar fila"]');
    await rProc1;
    const resumoPing = await temTexto(page, "Concluídos: 1", 20000);
    const jobPing = await temTexto(page, "ping local ok", 15000);
    check("S8 processar fila conclui o ping", resumoPing && jobPing);

    // ------------------------------------------------------------- S9 ----
    // espera a coluna sair de "nunca" (o update do ping tem de subir para a tela)
    const pingOk = await page
      .waitForFunction(
        (alvo) => {
          const td = document.querySelector(`td[aria-label="Ultimo ping ${alvo}"]`);
          return !!td && td.innerText.trim() !== "nunca";
        },
        LABEL,
        { timeout: 15000 }
      )
      .then(() => true)
      .catch(() => false);
    const txtPing = await page
      .$eval(`td[aria-label="Ultimo ping ${LABEL}"]`, (el) => el.innerText.trim())
      .catch(() => "(celula nao encontrada)");
    check("S9 ultimo ping da conta preenchido", pingOk, txtPing);

    // ------------------------------------------------------------ S10 ----
    await page.selectOption('select[aria-label="Produto para anuncio"]', {
      label: `${SKU} - ${NOME_ITEM}`,
    });
    const rVal = esperaAcao(page);
    await page.click('button[aria-label="Validar produto"]');
    await rVal;
    const rProc2 = esperaAcao(page);
    await page.click('button[aria-label="Processar fila"]');
    await rProc2;
    const validado = await temTexto(page, "produto-mestre valido", 20000);
    check("S10 validacao do produto-mestre conclui", validado);

    // ------------------------------------------------------------ S11 ----
    const rPub = esperaAcao(page);
    await page.click('button[aria-label="Enfileirar publicacao"]');
    await rPub;
    const anuncio = await presente(page, `tr[aria-label="Anuncio ${SKU}"]`, true, 20000);
    const rProc3 = esperaAcao(page);
    await page.click('button[aria-label="Processar fila"]');
    await rProc3;
    const adaptador = await temTexto(page, "pendente de implementacao", 20000);
    const linhaAnuncio = await page
      .$eval(`tr[aria-label="Anuncio ${SKU}"]`, (el) => el.innerText)
      .catch(() => "");
    if (!(anuncio && adaptador && linhaAnuncio.includes("Erro"))) {
      // depuracao: o que a secao de anuncios e o feedback estao mostrando
      const rotulos = await page
        .$$eval('tr[aria-label^="Anuncio"]', (els) => els.map((e) => e.getAttribute("aria-label")))
        .catch(() => []);
      const feedback = await page
        .$eval('p[role="status"]', (el) => el.innerText)
        .catch(() => "(sem feedback)");
      const vazio = await temTexto(page, "Nenhum anúncio", 1000).catch(() => false);
      console.log(
        `DEBUG S11 | anuncio=${anuncio} adaptador=${adaptador} linhas=[${rotulos.join("; ")}] feedback="${feedback}" listaVazia=${vazio}`
      );
    }
    check(
      "S11 publicacao falha honesta: adaptador pendente (Modulo 2)",
      anuncio && adaptador && linhaAnuncio.includes("Erro"),
      linhaAnuncio.replace(/\s+/g, " ").slice(0, 120)
    );

    // ------------------------------------------------------------ S12 ----
    const corpo = JSON.stringify({
      channel_slug: "mercado-livre",
      event_id: EVENTO,
      topic: "orders",
      payload: { id: "12345" },
    });
    const baseHeaders = { "content-type": "application/json" };
    const semSegredo = await fetch(`${BASE}/api/webhooks/marketplace`, {
      method: "POST",
      headers: baseHeaders,
      body: corpo,
    });
    check("S12 webhook sem segredo responde 401", semSegredo.status === 401, `status ${semSegredo.status}`);

    // ------------------------------------------------------------ S13 ----
    const comSegredo = env.MARKETPLACE_WEBHOOK_SECRET;
    const recebido = await fetch(`${BASE}/api/webhooks/marketplace`, {
      method: "POST",
      headers: { ...baseHeaders, "x-marketplace-secret": comSegredo ?? "" },
      body: corpo,
    });
    const jRecebido = await recebido.json().catch(() => ({}));
    check(
      "S13 webhook com segredo e aceito",
      recebido.status === 200 && jRecebido.status === "recebido" && comSegredo,
      `status ${recebido.status} ${JSON.stringify(jRecebido)}`
    );

    // ------------------------------------------------------------ S14 ----
    const replay = await fetch(`${BASE}/api/webhooks/marketplace`, {
      method: "POST",
      headers: { ...baseHeaders, "x-marketplace-secret": comSegredo ?? "" },
      body: corpo,
    });
    const jReplay = await replay.json().catch(() => ({}));
    check(
      "S14 replay do mesmo event_id e idempotente",
      replay.status === 200 && jReplay.status === "duplicado",
      JSON.stringify(jReplay)
    );

    // ------------------------------------------------------------ S15 ----
    const rProc4 = esperaAcao(page);
    await page.click('button[aria-label="Processar fila"]');
    await rProc4;
    const jobWebhook = await temTexto(page, "processar_webhook", 20000);
    check("S15 job do webhook entra na fila", jobWebhook);

    // ------------------------------------------------------------ S16 ----
    await page.click(`button[aria-label="Remover conta ${LABEL}"]`);
    const sumiu = await presente(page, `button[aria-label="Ping ${LABEL}"]`, false, 25000);
    check("S16 conta E2E removida", sumiu);
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
