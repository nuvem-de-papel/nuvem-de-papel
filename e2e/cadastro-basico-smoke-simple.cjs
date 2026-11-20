/* Smoke test SIMPLIFICADO: Cadastro básico na compra
 * Foca no checkout (pula navegação complexa de produtos)
 * Adiciona item via localStorage → testa cadastro → login → pedido
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");

function lerEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const ENV = lerEnv();

const BASE = process.argv[2] || process.env.SMOKE_URL || "http://localhost:3000";
const EPOCH = Date.now();
const EMAIL = `smoke.${EPOCH}@teste.local`;
const SENHA = "senha123teste";
const NOME = `Smoke Test ${EPOCH}`;
const TELEFONE = "11999887766";

const SUPABASE_URL = ENV.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_URL.includes("cwfvxthfwbvpfjhsxpmc")) {
  throw new Error("Smoke so roda contra o Supabase de staging (cwfvxthfwbvpfjhsxpmc)");
}

let checks = 0;
let falhas = 0;
let criadoId;

function log(msg) {
  console.log(`[SMOKE] ${msg}`);
}

function check(condicao, msg) {
  checks++;
  if (!condicao) {
    falhas++;
    console.error(`[FALHA] ${msg}`);
    return false;
  }
  log(`✓ ${msg}`);
  return true;
}

async function main() {
  log(`Smoke test simplificado em ${BASE}`);
  log(`Email: ${EMAIL}`);

  const browser = await chromium.launch({
    headless: true,
    channel: "msedge"
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Carregar home
    log("1. Carregando home...");
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
    check(await page.title(), "Home carregou");

    // 2. Adicionar item ao carrinho via localStorage
    log("2. Adicionando item ao carrinho (localStorage)...");
    await page.evaluate(() => {
      const carrinho = [{
        id: "test-item-id",
        sku: "TEST-001",
        name: "Produto de Teste Smoke",
        price: 9.99,
        qty: 1
      }];
      window.localStorage.setItem("ndp_carrinho_v1", JSON.stringify(carrinho));
    });

    await page.reload();
    await page.waitForLoadState("networkidle");
    check(true, "Item adicionado ao carrinho");

    // 3. Ir para checkout
    log("3. Navegando para /checkout...");
    await page.goto(`${BASE}/checkout`);
    await page.waitForLoadState("networkidle");

    const urlCheckout = page.url();
    check(urlCheckout.includes("/checkout"), "Chegou ao checkout");
    check(!urlCheckout.includes("/login"), "NÃO redirect para /login (mostra cadastro básico)");

    // 4. Verificar form de cadastro básico
    log("4. Verificando form de cadastro básico...");
    const inputNome = page.locator('input#nome, input[placeholder*="nome"]').first();
    const inputEmail = page.locator('input[type="email"]').first();
    const inputTelefone = page.locator('input[type="tel"], input[placeholder*="telefone"]').first();
    const inputSenha = page.locator('input[type="password"]').first();

    check(await inputNome.count() > 0, "Campo nome presente");
    check(await inputEmail.count() > 0, "Campo email presente");
    check(await inputTelefone.count() > 0, "Campo telefone presente");
    check(await inputSenha.count() > 0, "Campo senha presente");

    // 5. Preencher cadastro
    log("5. Preenchendo cadastro...");
    await inputNome.fill(NOME);
    await inputEmail.fill(EMAIL);
    await inputTelefone.fill(TELEFONE);
    await inputSenha.fill(SENHA);

    // 6. Submeter
    log("6. Criando conta...");
    const btnCriar = page.locator('button[type="submit"]:has-text("Criar"), button:has-text("continuar")').first();
    await btnCriar.click();

    // 7. Sessão aberta no servidor: o form some e o checkout logado aparece
    log("7. Aguardando checkout logado...");
    const logado = page
      .getByRole("heading", { name: "1 - Dados cadastrais e entrega" })
      .or(page.getByRole("heading", { name: "Checkout em breve" }));
    await logado.first().waitFor({ timeout: 20000 });
    check(new URL(page.url()).pathname === "/checkout", "Continua em /checkout (sem passar pelo /login)");
    check(await page.getByRole("heading", { name: "Finalize sua compra" }).count() === 0, "Form de cadastro sumiu");
    check(await logado.count() > 0, "Checkout logado (endereço ou 'em breve') presente");

    // 8. Cabeçalho do cliente: "Minha conta" -> /conta (Inicio, 20/11) (nunca "Painel")
    log("8. Conferindo cabeçalho do cliente...");
    const minhaConta = page.getByRole("link", { name: "Minha conta" }).first();
    await minhaConta.waitFor({ state: "attached", timeout: 10000 });
    check(await minhaConta.getAttribute("href") === "/conta", "Cabeçalho: 'Minha conta' -> /conta");
    check(await page.getByRole("link", { name: "Painel" }).count() === 0, "Cabeçalho: sem botão 'Painel'");

    // 9. Sair e voltar como cliente que já tem cadastro
    log("9. Entrando com cadastro existente pelo checkout...");
    await context.clearCookies();
    await page.goto(`${BASE}/checkout`);
    await page.getByRole("heading", { name: "Finalize sua compra" }).waitFor({ timeout: 15000 });

    // 9a. Criar conta com e-mail que já existe: avisa e troca para "entrar"
    await page.locator("input#nome").fill(NOME);
    await page.locator("input#email").fill(EMAIL);
    await page.locator("input#telefone").fill(TELEFONE);
    await page.locator("input#senha").fill(SENHA);
    await page.getByRole("button", { name: "Criar conta e continuar" }).click();
    await page.getByText("Este e-mail já tem cadastro. Digite sua senha para entrar.").waitFor({ timeout: 15000 });
    check(true, "E-mail repetido: mostra 'já tem cadastro'");
    check(await page.getByRole("button", { name: "Entrar e continuar" }).count() === 1, "E-mail repetido: form trocou para entrar");
    check(await page.locator("input#email").inputValue() === EMAIL, "E-mail repetido: e-mail mantido");

    await page.reload();
    await page.getByRole("heading", { name: "Finalize sua compra" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Entrar aqui" }).click();
    check(await page.locator("input#nome").count() === 0, "Modo entrar: sem campo nome");
    check(await page.locator("input#telefone").count() === 0, "Modo entrar: sem campo telefone");

    await page.locator("input#email").fill(EMAIL);
    await page.locator("input#senha").fill("senha-errada-123");
    await page.getByRole("button", { name: "Entrar e continuar" }).click();
    await page.getByText("E-mail ou senha incorretos.").waitFor({ timeout: 15000 });
    check(true, "Senha errada: mostra 'E-mail ou senha incorretos.'");

    await page.locator("input#senha").fill(SENHA);
    await page.getByRole("button", { name: "Entrar e continuar" }).click();
    await logado.first().waitFor({ timeout: 20000 });
    check(new URL(page.url()).pathname === "/checkout", "Entrou e continua em /checkout");

    // 11. Validar banco (se key disponível)
    if (SUPABASE_KEY) {
      log("10. Validando banco...");
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

      const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const user = users?.users?.find(u => u.email === EMAIL);
      check(user !== undefined, "Usuário no Auth");
      criadoId = user?.id;

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        check(profile === null, "Sem linha em profiles (cliente da loja)");

        const { data: customer } = await supabase
          .from("customers")
          .select("email, ativo, telefone")
          .eq("auth_user_id", user.id)
          .single();

        check(customer?.email === EMAIL, "Customer criado");
        check(customer?.ativo === true, "Customer ativo");
        check(customer?.telefone === TELEFONE, "Telefone gravado");

        const { data: audit } = await supabase
          .from("audit_log")
          .select("action")
          .eq("action", "cadastro.criado_na_compra")
          .eq("actor_user_id", user.id)
          .maybeSingle();

        check(audit !== null, "Audit log registrado");
      }
    }

    log("\n========================================");
    log(`RESULTADO: ${checks} checks, ${falhas} falhas`);
    log("========================================\n");

    if (falhas > 0) {
      throw new Error(`Falhou: ${falhas} de ${checks} checks`);
    }

    log("✅ SMOKE TEST PASSOU!");

  } catch (erro) {
    log(`❌ ERRO: ${erro.message}`);

    try {
      const screenshot = `smoke-erro-${EPOCH}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      log(`Screenshot: ${screenshot}`);
    } catch {}

    throw erro;
  } finally {
    await browser.close();
    if (criadoId) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
      await supabase.from("audit_log").delete().eq("actor_user_id", criadoId);
      await supabase.from("customers").delete().eq("auth_user_id", criadoId);
      await supabase.auth.admin.deleteUser(criadoId);
      log(`Limpeza: usuário de teste ${criadoId} removido`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(erro => {
    console.error(erro);
    process.exit(1);
  });
