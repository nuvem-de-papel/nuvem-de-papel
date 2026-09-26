/* E2E Fase 2 — console de usuários + auditoria (gate de aceite).
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Rode tudo juntos com: npm run e2e
 * Cobertura: (A) sem sessão → 307 /login · (B) master cria operador →
 * profiles + audit_log · (C) operador: /crm 200, /configuracoes 403 módulo ·
 * (D) desativação → UI + audit_log · (E) inativo → 403 e login bloqueado ·
 * (F) tela de auditoria mostra as ações · (Z) limpeza do usuário de teste. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const EMAIL_OP = "e2e-operador@nuvem-de-papel.com.br";
const SENHA_OP = "E2e#2026Test";
const NOME_OP = "Operador E2E";

function lerEnv() {
  const txt = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = lerEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const resultados = [];
function check(nome, cond, detalhe = "") {
  resultados.push({ nome, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"} - ${nome}${detalhe ? " | " + detalhe : ""}`);
}

async function login(page, email, senha) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

async function acharUser(email) {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users || []).find((u) => (u.email || "").toLowerCase() === email) || null;
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });

  // limpeza prévia
  const pre = await acharUser(EMAIL_OP);
  if (pre) {
    await db.from("profiles").delete().eq("id", pre.id);
    await db.auth.admin.deleteUser(pre.id);
  }

  // A) sem sessão → redirect /login
  const a = await fetch(BASE + "/configuracoes/usuarios", { redirect: "manual" });
  check(
    "A1 sem sessao redireciona /login",
    a.status === 307 && (a.headers.get("location") || "").includes("/login"),
    `status=${a.status} loc=${a.headers.get("location")}`
  );

  // B) master cria operador
  const ctxM = await browser.newContext();
  const pageM = await ctxM.newPage();
  await login(pageM, EMAIL_MASTER, SENHA_MASTER);
  const respM = await pageM.goto(BASE + "/crm", { waitUntil: "domcontentloaded" });
  check("B0 master /crm -> 200", respM.status() === 200, `status=${respM.status()}`);

  const respU = await pageM.goto(BASE + "/configuracoes/usuarios", { waitUntil: "domcontentloaded" });
  const h1U = await pageM.locator("h1", { hasText: "Usuários" }).count();
  check("B1 master abre /configuracoes/usuarios", respU.status() === 200 && h1U > 0, `status=${respU.status()}`);

  await pageM.fill('input[placeholder="E-mail"]', EMAIL_OP);
  await pageM.fill('input[placeholder="Nome completo"]', NOME_OP);
  await pageM.locator("form select").first().selectOption("operador");
  await pageM.fill('input[placeholder="Senha (mín. 8)"]', SENHA_OP);
  await pageM.click('button:has-text("Criar usuário")');
  await pageM.waitForSelector(`tr:has-text("${NOME_OP}")`, { timeout: 20000 });
  check("B2 operador aparece na lista", true);

  const op = await acharUser(EMAIL_OP);
  check("B3 usuario existe no Auth", !!op);

  let prof = null;
  if (op) {
    const { data } = await db.from("profiles").select("role, status").eq("id", op.id).maybeSingle();
    prof = data;
  }
  check(
    "B4 profile role=operador status=ativo",
    prof?.role === "operador" && prof?.status === "ativo",
    JSON.stringify(prof)
  );

  const { data: audit1 } = await db
    .from("audit_log")
    .select("action, after")
    .eq("entity_id", op ? op.id : "00000000-0000-0000-0000-000000000000")
    .order("created_at", { ascending: false })
    .limit(1);
  check(
    "B5 audit_log usuario.criado gravado",
    audit1?.[0]?.action === "usuario.criado",
    JSON.stringify(audit1?.[0] || null)
  );

  // C) operador: /crm 200, /configuracoes 403 módulo
  const ctxO = await browser.newContext();
  const pageO = await ctxO.newPage();
  await login(pageO, EMAIL_OP, SENHA_OP);
  const respOCrm = await pageO.goto(BASE + "/crm", { waitUntil: "domcontentloaded" });
  check("C0 operador /crm -> 200", respOCrm.status() === 200, `status=${respOCrm.status()}`);

  const respMod = await pageO.goto(BASE + "/configuracoes/usuarios", { waitUntil: "domcontentloaded" });
  const corpoMod = (await pageO.textContent("body")) || "";
  check(
    "C1 operador -> 403 modulo /configuracoes",
    respMod.status() === 403 && corpoMod.includes("nao tem permissao"),
    `status=${respMod.status()}`
  );

  // D) master desativa
  const linha = pageM.locator("tr", { hasText: NOME_OP });
  await linha.locator('button:has-text("Desativar")').click();
  await linha.locator('span:has-text("Inativo")').waitFor({ timeout: 20000 });
  check("D1 desativacao reflete na UI", true);

  const { data: audit2 } = await db
    .from("audit_log")
    .select("action")
    .eq("entity_id", op ? op.id : "00000000-0000-0000-0000-000000000000")
    .order("created_at", { ascending: false })
    .limit(1);
  check(
    "D2 audit_log usuario.desativado gravado",
    audit2?.[0]?.action === "usuario.desativado",
    JSON.stringify(audit2?.[0] || null)
  );

  // E) inativo: 403 em /crm e login bloqueado
  const respIna = await pageO.goto(BASE + "/crm", { waitUntil: "domcontentloaded" });
  const corpoIna = (await pageO.textContent("body")) || "";
  check(
    "E1 inativo -> 403 perfil desativado",
    respIna.status() === 403 && corpoIna.includes("desativado"),
    `status=${respIna.status()}`
  );

  const ctxF = await browser.newContext();
  const pageF = await ctxF.newPage();
  await pageF.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await pageF.fill("#email", EMAIL_OP);
  await pageF.fill("#senha", SENHA_OP);
  await pageF.click('button[type="submit"]');
  await pageF.waitForSelector("text=Perfil sem acesso", { timeout: 20000 });
  check("E2 login de inativo bloqueado com aviso", true);

  // F) tela de auditoria
  const respA = await pageM.goto(BASE + "/configuracoes/auditoria", { waitUntil: "domcontentloaded" });
  const h1A = await pageM.locator("h1", { hasText: "Auditoria" }).count();
  const corpoAud = (await pageM.textContent("body")) || "";
  check(
    "F1 /configuracoes/auditoria mostra as acoes",
    respA.status() === 200 && h1A > 0 && corpoAud.includes("usuario.criado"),
    `status=${respA.status()}`
  );

  // Z) limpeza
  if (op) {
    await db.from("profiles").delete().eq("id", op.id);
    await db.auth.admin.deleteUser(op.id);
  }
  const post = await acharUser(EMAIL_OP);
  check("Z1 usuario de teste removido", !post);

  await browser.close();
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(2);
});
