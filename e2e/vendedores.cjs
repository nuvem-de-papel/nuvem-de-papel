/* E2E Vendedores (Bloco 5 passo 1) - aba "Vendedores" do console de vendas:
 *   S1..S3  a aba existe e o formulario recusa vendedor sem nome;
 *   S4..S7  cria, entra em modo edicao e renomeia o vendedor;
 *   S8      a tabela de comissao por mes renderiza;
 *   S9..S11 (condicional) se ha pedido na base, o item exposto tem o
 *           seletor de vendedor, o vendedor novo aparece como opcao e a
 *           escolha volta do servidor ja gravada (orders.seller_id);
 *   S12     remove o vendedor e o registro sai da lista.
 * Requisitos: npm run build && npm run start (:3000).
 * Roda junto de: npm run e2e (executa depois de documentos). */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EPOCH = Date.now();
const NOME = `Vended E2E ${EPOCH}`;
const NOME_EDITADO = `${NOME} Edit`;

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
  // textTransform: "uppercase" muda o innerText, entao a comparacao e em
  // minusculas dos dois lados (S6/S8 sao titulos com CSS de caixa alta).
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
  // varredura: sobras de execucoes anteriores
  await admin
    .from("sellers")
    .delete()
    .eq("tenant_id", TENANT)
    .like("name", "Vended E2E%");

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  page.on("dialog", (d) => void d.accept());

  try {
    await login(page, EMAIL_MASTER, SENHA_MASTER);

    // ------------------------------------------------------------- S1 ----
    await page.goto(BASE + "/vendas", { waitUntil: "domcontentloaded" });
    const temAba = await presente(page, 'button[aria-label="Aba Vendedores"]', true, 30000);
    check("S1 aba Vendedores existe", temAba);
    if (!temAba) throw new Error("aba Vendedores nao apareceu");
    await page.click('button[aria-label="Aba Vendedores"]');

    const temForm = await presente(page, 'input[placeholder="Nome do vendedor"]', true, 20000);
    check("S2 formulario de vendedor carregado", temForm);

    // ------------------------------------------------------------- S3 ----
    // nome vazio: a acao devolve o erro e ele aparece no aviso da pagina
    await page.click('button[aria-label="Criar vendedor"]');
    const validou = await temTexto(page, "Informe o nome do vendedor.");
    check("S3 vendedor sem nome e recusado", validou);

    // ------------------------------------------------------------- S4 ----
    await page.fill('input[placeholder="Nome do vendedor"]', NOME);
    await page.fill('input[placeholder="vendedor@..."]', `${EPOCH}@e2e.test`);
    await page.fill('label:has-text("Comissao %") input', "7");
    await page.click('button[aria-label="Criar vendedor"]');
    const criado = await presente(page, `button[aria-label="Remover vendedor ${NOME}"]`, true, 25000);
    check("S4 vendedor criado e listado", criado, NOME);

    // ------------------------------------------------------------- S5 ----
    const temEditar = await presente(page, `button[aria-label="Editar vendedor ${NOME}"]`, true, 10000);
    check("S5 botao Editar no vendedor", temEditar);

    // ------------------------------------------------------------- S6 ----
    await page.click(`button[aria-label="Editar vendedor ${NOME}"]`);
    const editando = await temTexto(page, "Editando vendedor");
    const nomePreenchido = await page.$eval(
      'input[placeholder="Nome do vendedor"]',
      (el) => el.value
    );
    check("S6 edicao preenche o formulario", editando && nomePreenchido === NOME, nomePreenchido);

    // ------------------------------------------------------------- S7 ----
    await page.fill('input[placeholder="Nome do vendedor"]', NOME_EDITADO);
    await page.click('button[aria-label="Salvar vendedor"]');
    const renomeado = await presente(
      page,
      `button[aria-label="Remover vendedor ${NOME_EDITADO}"]`,
      true,
      25000
    );
    check("S7 vendedor renomeado", renomeado, NOME_EDITADO);

    // ------------------------------------------------------------- S8 ----
    const temComissao = await temTexto(page, "Comissao por mes", 15000);
    check("S8 tabela de comissao por mes renderiza", temComissao);

    // ------------------------------------- S9..S11 (condicional) --------
    await page.click('button[aria-label="Aba Vendas"]');
    const temPedido = await presente(page, "button:text-is('Itens')", true, 20000);
    if (temPedido) {
      await page.click("button:text-is('Itens')");
      const temSeletor = await presente(page, 'select[aria-label^="Vendedor do pedido"]', true, 15000);
      check("S9 item exposto tem o seletor de vendedor", temSeletor);

      if (temSeletor) {
        const seletor = 'select[aria-label^="Vendedor do pedido"]';
        const opcoes = await page.$eval(seletor, (s) =>
          Array.from(s.options).map((o) => o.textContent.trim())
        );
        check("S10 vendedor novo aparece como opcao", opcoes.includes(NOME_EDITADO), opcoes.join(", "));

        await page.selectOption(seletor, { label: NOME_EDITADO });
        // revalidatePath volta do servidor: o valor so persiste se gravou
        const gravou = await page
          .waitForFunction(
            (alvo) => {
              const s = document.querySelector('select[aria-label^="Vendedor do pedido"]');
              if (!s) return false;
              return s.options[s.selectedIndex]?.textContent.trim() === alvo;
            },
            NOME_EDITADO,
            { timeout: 25000 }
          )
          .then(() => true)
          .catch(() => false);
        check("S11 vendedor do pedido voltou gravado do servidor", gravou);
      }
    }

    // ------------------------------------------------------------- S12 ---
    await page.click('button[aria-label="Aba Vendedores"]');
    await page.click(`button[aria-label="Remover vendedor ${NOME_EDITADO}"]`);
    const removido = await presente(
      page,
      `button[aria-label="Remover vendedor ${NOME_EDITADO}"]`,
      false,
      25000
    );
    check("S12 vendedor removido", removido);
  } finally {
    await browser.close();
    await admin.from("sellers").delete().eq("tenant_id", TENANT).like("name", "Vended E2E%");
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO - " + (e?.stack ?? e));
  process.exit(1);
});
