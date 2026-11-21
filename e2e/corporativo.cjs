/* E2E Corporativo (0059 - 20/11/2026): pedido de conta PJ e decisao da gestao.
 * (A) visitante cadastra -> empresa 'ativa' na hora (R$ 1.000 / 30 dias),
 *     endereco no cadastro, login vira admin (sem fila de aprovacao desde 20/11)
 * (B) CNPJ repetido recusado · (C) etiqueta na /conta
 * (D) gestao ve a conta ativa com a condicao padrao · (E) bloqueio exige motivo
 * (F) cliente ve a situacao nova
 * (G) entrar pelo CNPJ (senha errada recusa, certa entra) e botao Mostrar senha
 * (H) logado sem empresa: tela diz quem esta logado e exige confirmacao
 * limpeza no fim (so staging). G/H entraram em 20/11/2026 apos o teste de
 * producao em que a empresa caiu no cadastro de outra pessoa logada.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const { email: EMAIL_MASTER, password: SENHA_MASTER } = require("./_credenciais-e2e.cjs");

function lerEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const i = linha.indexOf("=");
    if (i > 0 && !linha.startsWith("#")) env[linha.slice(0, i)] = linha.slice(i + 1);
  }
  return env;
}
const ENV = lerEnv();
if (!(ENV.NEXT_PUBLIC_SUPABASE_URL || "").includes("cwfvxthfwbvpfjhsxpmc")) {
  throw new Error("corporativo.cjs so roda contra o Supabase de staging");
}
const db = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = process.argv[2] || "http://localhost:3000";
const EPOCH = Date.now();
const RAZAO = `E2E CORP ${EPOCH} LTDA`;
const EMAIL = `corp.${EPOCH}@teste.local`;
const SENHA = "senha123teste";

function gerarCnpj() {
  const base = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).concat([0, 0, 0, 1]);
  const dv = (nums, pesos) => {
    const s = nums.reduce((a, n, i) => a + n * pesos[i], 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base.concat(d1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base.concat(d1, d2).join("");
}
const CNPJ = gerarCnpj();
const CNPJ_H = gerarCnpj();
const EMAIL_H = `corp.h.${EPOCH}@teste.local`;

let total = 0;
let falhas = 0;
function check(nome, ok, extra = "") {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"} ${nome}${extra ? " - " + extra : ""}`);
}

async function esperar(fn, ms = 15000) {
  const fim = Date.now() + ms;
  let v;
  while (Date.now() < fim) {
    v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  return v;
}

async function conta() {
  const { data } = await db
    .from("corporate_accounts")
    .select("id, status, limite_credito, prazo_dias, motivo, aprovado_em, customer_id")
    .eq("cnpj", CNPJ)
    .maybeSingle();
  return data;
}

// preenche o form "Cadastrar empresa" (visitante: com comprador/e-mail/senha)
async function preencherCadastro(form, { razao, cnpj, visitante, contato, email }) {
  await form.getByLabel("Razão social").fill(razao);
  await form.getByLabel("CNPJ").fill(cnpj);
  // CEP primeiro: o blur busca o ViaCEP; depois os campos sao fixados a mao
  await form.getByLabel("CEP").fill("01310100");
  await form.getByLabel("Número").click();
  await form.page().waitForTimeout(2000);
  await form.getByLabel("Logradouro").fill("Avenida Paulista");
  await form.getByLabel("Número").fill("1000");
  await form.getByLabel("Bairro").fill("Bela Vista");
  await form.getByLabel("Cidade").fill("São Paulo");
  await form.getByLabel("Estado").fill("SP");
  await form.getByLabel("Telefone").fill("11988776655");
  if (visitante) {
    await form.getByLabel("Comprador").fill(contato);
    await form.getByLabel("E-mail de acesso").fill(email);
    await form.getByLabel("Senha", { exact: true }).fill(SENHA);
    await form.getByLabel("Confirmar senha").fill(SENHA);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  let userId = null;
  let userIdH = null;
  try {
    // A) visitante cadastra a empresa
    const ctxC = await browser.newContext();
    const pc = await ctxC.newPage();
    await pc.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    const abaEntrar = pc.getByRole("tab", { name: "Já tenho conta" });
    await abaEntrar.waitFor({ timeout: 15000 });
    check("A0 visitante abre em \"Já tenho conta\"", (await abaEntrar.getAttribute("aria-selected")) === "true");
    await pc.getByRole("tab", { name: "Cadastrar" }).click();
    const form = pc.locator('form[aria-label="Cadastrar empresa"]');
    await preencherCadastro(form, { razao: RAZAO, cnpj: CNPJ, visitante: true, contato: "Comprador E2E", email: EMAIL });
    await form.locator('button[type="submit"]').click();
    const secao = pc.locator('section[aria-label="Situação da conta corporativa"]');
    await secao.waitFor({ timeout: 25000 });
    check("A1 cadastro abre o painel da empresa", (await secao.innerText()).includes(RAZAO));
    check(
      "A2 status ativa na tela, com credito",
      (await secao.locator(".ct-pill-corp-ativa").count()) === 1 && (await pc.locator('[aria-label="Crédito da empresa"]').count()) === 1
    );
    const c1 = await esperar(conta);
    check("A3 empresa gravada ativa com aprovado_em", c1?.status === "ativa" && !!c1?.aprovado_em);
    check("A4 limite R$ 1.000 e prazo 30 dias", Number(c1?.limite_credito) === 1000 && c1?.prazo_dias === 30);
    const { data: buyer } = await db
      .from("corporate_buyers")
      .select("auth_user_id, papel, ativo")
      .eq("account_id", c1?.id ?? "")
      .maybeSingle();
    userId = buyer?.auth_user_id ?? null;
    check("A5 login vira admin da empresa", buyer?.papel === "admin" && buyer?.ativo === true);
    const { data: cli } = await db
      .from("customers")
      .select("documento, auth_user_id, cep, numero, cidade, uf")
      .eq("id", c1?.customer_id ?? "")
      .maybeSingle();
    check(
      "A6 cadastro do cliente com CNPJ e endereco",
      cli?.documento === CNPJ && cli?.auth_user_id === userId && cli?.cep === "01310100" && cli?.numero === "1000" && cli?.uf === "SP",
      JSON.stringify(cli)
    );
    const { count: audA } = await db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "corporativo.cadastrado")
      .eq("entity_id", c1?.id ?? "");
    check("A7 auditoria corporativo.cadastrado", audA === 1);

    // B) CNPJ repetido (outro visitante)
    const ctxB = await browser.newContext();
    const pb = await ctxB.newPage();
    await pb.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    await pb.getByRole("tab", { name: "Cadastrar" }).click();
    const fb = pb.locator('form[aria-label="Cadastrar empresa"]');
    await preencherCadastro(fb, {
      razao: "OUTRA EMPRESA E2E",
      cnpj: CNPJ,
      visitante: true,
      contato: "Outro E2E",
      email: `corp2.${EPOCH}@teste.local`,
    });
    await fb.locator('button[type="submit"]').click();
    const erroB = pb.locator('[role="alert"]', { hasText: "já tem conta corporativa" });
    await erroB.waitFor({ timeout: 15000 });
    check("B1 CNPJ repetido recusado", (await erroB.count()) === 1);
    const abaB = pb.getByRole("tab", { name: "Já tenho conta" });
    check("B2 recusa leva para \"Já tenho conta\"", (await abaB.getAttribute("aria-selected")) === "true");
    await ctxB.close();

    // C) etiqueta na area da conta
    await pc.goto(BASE + "/conta", { waitUntil: "domcontentloaded" });
    const etiqueta = await pc.locator(".conta-etiquetas").innerText();
    check("C1 /conta mostra corporativo com a razao", etiqueta.includes(`Corporativo · ${RAZAO}`), etiqueta);

    // D) gestao ve a conta ja ativa
    const ctxM = await browser.newContext();
    const pm = await ctxM.newPage();
    await pm.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
    await pm.fill("#email", EMAIL_MASTER);
    await pm.fill("#senha", SENHA_MASTER);
    await pm.locator('button[type="submit"]').click();
    await pm.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    await pm.goto(BASE + "/configuracoes/cadastro?tela=revenda", { waitUntil: "domcontentloaded" });
    const linha = pm.locator('[aria-label="Contas corporativas"] tr', { hasText: RAZAO });
    await linha.waitFor({ timeout: 20000 });
    const txtD = (await linha.innerText()).toLowerCase().replace(/\s+/g, " ");
    check(
      "D1 gestao ve a conta ja ativa, sem Aprovar",
      txtD.includes("ativa") && (await linha.getByRole("button", { name: "Aprovar" }).count()) === 0,
      txtD.slice(0, 200)
    );
    check("D2 linha mostra R$ 1.000,00 e 30 dias", txtD.includes("1.000,00") && txtD.includes("30 dias"), txtD.slice(0, 200));

    // E) bloqueio exige motivo
    await linha.getByRole("button", { name: "Bloquear" }).click();
    await linha.getByLabel(`Motivo ${RAZAO}`).fill("abc");
    check("E1 motivo curto trava o bloqueio", await linha.getByRole("button", { name: "Confirmar" }).isDisabled());
    await linha.getByLabel(`Motivo ${RAZAO}`).fill("Cadastro em revisao E2E");
    await linha.getByRole("button", { name: "Confirmar" }).click();
    const c3 = await esperar(async () => {
      const c = await conta();
      return c?.status === "bloqueada" ? c : null;
    });
    check("E2 bloqueada com motivo", c3?.status === "bloqueada" && c3.motivo === "Cadastro em revisao E2E");
    const { data: audD } = await db.from("audit_log").select("action").eq("entity_id", c1?.id ?? "");
    const acoes = (audD ?? []).map((a) => a.action);
    check("E3 auditoria cadastrado + bloqueado", acoes.includes("corporativo.cadastrado") && acoes.includes("corporativo.bloqueado"));
    await ctxM.close();

    // F) cliente ve a situacao nova
    await pc.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    const txtF = await pc.locator('section[aria-label="Situação da conta corporativa"]').innerText();
    check("F1 cliente ve bloqueio e motivo", txtF.includes("Cadastro em revisao E2E") && (await pc.locator(".ct-pill-corp-bloqueada").count()) === 1);
    await ctxC.close();

    // G) entrar pelo CNPJ (mesmo login da loja)
    const ctxG = await browser.newContext();
    const pg = await ctxG.newPage();
    await pg.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    const fg = pg.locator('form[aria-label="Entrar na conta corporativa"]');
    await fg.waitFor({ timeout: 15000 });
    const senhaG = fg.getByLabel("Senha", { exact: true });
    await senhaG.fill("senha-errada-1");
    await fg.getByRole("button", { name: "Mostrar" }).click();
    const tipoVisivel = await senhaG.getAttribute("type");
    await fg.getByRole("button", { name: "Ocultar" }).click();
    check("G1 botao Mostrar revela e esconde a senha", tipoVisivel === "text" && (await senhaG.getAttribute("type")) === "password");
    await fg.getByLabel("E-mail ou CNPJ").fill(CNPJ);
    await fg.locator('button[type="submit"]').click();
    const erroG = fg.locator('[role="alert"]');
    await erroG.waitFor({ timeout: 15000 });
    check("G2 senha errada recusa sem dizer se o CNPJ existe", (await erroG.innerText()).includes("E-mail/CNPJ ou senha inválidos"));
    await senhaG.fill(SENHA);
    await fg.locator('button[type="submit"]').click();
    const secaoG = pg.locator('section[aria-label="Situação da conta corporativa"]');
    await secaoG.waitFor({ timeout: 25000 });
    check("G3 CNPJ + senha certa entra na empresa", (await secaoG.innerText()).includes(RAZAO));
    await ctxG.close();

    // H) cliente logado SEM empresa: confirmacao obrigatoria
    const { data: novoH, error: errH } = await db.auth.admin.createUser({ email: EMAIL_H, password: SENHA, email_confirm: true });
    if (errH) throw errH;
    userIdH = novoH.user.id;
    const { error: errCliH } = await db.from("customers").insert({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      name: "Cliente Logado E2E",
      email: EMAIL_H,
      auth_user_id: userIdH,
    });
    if (errCliH) throw errCliH;
    const ctxH = await browser.newContext();
    const ph = await ctxH.newPage();
    await ph.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    const fe = ph.locator('form[aria-label="Entrar na conta corporativa"]');
    await fe.getByLabel("E-mail ou CNPJ").fill(EMAIL_H);
    await fe.getByLabel("Senha", { exact: true }).fill(SENHA);
    await fe.locator('button[type="submit"]').click();
    const caixaH = ph.locator('[aria-label="Cadastro logado"]');
    await caixaH.waitFor({ timeout: 25000 });
    const txtH = await caixaH.innerText();
    check("H1 tela diz com quem esta logado", txtH.includes("Cliente Logado E2E") && txtH.includes(EMAIL_H));
    const fh = ph.locator('form[aria-label="Cadastrar empresa"]');
    await preencherCadastro(fh, { razao: `E2E CORP H ${EPOCH} LTDA`, cnpj: CNPJ_H, visitante: false });
    const botaoH = fh.locator('button[type="submit"]');
    check("H2 sem confirmar o botao fica travado", await botaoH.isDisabled());
    await fh.getByRole("checkbox").check();
    await botaoH.click();
    await ph.locator('section[aria-label="Situação da conta corporativa"]').waitFor({ timeout: 25000 });
    const { data: contaH } = await db.from("corporate_accounts").select("id, customer_id").eq("cnpj", CNPJ_H).maybeSingle();
    const { data: cliH } = await db.from("customers").select("auth_user_id").eq("id", contaH?.customer_id ?? "").maybeSingle();
    check("H3 confirmado: empresa ligada ao cadastro logado", cliH?.auth_user_id === userIdH);
    await ctxH.close();
  } finally {
    // limpeza (audit_log fica como trilha, igual as outras suites)
    const c = await conta();
    if (c) {
      await db.from("corporate_buyers").delete().eq("account_id", c.id);
      await db.from("corporate_accounts").delete().eq("id", c.id);
      await db.from("customers").delete().eq("id", c.customer_id);
    }
    if (userId) await db.auth.admin.deleteUser(userId);
    const { data: cH } = await db.from("corporate_accounts").select("id").eq("cnpj", CNPJ_H).maybeSingle();
    if (cH) {
      await db.from("corporate_buyers").delete().eq("account_id", cH.id);
      await db.from("corporate_accounts").delete().eq("id", cH.id);
    }
    if (userIdH) {
      await db.from("customers").delete().eq("auth_user_id", userIdH);
      await db.auth.admin.deleteUser(userIdH);
    }
    await browser.close();
  }
  console.log(`TOTAL ${total} | PASS ${total - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
