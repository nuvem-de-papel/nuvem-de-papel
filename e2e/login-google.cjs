/* E2E Login com Google na loja (21/11/2026).
 * (A) /login mostra "Entrar com Google" (build com NEXT_PUBLIC_LOGIN_GOOGLE=1)
 * (B) clique monta o authorize do Supabase com provider=google e volta por
 *     /auth/callback?next=... (o pedido e interceptado: nao sai para o Google)
 * (C) ?next= da loja e respeitado; ?next= da equipe cai em /conta
 * (D) /auth/callback sem code ou com code invalido volta ao /login com aviso
 * (E) garantirClienteDoLogin (helper do callback) contra o staging:
 *     cria o cliente, nao duplica, liga cadastro sem login pelo e-mail,
 *     ignora equipe e nao toma cadastro de outro login.
 * Limpeza no fim (so staging).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");

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
  throw new Error("login-google.cjs so roda contra o Supabase de staging");
}
const db = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = process.argv[2] || "http://localhost:3000";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EPOCH = Date.now();
const EMAIL_NOVO = `google.novo.${EPOCH}@teste.local`;
const EMAIL_LIGA = `google.liga.${EPOCH}@teste.local`;
const EMAIL_OUTRO = `google.outro.${EPOCH}@teste.local`;

const resultados = [];
function check(nome, ok, extra) {
  resultados.push({ nome, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${nome}${extra !== undefined ? ` (${extra})` : ""}`);
}

// transpila o helper (e o tenant que ele importa) para um .cjs temporario
const tmp = path.join(__dirname, "..", ".tmp-parser", "login-google");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
execSync(
  `npx tsc src/lib/cliente-login.ts --outDir "${tmp}" --module commonjs --strict ` +
    `--target es2020 --moduleResolution node --skipLibCheck --esModuleInterop`,
  { cwd: path.join(__dirname, ".."), stdio: "pipe" }
);
const { garantirClienteDoLogin } = require(path.join(tmp, "cliente-login.js"));

async function authorizeDoClique(page, url) {
  let pedido = null;
  await page.route("**/auth/v1/authorize**", (route) => {
    pedido = route.request().url();
    return route.abort();
  });
  await page.goto(BASE + url, { waitUntil: "load" });
  await page.getByRole("button", { name: "Entrar com Google" }).click();
  for (let i = 0; i < 40 && !pedido; i++) await page.waitForTimeout(250);
  await page.unroute("**/auth/v1/authorize**");
  if (!pedido) return null;
  const u = new URL(pedido);
  return { provider: u.searchParams.get("provider"), redirect: u.searchParams.get("redirect_to") || "" };
}

const criados = { users: [], customers: [] };

async function criarUser(email, nome) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: `Senha-${EPOCH}-x`,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  criados.users.push(data.user.id);
  return data.user;
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 800 } })).newPage();

    // (A) botao
    await page.goto(BASE + "/login", { waitUntil: "load" });
    const botao = page.getByRole("button", { name: "Entrar com Google" });
    check("A1 /login mostra Entrar com Google", await botao.isVisible().catch(() => false), "build precisa de NEXT_PUBLIC_LOGIN_GOOGLE=1");
    const ordem = await page.evaluate(() => {
      const b = document.querySelector(".botao-google");
      const e = document.getElementById("email");
      return !!b && !!e && !!(b.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    check("A2 botao acima do e-mail, form de senha continua", ordem && (await page.locator("#senha").isVisible()));

    // (B) authorize
    const b = await authorizeDoClique(page, "/login");
    check("B1 clique chama o authorize do Supabase", !!b);
    check("B2 provider=google", b && b.provider === "google", b && b.provider);
    check("B3 volta por /auth/callback?next=/conta", b && b.redirect === `${BASE}/auth/callback?next=%2Fconta`, b && b.redirect);

    // (C) next
    const c1 = await authorizeDoClique(page, "/login?next=/checkout");
    check("C1 ?next=/checkout segue para o checkout", c1 && c1.redirect.endsWith("/auth/callback?next=%2Fcheckout"), c1 && c1.redirect);
    const c2 = await authorizeDoClique(page, "/login?next=/crm");
    check("C2 ?next=/crm (equipe) cai em /conta", c2 && c2.redirect.endsWith("/auth/callback?next=%2Fconta"), c2 && c2.redirect);

    // (D) callback com erro
    const r1 = await fetch(BASE + "/auth/callback", { redirect: "manual" });
    check("D1 callback sem code -> /login?erro=google", (r1.headers.get("location") || "").endsWith("/login?erro=google"), r1.status);
    const r2 = await fetch(BASE + "/auth/callback?code=invalido-e2e&next=/conta", { redirect: "manual" });
    check("D2 code invalido -> /login?erro=google", (r2.headers.get("location") || "").endsWith("/login?erro=google"), r2.status);
    await page.goto(BASE + "/login?erro=google", { waitUntil: "load" });
    await page.waitForTimeout(500);
    const txt = await page.evaluate(() => document.body.innerText);
    check("D3 /login mostra o aviso do Google", txt.includes("Não foi possível entrar com o Google"));

    // (E) helper contra o staging
    const novo = await criarUser(EMAIL_NOVO, "Cliente Google E2E");
    const e1 = await garantirClienteDoLogin(db, novo);
    const { data: cli1 } = await db.from("customers").select("id, name, email, tier, ativo").eq("auth_user_id", novo.id).maybeSingle();
    if (cli1) criados.customers.push(cli1.id);
    check("E1 login novo cria o cliente", e1 === "criado" && cli1 && cli1.email === EMAIL_NOVO && cli1.name === "Cliente Google E2E" && cli1.tier === "bronze" && cli1.ativo, e1);
    const { data: aud } = await db.from("audit_log").select("id").eq("action", "cadastro.criado_google").eq("entity_id", cli1 && cli1.id);
    check("E2 auditoria cadastro.criado_google", (aud || []).length === 1);
    const e3 = await garantirClienteDoLogin(db, novo);
    const { count } = await db.from("customers").select("id", { count: "exact", head: true }).eq("auth_user_id", novo.id);
    check("E3 segundo login nao duplica", e3 === "existente" && count === 1, e3);

    const { data: semLogin, error: errSL } = await db
      .from("customers")
      .insert({ tenant_id: TENANT, name: "Cadastro sem login E2E", email: EMAIL_LIGA, tier: "bronze", points: 0, ativo: true })
      .select("id")
      .single();
    if (errSL) throw new Error(errSL.message);
    criados.customers.push(semLogin.id);
    const liga = await criarUser(EMAIL_LIGA, "Outro Nome");
    const e4 = await garantirClienteDoLogin(db, liga);
    const { data: cli4 } = await db.from("customers").select("auth_user_id, name").eq("id", semLogin.id).single();
    check("E4 cadastro sem login com o mesmo e-mail e ligado", e4 === "vinculado" && cli4.auth_user_id === liga.id && cli4.name === "Cadastro sem login E2E", e4);

    const { data: perfil } = await db.from("profiles").select("id").limit(1).single();
    const e5 = await garantirClienteDoLogin(db, { id: perfil.id, email: `equipe.${EPOCH}@teste.local`, user_metadata: {}, app_metadata: {} });
    const { count: c5 } = await db.from("customers").select("id", { count: "exact", head: true }).eq("auth_user_id", perfil.id);
    check("E5 login da equipe nao vira cliente", e5 === "equipe" && c5 === 0, e5);

    const outro = await criarUser(EMAIL_OUTRO, "Outro E2E");
    const e6 = await garantirClienteDoLogin(db, { ...outro, email: EMAIL_NOVO });
    const { data: cli6 } = await db.from("customers").select("auth_user_id").eq("id", cli1.id).single();
    check("E6 nao toma cadastro de outro login", e6 === "erro" && cli6.auth_user_id === novo.id, e6);
  } catch (e) {
    check("EXCECAO", false, e.message);
  } finally {
    await browser.close();
    for (const id of criados.customers) await db.from("customers").delete().eq("id", id);
    for (const id of criados.users) await db.auth.admin.deleteUser(id);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const pass = resultados.filter((r) => r.ok).length;
  console.log(`TOTAL ${resultados.length} | PASS ${pass} | FAIL ${resultados.length - pass}`);
  process.exit(pass === resultados.length ? 0 : 1);
})();
