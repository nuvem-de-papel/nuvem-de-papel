/* E2E Fiscal - F8.1 (identificadores M20 + emitente real).
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Rode tudo juntos com: npm run e2e
 * Cobre: /configuracoes/cadastro exige login, emitente salva de verdade
 * (CNPJ com DV conferido no servidor), GTIN com DV conferido no servidor e
 * no banco, GTIN duplicado bloqueado, RLS (anon nao le a emitente) e
 * limpeza/restauracao do estado anterior. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const SKU_FISC = "SKU-E2E-FISC";
const SKU_FISC2 = "SKU-E2E-FISC-2";
const GTIN_OK = "7898943477996"; // valido (DV 6, caderno do catalogo)
const GTIN_RUIM = "7898943477997"; // DV errado
const CNPJ_OK = "11222333000181"; // DVs 81 conferem
const CNPJ_RUIM = "11222333000180"; // DV final errado

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
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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

async function esperarFeed(page, trecho, timeout = 20000) {
  await page.waitForFunction(
    (t) => (document.querySelector(".ct-feed")?.textContent || "").includes(t),
    trecho,
    { timeout }
  );
  return (await page.locator(".ct-feed").textContent()) || "";
}

async function main() {
  // guarda o estado anterior (restaura no final - o E2E nao pode deixar
  // lixo fiscal na emitente nem produtos fantasma no catalogo)
  const { data: empAntes } = await admin
    .from("tenant_company")
    .select("*")
    .eq("tenant_id", TENANT)
    .maybeSingle();
  const { data: sefazAntes } = await admin
    .from("sefaz_config")
    .select("*")
    .eq("tenant_id", TENANT)
    .maybeSingle();

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    page.on("dialog", (d) => d.accept());

    // ---------------------------------------------------- F) fiscal -------
    const anonR = await fetch(BASE + "/configuracoes/cadastro", { redirect: "manual" });
    check(
      "F1 cadastro anonimo redireciona para login",
      [302, 303, 307].includes(anonR.status) && (anonR.headers.get("location") || "").includes("/login"),
      `status=${anonR.status}`
    );

    await login(page, EMAIL_MASTER, SENHA_MASTER);
    await page.goto(BASE + "/configuracoes/cadastro?tela=empresa", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Cadastro da empresa emitente" }).waitFor({ timeout: 15000 });
    check("F2 master abre a tela da empresa emitente", true);

    // CNPJ invalido: DV nao confere -> erro, nada gravado
    await page.fill("#ct-emp-razao", "EMPRESA E2E FISCAL LTDA");
    await page.fill("#ct-emp-cnpj", CNPJ_RUIM);
    await page.getByRole("button", { name: "Salvar" }).click();
    const feed3 = await esperarFeed(page, "CNPJ inválido");
    const { data: empRuim } = await admin
      .from("tenant_company")
      .select("cnpj")
      .eq("tenant_id", TENANT)
      .maybeSingle();
    check(
      "F3 CNPJ com DV errado bloqueado e nada gravado",
      feed3.includes("CNPJ inválido") && empRuim?.cnpj !== CNPJ_RUIM,
      feed3.trim()
    );

    // CNPJ valido: salva no banco e volta no reload
    await page.fill("#ct-emp-cnpj", CNPJ_OK);
    await page.getByRole("button", { name: "Salvar" }).click();
    await esperarFeed(page, "Empresa emitente salva");
    const { data: empOk } = await admin
      .from("tenant_company")
      .select("cnpj, razao_social, regime")
      .eq("tenant_id", TENANT)
      .maybeSingle();
    check(
      "F4 emitente salva de verdade (CNPJ no banco)",
      empOk?.cnpj === CNPJ_OK && empOk?.razao_social === "EMPRESA E2E FISCAL LTDA",
      JSON.stringify(empOk)
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Cadastro da empresa emitente" }).waitFor({ timeout: 15000 });
    const cnpjReload = await page.inputValue("#ct-emp-cnpj");
    check("F5 reload mostra a emitente persistida", cnpjReload.replace(/\D/g, "") === CNPJ_OK, cnpjReload);

    // produtos: tela abre com a lista real do banco
    await page.goto(BASE + "/configuracoes/cadastro?tela=produto", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Cadastro de produto" }).waitFor({ timeout: 15000 });
    const pill = (await page.locator(".ct-pill.strong").textContent()) || "";
    const nProd = Number((pill.match(/(\d+)/) || [])[1] || 0);
    check("F6 tela de produto lista o catalogo real", nProd > 0, pill.trim());

    // produto novo com GTIN de DV errado -> bloqueado pelo servidor
    await page.getByRole("button", { name: "Incluir" }).click();
    await page.fill("#ct-prod-descricao", "Produto E2E Fiscal");
    await page.fill("#ct-prod-sku", SKU_FISC);
    await page.fill("#ct-prod-venda", "R$ 10,00");
    await page.fill("#ct-prod-gtin", GTIN_RUIM);
    await page.getByRole("button", { name: "Salvar" }).click();
    const feed7 = await esperarFeed(page, "GTIN");
    const { data: itemRuim } = await admin
      .from("catalog_items")
      .select("id")
      .eq("sku", SKU_FISC)
      .maybeSingle();
    check(
      "F7 GTIN com DV errado bloqueado pelo servidor",
      feed7.includes("DV não confere") && !itemRuim,
      feed7.trim()
    );

    // GTIN valido: grava produto + fiscal
    await page.fill("#ct-prod-gtin", GTIN_OK);
    await page.getByRole("button", { name: "Salvar" }).click();
    await esperarFeed(page, "Produto salvo");
    const { data: itemOk } = await admin
      .from("catalog_items")
      .select("id, item_fiscal_data(gtin)")
      .eq("sku", SKU_FISC)
      .maybeSingle();
    const gtinBanco = Array.isArray(itemOk?.item_fiscal_data)
      ? itemOk.item_fiscal_data[0]?.gtin
      : itemOk?.item_fiscal_data?.gtin;
    check(
      "F8 produto salvo com GTIN conferido no banco",
      !!itemOk && gtinBanco === GTIN_OK,
      `gtin=${gtinBanco}`
    );

    // mesmo GTIN em outro produto -> indice unico do banco
    await page.getByRole("button", { name: "Incluir" }).click();
    await page.fill("#ct-prod-descricao", "Produto E2E Fiscal 2");
    await page.fill("#ct-prod-sku", SKU_FISC2);
    await page.fill("#ct-prod-venda", "R$ 20,00");
    await page.fill("#ct-prod-gtin", GTIN_OK);
    await page.getByRole("button", { name: "Salvar" }).click();
    const feed9 = await esperarFeed(page, "GTIN");
    check("F9 GTIN duplicado bloqueado (indice unico)", feed9.includes("já está cadastrado"), feed9.trim());

    // RLS: anon nao le a emitente
    const { data: anonLe } = await anon.from("tenant_company").select("cnpj");
    check("F10 anon nao le a emitente (RLS)", !anonLe || anonLe.length === 0, `linhas=${anonLe ? anonLe.length : 0}`);
  } finally {
    await browser.close();
  }

  // limpeza: remove os produtos do teste e restaura a emitente anterior
  await admin.from("catalog_items").delete().in("sku", [SKU_FISC, SKU_FISC2]);
  if (empAntes) {
    await admin.from("tenant_company").upsert(empAntes, { onConflict: "tenant_id" });
  } else {
    await admin.from("tenant_company").delete().eq("tenant_id", TENANT);
  }
  if (sefazAntes) {
    await admin.from("sefaz_config").upsert(sefazAntes, { onConflict: "tenant_id" });
  } else {
    await admin.from("sefaz_config").delete().eq("tenant_id", TENANT);
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
