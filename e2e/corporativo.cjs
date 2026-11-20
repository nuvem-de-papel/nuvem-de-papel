/* E2E Corporativo (0059 - 20/11/2026): pedido de conta PJ e decisao da gestao.
 * (A) visitante pede conta -> empresa 'pendente', limite 0, login vira admin
 * (B) CNPJ repetido recusado · (C) etiqueta na /conta
 * (D) gestao aprova com limite/prazo · (E) bloqueio exige motivo
 * (F) cliente ve a situacao nova · limpeza no fim (so staging).
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

async function main() {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  let userId = null;
  try {
    // A) visitante pede a conta
    const ctxC = await browser.newContext();
    const pc = await ctxC.newPage();
    await pc.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    const form = pc.locator('form[aria-label="Solicitar conta corporativa"]');
    await form.getByLabel("Razão social").fill(RAZAO);
    await form.getByLabel("CNPJ").fill(CNPJ);
    await form.getByLabel("Telefone da empresa").fill("11988776655");
    await form.getByLabel("Nome de quem compra").fill("Comprador E2E");
    await form.getByLabel("E-mail de acesso").fill(EMAIL);
    await form.getByLabel("Senha").fill(SENHA);
    await form.locator('button[type="submit"]').click();
    const secao = pc.locator('section[aria-label="Situação da conta corporativa"]');
    await secao.waitFor({ timeout: 25000 });
    check("A1 pedido mostra a situacao da conta", (await secao.innerText()).includes(RAZAO));
    check("A2 status pendente na tela", (await secao.locator(".ct-pill-corp-pendente").count()) === 1);
    const c1 = await esperar(conta);
    check("A3 empresa gravada pendente", c1?.status === "pendente");
    check("A4 limite nasce zero", Number(c1?.limite_credito) === 0);
    const { data: buyer } = await db
      .from("corporate_buyers")
      .select("auth_user_id, papel, ativo")
      .eq("account_id", c1?.id ?? "")
      .maybeSingle();
    userId = buyer?.auth_user_id ?? null;
    check("A5 login vira admin da empresa", buyer?.papel === "admin" && buyer?.ativo === true);
    const { data: cli } = await db.from("customers").select("documento, auth_user_id").eq("id", c1?.customer_id ?? "").maybeSingle();
    check("A6 cadastro do cliente com o CNPJ", cli?.documento === CNPJ && cli?.auth_user_id === userId);
    const { count: audA } = await db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "corporativo.solicitado")
      .eq("entity_id", c1?.id ?? "");
    check("A7 auditoria corporativo.solicitado", audA === 1);

    // B) CNPJ repetido (outro visitante)
    const ctxB = await browser.newContext();
    const pb = await ctxB.newPage();
    await pb.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    const fb = pb.locator('form[aria-label="Solicitar conta corporativa"]');
    await fb.getByLabel("Razão social").fill("OUTRA EMPRESA E2E");
    await fb.getByLabel("CNPJ").fill(CNPJ);
    await fb.getByLabel("Telefone da empresa").fill("11988776655");
    await fb.getByLabel("Nome de quem compra").fill("Outro E2E");
    await fb.getByLabel("E-mail de acesso").fill(`corp2.${EPOCH}@teste.local`);
    await fb.getByLabel("Senha").fill(SENHA);
    await fb.locator('button[type="submit"]').click();
    const erroB = pb.locator('form[aria-label="Solicitar conta corporativa"] [role="alert"]');
    await erroB.waitFor({ timeout: 15000 });
    check("B1 CNPJ repetido recusado", (await erroB.innerText()).includes("já tem conta corporativa"));
    await ctxB.close();

    // C) etiqueta na area da conta
    await pc.goto(BASE + "/conta", { waitUntil: "domcontentloaded" });
    const etiqueta = await pc.locator(".conta-etiquetas").innerText();
    check("C1 /conta mostra corporativo aguardando", etiqueta.includes("Corporativo · aguardando aprovação"));

    // D) gestao aprova
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
    check("D1 empresa aparece para a gestao", (await linha.innerText()).toLowerCase().includes("aguardando aprovação"));
    await linha.getByRole("button", { name: "Aprovar" }).click();
    await linha.getByLabel(`Limite de crédito ${RAZAO}`).fill("1.500,00");
    await linha.getByLabel(`Prazo em dias ${RAZAO}`).fill("30");
    await linha.getByRole("button", { name: "Confirmar" }).click();
    const c2 = await esperar(async () => {
      const c = await conta();
      return c?.status === "ativa" ? c : null;
    });
    check("D2 aprovada com limite e prazo", c2?.status === "ativa" && Number(c2.limite_credito) === 1500 && c2.prazo_dias === 30);
    check("D3 aprovado_em gravado", !!c2?.aprovado_em);
    // a linha so muda depois do router.refresh() da action
    await esperar(async () => (await linha.innerText()).includes("30 dias"));
    const txtD4 = (await linha.innerText()).toLowerCase();
    check("D4 tela mostra ativa com a condicao", txtD4.includes("ativa") && txtD4.includes("30 dias"), txtD4.replace(/\s+/g, " ").slice(0, 200));

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
    check("E3 auditoria aprovado + bloqueado", acoes.includes("corporativo.aprovado") && acoes.includes("corporativo.bloqueado"));
    await ctxM.close();

    // F) cliente ve a situacao nova
    await pc.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    const txtF = await pc.locator('section[aria-label="Situação da conta corporativa"]').innerText();
    check("F1 cliente ve bloqueio e motivo", txtF.includes("Cadastro em revisao E2E") && (await pc.locator(".ct-pill-corp-bloqueada").count()) === 1);
    await ctxC.close();
  } finally {
    // limpeza (audit_log fica como trilha, igual as outras suites)
    const c = await conta();
    if (c) {
      await db.from("corporate_buyers").delete().eq("account_id", c.id);
      await db.from("corporate_accounts").delete().eq("id", c.id);
      await db.from("customers").delete().eq("id", c.customer_id);
    }
    if (userId) await db.auth.admin.deleteUser(userId);
    await browser.close();
  }
  console.log(`TOTAL ${total} | PASS ${total - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
