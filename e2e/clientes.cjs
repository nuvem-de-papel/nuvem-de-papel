/* E2E Cadastro de cliente funcional (Bloco 5 passo 3) -
 * /configuracoes/cadastro?tela=cliente (antes era formulario de exemplo):
 *   P1     a rota passa pelo middleware e manda anonimo p/ /login;
 *   P2     o menu Cadastros traz o sub-item "Clientes";
 *   P3     o contador "Clientes total" e igual ao banco (nada de 318 fixo);
 *   P4     valida nome no cliente antes de chamar o servidor;
 *   P5     valida e-mail no cliente (obrigatorio: customers.email e NOT NULL);
 *   P6     cria pelo modal, o modal fecha e o contador sobe;
 *   P7     o servidor recusa e-mail duplicado (unique (tenant_id,email));
 *   P8     o servidor recusa CPF/CNPJ com digito verificador errado;
 *   P9     edicao de nivel + pontos grava e SOBREVIVE ao reload;
 *   P10    busca por e-mail reabre a ficha ja preenchida;
 *   P11    INVARIANTE: cliente com pedido NAO sai (FK on delete restrict);
 *   P12    sem pedido ele sai e o contador volta ao valor inicial.
 * Sincronizacao: toda gravacao e um transition - espera-se o botao voltar a
 * ficar habilitado e a mensagem/contador correto antes de seguir.
 * Requisitos: npm run build && npm run start (:3000).
 * Roda junto de: npm run e2e (executa depois de precos). */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EPOCH = Date.now();
const NOME_TESTE = `Cliente E2E ${EPOCH}`;
const EMAIL_TESTE = `e2e-cli-${EPOCH}@example.com`;
const CPF_VALIDO = "11144477735";
const CPF_INVALIDO = "11111111111";
const ROTA = "/configuracoes/cadastro?tela=cliente";
const BTN_SALVAR = 'button[aria-label="Salvar cliente"]';

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

function feedbackAtual(page) {
  return page
    .$$eval('p[role="status"]', (els) => els.map((e) => e.innerText).join(" | "))
    .catch(() => "");
}

/** espera a gravacao terminar (botao reabilitado) antes de mexer nos campos */
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

/** clica em Salvar e espera a transicao terminar */
async function salvar(page) {
  await page.click(BTN_SALVAR);
  return aguardarParado(page);
}

async function contador(page, rotulo) {
  const t = await page.textContent(`[aria-label="${rotulo}"]`).catch(() => null);
  const n = parseInt(String(t ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : -1;
}

async function aguardarContador(page, rotulo, valor, timeout = 25000) {
  try {
    await page.waitForFunction(
      ([sel, v]) => {
        const e = document.querySelector(sel);
        return !!e && e.innerText.trim() === String(v);
      },
      [`[aria-label="${rotulo}"]`, valor],
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/** limpa o que a suite deixou (cliente de teste e pedidos dele) */
async function limpar() {
  const { data: cli } = await admin
    .from("customers")
    .select("id")
    .eq("tenant_id", TENANT)
    .eq("email", EMAIL_TESTE);
  const ids = (cli ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  const { data: ped } = await admin.from("orders").select("id").in("customer_id", ids);
  const pedidos = (ped ?? []).map((r) => r.id);
  if (pedidos.length > 0) await admin.from("orders").delete().in("id", pedidos);
  await admin.from("customers").delete().in("id", ids);
}

async function main() {
  await limpar();

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    // ------------------------------------------------------------------ P1 --
    const anonCtx = await browser.newContext();
    const anon = await anonCtx.newPage();
    await anon.goto(BASE + ROTA, { waitUntil: "domcontentloaded" });
    await anon
      .waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 30000 })
      .catch(() => {});
    check(
      "P1 rota do cadastro de cliente manda anonimo p/ /login",
      /\/login/.test(anon.url()),
      anon.url()
    );
    await anonCtx.close();

    const page = await browser.newPage();
    page.on("dialog", (d) => void d.accept());

    // ------------------------------------------------------------------ P2 --
    await login(page, EMAIL_MASTER, SENHA_MASTER);
    check("P2 login no painel", true);

    await page.goto(BASE + ROTA, { waitUntil: "domcontentloaded" });
    let temLink = await presente(page, 'a[href="/configuracoes/cadastro?tela=cliente"]', true, 8000);
    if (!temLink) {
      await page.click('button[aria-controls="admin-cadastros-sub"]').catch(() => {});
      temLink = await presente(page, 'a[href="/configuracoes/cadastro?tela=cliente"]', true, 8000);
    }
    check("P2b menu Cadastros traz o sub-item Clientes", temLink);

    // ------------------------------------------------------------------ P3 --
    const temFicha = await presente(page, 'input[aria-label="Nome do cliente"]', true, 30000);
    check(
      "P3 tela de cadastro de cliente carregou",
      temFicha && (await temTexto(page, "Cadastro de cliente", 5000))
    );
    const total0 = await contador(page, "Clientes total");
    const { count: bancoTotal } = await admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", TENANT);
    check(
      "P3b contador de clientes e igual ao banco (nada de numero fixo)",
      total0 === bancoTotal,
      `tela=${total0} banco=${bancoTotal}`
    );
    const comPedido0 = await contador(page, "Clientes com pedidos");
    check("P3c contador de clientes com pedidos e real", comPedido0 >= 0, `valor=${comPedido0}`);

    // ------------------------------------------------------------------ P4 --
    await page.fill('input[aria-label="Nome do cliente"]', "");
    await page.fill('input[aria-label="E-mail do cliente"]', "");
    await salvar(page);
    check("P4 sem nome o cliente nao grava (validacao no cliente)", await statusCom(page, "o nome do cliente"));

    // ------------------------------------------------------------------ P5 --
    await page.fill('input[aria-label="Nome do cliente"]', NOME_TESTE);
    await page.fill('input[aria-label="E-mail do cliente"]', "");
    await salvar(page);
    const p5 = await statusCom(page, "e-mail do cliente");
    const fb5 = await feedbackAtual(page);
    check(
      "P5 sem e-mail o cliente nao grava (customers.email NOT NULL)",
      p5 && !/o nome do cliente/i.test(fb5),
      fb5
    );

    // ------------------------------------------------------------------ P6 --
    await page.click('button:has-text("Incluir")');
    const modalAberto = await presente(page, 'input[aria-label="Nome do cliente novo"]', true, 10000);
    check("P6 botao Incluir abre o modal de inclusao", modalAberto);
    await page.fill('input[aria-label="Nome do cliente novo"]', NOME_TESTE);
    await page.fill('input[aria-label="E-mail do cliente novo"]', EMAIL_TESTE);
    await page.fill('input[aria-label="CPF ou CNPJ do cliente novo"]', CPF_VALIDO);
    await page.selectOption('select[aria-label="Nivel do cliente novo"]', "ouro");
    await page.click('form.ct-overlay button[type="submit"]');
    const criou = await statusCom(page, "cadastrado com sucesso", 25000);
    const modalFechou = await presente(
      page,
      'input[aria-label="Nome do cliente novo"]',
      false,
      15000
    );
    const subiu = await aguardarContador(page, "Clientes total", total0 + 1);
    check(
      "P6 cliente criado pelo modal e contador subiu",
      criou && modalFechou && subiu,
      `total=${await contador(page, "Clientes total")} | ${await feedbackAtual(page)}`
    );

    // ------------------------------------------------------------------ P7 --
    await page.click('button:has-text("Incluir")');
    await page.fill('input[aria-label="Nome do cliente novo"]', "Outro Cliente E2E");
    await page.fill('input[aria-label="E-mail do cliente novo"]', EMAIL_TESTE);
    await page.click('form.ct-overlay button[type="submit"]');
    const p7 = await statusCom(page, "existe um cliente com este e-mail", 25000);
    check("P7 servidor recusa e-mail duplicado", p7, await feedbackAtual(page));
    const totalAposDuplicado = await contador(page, "Clientes total");
    check("P7b duplicado nao cria segundo cadastro", totalAposDuplicado === total0 + 1, `total=${totalAposDuplicado}`);
    await page.click('button:has-text("Cancelar")');
    check(
      "P7c modal fecha depois da recusa",
      await presente(page, 'input[aria-label="Nome do cliente novo"]', false, 10000)
    );

    // ------------------------------------------------------------------ P8 --
    await page.fill('input[aria-label="CPF ou CNPJ do cliente"]', CPF_INVALIDO);
    await salvar(page);
    check(
      "P8 servidor recusa CPF/CNPJ com digito verificador errado",
      await statusCom(page, "CPF/CNPJ inv", 25000),
      await feedbackAtual(page)
    );

    // ------------------------------------------------------------------ P9 --
    await page.fill('input[aria-label="CPF ou CNPJ do cliente"]', CPF_VALIDO);
    await page.selectOption('select[aria-label="Nivel do cliente"]', "diamante");
    await page.fill('input[aria-label="Pontos do cliente"]', "77");
    await salvar(page);
    check(
      "P9 nivel e pontos gravados pelo servidor",
      await statusCom(page, "atualizado com sucesso", 25000),
      await feedbackAtual(page)
    );

    // ----------------------------------------------------------------- P10 --
    await page.reload({ waitUntil: "domcontentloaded" });
    check(
      "P10 tela recarrega no navegador",
      await presente(page, 'input[aria-label="Nome do cliente"]', true, 30000)
    );
    await page.fill('input[aria-label="Localizar cliente"]', EMAIL_TESTE);
    const achou = page.locator("ul.ct-ac-list li").filter({ hasText: EMAIL_TESTE });
    const temLi = await achou
      .first()
      .waitFor({ state: "attached", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check("P10b busca por e-mail lista o cliente no autocomplete", temLi);
    if (temLi) await achou.first().click();
    const emailFicha = await page.inputValue('input[aria-label="E-mail do cliente"]').catch(() => "");
    const tier = await page
      .$eval('select[aria-label="Nivel do cliente"]', (s) => s.value)
      .catch(() => "");
    const pontos = await page
      .inputValue('input[aria-label="Pontos do cliente"]')
      .catch(() => "");
    check(
      "P10c ficha reaberta mostra nivel e pontos gravados (persistiu no reload)",
      emailFicha === EMAIL_TESTE && tier === "diamante" && pontos === "77",
      `email=${emailFicha} tier=${tier} pontos=${pontos}`
    );

    // ----------------------------------------------------------------- P11 --
    const { data: cli } = await admin
      .from("customers")
      .select("id")
      .eq("tenant_id", TENANT)
      .eq("email", EMAIL_TESTE)
      .maybeSingle();
    const clienteId = cli?.id ?? null;
    check("P11 cliente de teste existe no banco", !!clienteId, clienteId ?? "");

    let pedidoId = null;
    let erroPedido = "";
    if (clienteId) {
      const { data: ped, error } = await admin
        .from("orders")
        .insert({ tenant_id: TENANT, customer_id: clienteId, total_amount: 10 })
        .select("id")
        .single();
      pedidoId = error ? null : ped?.id ?? null;
      erroPedido = error?.message ?? "";
    }
    check("P11b pedido de teste criado para exercitar a FK", !!pedidoId, erroPedido);

    if (pedidoId && clienteId) {
      await page.click('button[aria-label="Apagar cliente"]');
      const bloqueou = await statusCom(page, "pedidos vinculados", 25000);
      const { count: aindaTem } = await admin
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("id", clienteId);
      check(
        "P11c cliente com pedido nao e excluido (FK on delete restrict)",
        bloqueou && aindaTem === 1,
        `tem=${aindaTem} | ${await feedbackAtual(page)}`
      );
      await admin.from("orders").delete().eq("id", pedidoId);
    } else {
      check(
        "P11c cliente com pedido nao e excluido (FK on delete restrict)",
        false,
        "sem pedido de teste"
      );
    }

    // ----------------------------------------------------------------- P12 --
    if (clienteId) {
      await page.click('button[aria-label="Apagar cliente"]');
      const removido = await statusCom(page, "removido com sucesso", 25000);
      const voltou = await aguardarContador(page, "Clientes total", total0);
      const { count: sumiu } = await admin
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("id", clienteId);
      check(
        "P12 cliente excluido e contador volta ao inicial",
        removido && voltou && sumiu === 0,
        `total=${await contador(page, "Clientes total")} tem=${sumiu}`
      );
    } else {
      check("P12 cliente excluido e contador volta ao inicial", false, "sem cliente de teste");
    }

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
