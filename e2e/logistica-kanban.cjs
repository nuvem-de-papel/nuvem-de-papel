/* E2E Logistica - quadro kanban (22/11/2026).
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Cobre: quadro abre por padrao com 5 colunas, cartao do pedido na coluna
 * certa, soltar fora da proxima etapa e recusado (status intacto), arrastar
 * para a proxima etapa avanca (pago -> processando), botao do cartao avanca
 * (processando -> em_rota), arrastar para Entregue fecha o pedido e o cartao
 * fica na coluna Entregue (7 dias), auditoria das 3 transicoes, "Ver em
 * lista" mostra a tabela e fica gravado depois do reload.
 * Cria cliente + pedido proprios e apaga no fim (o diario fica, mesmo
 * criterio das outras suites). */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const { email: EMAIL_MASTER, password: SENHA_MASTER } = require("./_credenciais-e2e.cjs");
const TENANT = "00000000-0000-0000-0000-000000000001";
const EPOCH = Date.now();
const NOME = `Kanban E2E ${EPOCH}`;

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

async function aguardar(fn, ok, tentativas = 20, pausa = 500) {
  let v;
  for (let i = 0; i < tentativas; i++) {
    v = await fn();
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, pausa));
  }
  return v;
}

async function login(page, email, senha) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

// arrasto HTML5 com o mesmo DataTransfer em todos os eventos (o React le o
// estado do dragstart no drop)
async function arrastar(page, origem, destino) {
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await origem.dispatchEvent("dragstart", { dataTransfer: dt });
  await destino.dispatchEvent("dragenter", { dataTransfer: dt });
  await destino.dispatchEvent("dragover", { dataTransfer: dt });
  await destino.dispatchEvent("drop", { dataTransfer: dt });
  await origem.dispatchEvent("dragend", { dataTransfer: dt }).catch(() => {});
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  let customerId = null;
  let pedidoId = null;

  try {
    // ------------------------------------------------ fixture ----
    const { data: cli, error: eCli } = await admin
      .from("customers")
      .insert({ tenant_id: TENANT, name: NOME, email: `e2e-kanban-${EPOCH}@exemplo.com` })
      .select("id")
      .single();
    customerId = cli?.id ?? null;
    const { data: ped, error: ePed } = await admin
      .from("orders")
      .insert({ tenant_id: TENANT, customer_id: customerId, status: "pago", total_amount: 31.5 })
      .select("id")
      .single();
    pedidoId = ped?.id ?? null;
    check("K0 fixture (cliente + pedido pago)", !!customerId && !!pedidoId, (eCli || ePed)?.message ?? "");
    if (!pedidoId) throw new Error("sem fixture");

    const lerStatus = async () =>
      (await admin.from("orders").select("status").eq("id", pedidoId).maybeSingle()).data?.status;

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await login(page, EMAIL_MASTER, SENHA_MASTER);
    // comeca sempre no quadro (padrao), mesmo que um run anterior tenha gravado "lista"
    await page.goto(BASE + "/logistica", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.localStorage.removeItem("np-logistica-vista"));
    await page.goto(BASE + "/logistica", { waitUntil: "domcontentloaded" });

    // ------------------------------------------------ A) quadro ----
    const quadro = page.locator('[aria-label="Quadro de expedição"]');
    await quadro.waitFor({ timeout: 20000 });
    const colunas = quadro.locator("section.kanban-col");
    const nCol = await colunas.count();
    check("A1 quadro abre por padrao com 5 colunas", nCol === 5, `n=${nCol}`);
    const rotulos = await colunas.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    check(
      "A2 colunas na ordem do fluxo",
      JSON.stringify(rotulos) ===
        JSON.stringify(["Coluna Aguardando pagamento", "Coluna Pago", "Coluna Separando", "Coluna Em rota", "Coluna Entregue"]),
      JSON.stringify(rotulos)
    );
    const vistaQuadro = await page.locator('[aria-label="Modo de exibição"] button:has-text("Quadro")').getAttribute("aria-pressed");
    check("A3 botao Quadro marcado", vistaQuadro === "true", vistaQuadro);

    const cartao = page.locator(`article.kanban-card[data-pedido="${pedidoId}"]`);
    const col = (s) => page.locator(`section.kanban-col[data-coluna="${s}"]`);
    await col("pago").locator(`article[data-pedido="${pedidoId}"]`).waitFor({ timeout: 15000 });
    check("A4 cartao do pedido na coluna Pago", (await col("pago").locator(`article[data-pedido="${pedidoId}"]`).count()) === 1);
    const textoCartao = (await cartao.innerText()).replace(/\s+/g, " ");
    check("A5 cartao mostra cliente e codigo", textoCartao.includes(NOME) && textoCartao.includes(pedidoId.slice(0, 8).toUpperCase()), textoCartao);
    check("A6 cartao arrastavel", (await cartao.getAttribute("draggable")) === "true");

    // ------------------------------------------------ B) soltar errado ----
    await arrastar(page, cartao, col("em_rota"));
    await page.locator("text=Não dá para mover de Pago para Em rota").first().waitFor({ timeout: 10000 });
    check("B1 soltar fora da proxima etapa mostra aviso", true);
    await new Promise((r) => setTimeout(r, 800));
    check("B2 status continua pago", (await lerStatus()) === "pago");

    // ------------------------------------------------ C) arrastar certo ----
    await arrastar(page, cartao, col("processando"));
    await page.locator("text=marcado como processando").first().waitFor({ timeout: 15000 });
    const stProc = await aguardar(lerStatus, (s) => s === "processando");
    check("C1 arrastar para Separando grava processando", stProc === "processando", stProc);
    await col("processando").locator(`article[data-pedido="${pedidoId}"]`).waitFor({ timeout: 15000 });
    check("C2 cartao mudou para a coluna Separando", (await col("pago").locator(`article[data-pedido="${pedidoId}"]`).count()) === 0);

    // ------------------------------------------------ D) botao do cartao ----
    await page.locator(`article.kanban-card[data-pedido="${pedidoId}"] button:has-text("Enviar")`).click();
    await page.locator("text=marcado como em rota").first().waitFor({ timeout: 15000 });
    const stRota = await aguardar(lerStatus, (s) => s === "em_rota");
    check("D1 botao Enviar do cartao grava em_rota", stRota === "em_rota", stRota);
    await col("em_rota").locator(`article[data-pedido="${pedidoId}"]`).waitFor({ timeout: 15000 });
    check("D2 cartao na coluna Em rota", true);

    // ------------------------------------------------ E) entregue ----
    await arrastar(page, page.locator(`article.kanban-card[data-pedido="${pedidoId}"]`), col("entregue"));
    await page.locator("text=marcado como entregue").first().waitFor({ timeout: 15000 });
    const stEnt = await aguardar(lerStatus, (s) => s === "entregue");
    check("E1 arrastar para Entregue grava entregue", stEnt === "entregue", stEnt);
    const cartaoEnt = col("entregue").locator(`article[data-pedido="${pedidoId}"]`);
    await cartaoEnt.waitFor({ timeout: 15000 });
    const txtEnt = await cartaoEnt.innerText();
    check("E2 cartao na coluna Entregue com a data", /Entregue \d{2}\/\d{2}/.test(txtEnt), txtEnt.replace(/\s+/g, " "));
    check("E3 cartao entregue nao e arrastavel", (await cartaoEnt.getAttribute("draggable")) !== "true");
    const { count: auditorias } = await admin
      .from("audit_log")
      .select("*", { count: "exact", head: true })
      .eq("action", "logistica.avancar")
      .eq("entity_id", pedidoId);
    check("E4 tres transicoes auditadas", auditorias === 3, `n=${auditorias}`);

    // ------------------------------------------------ F) lista ----
    await page.locator('[aria-label="Modo de exibição"] button:has-text("Ver em lista")').click();
    const tabela = page.locator('table[aria-label="Lista de expedição"]');
    const semFila = page.locator("text=Nenhum pedido aguardando separação");
    await Promise.race([tabela.waitFor({ timeout: 10000 }), semFila.waitFor({ timeout: 10000 })]).catch(() => {});
    check("F1 Ver em lista troca o quadro pela lista", (await quadro.count()) === 0 && ((await tabela.count()) === 1 || (await semFila.count()) > 0));
    check("F2 pedido entregue fora da lista (so fila ativa)", (await page.locator(`tr[data-pedido="${pedidoId}"]`).count()) === 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await Promise.race([tabela.waitFor({ timeout: 15000 }), semFila.waitFor({ timeout: 15000 })]).catch(() => {});
    check("F3 escolha da lista fica gravada no reload", (await quadro.count()) === 0);
    await page.locator('[aria-label="Modo de exibição"] button:has-text("Quadro")').click();
    await quadro.waitFor({ timeout: 10000 });
    check("F4 volta para o quadro", (await quadro.count()) === 1);

    await ctx.close();
  } catch (e) {
    check("execucao sem excecao", false, e && e.message);
  } finally {
    try {
      if (pedidoId) {
        await admin.from("email_messages").delete().eq("related_entity", "orders").eq("related_id", pedidoId);
        await admin.from("orders").delete().eq("id", pedidoId);
      }
      if (customerId) await admin.from("customers").delete().eq("id", customerId);
    } catch (e) {
      console.log("cleanup:", e && e.message);
    }
    await browser.close();
  }

  const pass = resultados.filter((r) => r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${pass} | FAIL ${resultados.length - pass}`);
  process.exit(pass === resultados.length ? 0 : 1);
}

main();
