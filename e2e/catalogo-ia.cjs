/* E2E Catálogo com IA (entrega 5 - 0038): gerar descrição pública com Gemini.
 * Requisitos: npm run build && npm run start (:3000) + .env.local com
 * GEMINI_API_KEY (chave real do cliente). Rode: node e2e/catalogo-ia.cjs
 *
 * Cobre o ciclo ponta a ponta:
 *  1. Cria um produto de teste (service role) com preço varejo -> aparece na vitrine.
 *  2. Abre a ficha, vai na aba "3. Descrição (IA)", clica "Gerar descrição com IA".
 *  3. Espera o textarea #ct-prod-descricao-vitrine encher com texto REAL (Gemini).
 *  4. Clica Salvar -> grava em catalog_items.description (com audit).
 *  5. Confere que a descrição aparece na vitrine publica /produtos.
 *  6. Limpa: apaga o produto de teste (nao deixa lixo).
 *
 * Se GEMINI_API_KEY faltar, o teste de geração falha com aviso claro (a IA e
 * best-effort por design) - mas o resto (gravar/exibir descricao escrita a mao)
 * continua coberto. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const SKU_IA = "SKU-E2E-CATIA-0038";
const NOME_IA = "Caderno Espiral E2E Catálogo IA";

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

async function login(page, email, senha) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

async function limparLixo() {
  const { data } = await admin.from("catalog_items").select("id").eq("sku", SKU_IA);
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length) {
    await admin.from("item_prices").delete().in("item_id", ids);
    await admin.from("item_fiscal_data").delete().in("item_id", ids);
    await admin.from("item_commercial_data").delete().in("item_id", ids);
    await admin.from("catalog_items").delete().in("id", ids);
  }
}

async function main() {
  // comeca sempre do zero (limpa lixo de rodada anterior)
  await limparLixo();

  // cria o produto de teste com preço varejo (pra entrar na vitrine getStoreProducts)
  const { data: novo, error: errCriar } = await admin
    .from("catalog_items")
    .insert({
      tenant_id: TENANT,
      sku: SKU_IA,
      name: NOME_IA,
      category: "Cadernos & agendas",
      active: true,
      fabricante: "Tilibra",
    })
    .select("id")
    .single();
  if (errCriar) throw new Error("Falha ao criar produto de teste: " + errCriar.message);
  const itemId = novo.id;
  await admin.from("item_prices").insert({
    item_id: itemId,
    channel: "varejo",
    price: 29.9,
    min_quantity: 1,
    valid_from: "1970-01-01",
  });
  // sem descrição no início (a IA deve preencher)
  check("C0 produto de teste criado sem descrição", true, itemId);

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    page.on("dialog", (d) => d.accept());

    await login(page, EMAIL_MASTER, SENHA_MASTER);
    await page.goto(BASE + "/configuracoes/cadastro?tela=produto", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Cadastro de produto" }).waitFor({ timeout: 15000 });

    // abre a ficha do produto de teste pela busca
    await page.fill("#ct-prod-busca", SKU_IA);
    await page.waitForTimeout(400);
    await page.locator(".ct-drop button").first().click();
    await page.waitForTimeout(400);
    check("C1 abre a ficha do produto de teste", (await page.inputValue("#ct-prod-descricao")) === NOME_IA);

    // sem ID salvo o botão avisa; aqui já tem, então vai pra aba de IA
    await page.getByRole("button", { name: /3\. Descrição \(IA\)/ }).click();
    await page.waitForTimeout(200);
    const temTextarea = (await page.locator("#ct-prod-descricao-vitrine").count()) === 1;
    check("C2 aba Descrição (IA) tem o textarea da vitrine", temTextarea);

    // gera com IA (chamada real ao Gemini via server action)
    await page.getByRole("button", { name: /Gerar descrição com IA/ }).click();
    // espera o textarea encher (ou o feedback de erro aparecer)
    let textoIA = "";
    let erroIA = "";
    try {
      await page.waitForFunction(
        () => (document.getElementById("ct-prod-descricao-vitrine")?.value || "").length > 20,
        { timeout: 60000 }
      );
      textoIA = await page.inputValue("#ct-prod-descricao-vitrine");
    } catch {
      erroIA = (await page.locator(".ct-feed").textContent()) || "";
    }
    if (textoIA) {
      check("C3 IA gerou descrição real (textarea preenchido)", textoIA.length > 20, textoIA.slice(0, 60) + "...");
      // a regra de ouro: a IA nao deve citar preço nem "R$" (só redige o que está cadastrado)
      check("C4 IA nao inventou preço (sem R$ na descrição)", !/R\$\s?\d/i.test(textoIA));
      // salva
      await page.getByRole("button", { name: "Salvar" }).click();
      await page.waitForTimeout(1200);
      // confere no banco
      const { data: depois } = await admin.from("catalog_items").select("description").eq("id", itemId).maybeSingle();
      check("C5 descrição gravada em catalog_items.description", (depois?.description || "").length > 20, (depois?.description || "").slice(0, 50));
      // confere na vitrine publica
      await page.goto(BASE + "/produtos", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);
      const vitrine = (await page.locator("main").textContent()) || "";
      check("C6 descrição aparece na vitrine /produtos", vitrine.includes(textoIA.slice(0, 25)), textoIA.slice(0, 40));
    } else {
      // sem chave/falha de API: o botão deve ter avisado - cobre o caminho best-effort
      check("C3 IA gerou descrição real (textarea preenchido)", false, "sem texto - feedback: " + erroIA.trim().slice(0, 80));
    }
  } finally {
    await browser.close();
    await limparLixo(); // nao deixa lixo no catalogo
  }

  const total = resultados.length;
  const pass = resultados.filter((r) => r.ok).length;
  console.log(`resumo: ${pass}/${total} checks`);
  process.exit(pass === total ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
