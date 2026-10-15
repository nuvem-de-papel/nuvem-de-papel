/* E2E Produtos - Bloco 2 (0031): cadastro completo + importador por link.
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Rode: node e2e/produtos.cjs
 * Cobre: o form de produto grava os campos que ANTES eram "fantasma"
 * (fabricante, CST PIS/Cofins, base de calculo, CST IBS/CBS, cClassTrib,
 * GTIN tributavel, observacoes, nao-imprimir-preco, data reajuste) e a
 * ficha do fornecedor/embalagem (item_supplier_data: codigo fornecedor, ref
 * fabricante, qtd emb/master, GTIN inner/master, dimensoes e pesos emb e
 * master). GTIN master DUN-14 com DV errado e bloqueado no servidor. O
 * importador por link fica OCULTO na tela e so abre com Ctrl+Shift+[ (o
 * botao Importar sem link avisa) e o aviso sai no TOPO (ct-feed-topo).
 * Cleanup/restaura o catalogo anterior. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const SKU_PROD = "SKU-E2E-PROD-0031";

// dados do produto 114148 do Reval (mesmo do teste offline do parser)
const DUN14_OK = "17891027354944"; // DV do DUN-14 confere
const DUN14_RUIM = "17891027354945"; // DV final errado
const GTIN_INNER_OK = "7891027019150"; // EAN-13 da embalagem (DV confere)

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

async function esperarFeed(page, trecho, timeout = 20000) {
  await page.waitForFunction(
    (t) => (document.querySelector(".ct-feed")?.textContent || "").includes(t),
    trecho,
    { timeout }
  );
  return (await page.locator(".ct-feed").textContent()) || "";
}

async function main() {
  // guarda o catalogo anterior (restaura no final - nao pode deixar lixo)
  const { data: antes } = await admin
    .from("catalog_items")
    .select("id")
    .eq("sku", SKU_PROD)
    .maybeSingle();

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    page.on("dialog", (d) => d.accept());

    await login(page, EMAIL_MASTER, SENHA_MASTER);
    await page.goto(BASE + "/configuracoes/cadastro?tela=produto", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Cadastro de produto" }).waitFor({ timeout: 15000 });
    check("P1 abre a tela de produto", true);

    // importador oculto: some da tela e so abre com o atalho Ctrl+Shift+[
    await page.getByRole("button", { name: "Incluir" }).click();
    check("P2a Importar oculto por padrao", (await page.getByRole("button", { name: "Importar" }).count()) === 0);
    await page.keyboard.press("Control+Shift+[");
    // Importar sem link -> avisa (nao chama rede) e o aviso sai no TOPO
    await page.getByRole("button", { name: "Importar" }).click({ timeout: 10000 });
    const feedSemLink = await esperarFeed(page, "Cole o link");
    check("P2 Importar sem link avisa", feedSemLink.includes("Cole o link"), feedSemLink.trim());
    check(
      "P2b aviso no topo da tela (fora da barra de status)",
      (await page.locator(".ct-feed.ct-feed-topo").count()) === 1 && (await page.locator(".ct-status .ct-feed").count()) === 0
    );

    // GTIN master DUN-14 com DV errado -> bloqueado no servidor
    await page.fill("#ct-prod-descricao", "Produto E2E Bloco 2");
    await page.fill("#ct-prod-sku", SKU_PROD);
    await page.fill("#ct-prod-venda", "R$ 15,00");
    await page.fill("#ct-prod-gtin-master", DUN14_RUIM);
    await page.getByRole("button", { name: "Salvar" }).click();
    const feedDun = await esperarFeed(page, "GTIN master");
    const { data: itemRuim } = await admin.from("catalog_items").select("id").eq("sku", SKU_PROD).maybeSingle();
    check(
      "P3 GTIN master DUN-14 com DV errado bloqueado",
      feedDun.includes("GTIN master inválido") && !itemRuim,
      feedDun.trim()
    );

    // preenche tudo (campos novos que agora gravam) e salva
    await page.fill("#ct-prod-gtin-master", DUN14_OK);
    await page.fill("#ct-prod-gtin-inner", GTIN_INNER_OK);
    await page.fill("#ct-prod-fabricante", "Tilibra");
    await page.fill("#ct-prod-cstpis", "49");
    await page.fill("#ct-prod-cstcofins", "49");
    await page.fill("#ct-prod-icmsbase", "100,00%");
    await page.fill("#ct-prod-cstibscbs", "000");
    await page.fill("#ct-prod-cclasstrib", "000000");
    // GTIN tributavel mora na aba "Outros" (painel escondido ate clicar)
    await page.getByRole("button", { name: /Outros/ }).click();
    await page.fill("#ct-prod-gtintrib", GTIN_INNER_OK);
    // observacoes mora na aba "Observacoes"
    await page.getByRole("button", { name: /Observações/ }).click();
    await page.fill("#ct-prod-observacoes", "Capa dura, 160 fls, A5");
    await page.getByRole("button", { name: /Outros/ }).click();
    await page.fill("#ct-prod-forn-nome", "TILIBRA");
    await page.fill("#ct-prod-forn-sku", "114148");
    await page.fill("#ct-prod-forn-ref", "354945");
    await page.fill("#ct-prod-pack-qty", "4");
    await page.fill("#ct-prod-master-qty", "5");
    await page.fill("#ct-prod-emb-comp", "21,5");
    await page.fill("#ct-prod-emb-alt", "6,5");
    await page.fill("#ct-prod-emb-larg", "15,5");
    await page.fill("#ct-prod-emb-peso", "1,390");
    await page.fill("#ct-prod-mst-comp", "36");
    await page.fill("#ct-prod-mst-alt", "22,5");
    await page.fill("#ct-prod-mst-larg", "16,5");
    await page.fill("#ct-prod-mst-peso", "7,220");
    await page.check("#ct-prod-oculta-preco");
    await page.fill("#ct-prod-reajuste", "2026-10-14");
    await page.getByRole("button", { name: "Salvar" }).click();
    await esperarFeed(page, "Produto salvo");
    check("P4 produto completo salvo", true);

    // confere no banco: catalog_items + item_fiscal_data + item_supplier_data
    const { data: item } = await admin
      .from("catalog_items")
      .select(
        "id, fabricante, notes, hide_price_table, last_adjusted_at, item_fiscal_data(cst_pis, cst_cofins, icms_base_pct, cst_ibscbs, cclass_trib, gtin_tributavel), item_supplier_data(supplier_sku, manufacturer_ref, supplier_name, pack_qty, master_qty, gtin_inner, gtin_master, emb_comprimento_cm, emb_altura_cm, emb_largura_cm, emb_peso_kg, master_comprimento_cm, master_altura_cm, master_largura_cm, master_peso_kg, source_type)"
      )
      .eq("sku", SKU_PROD)
      .maybeSingle();

    const fisc = Array.isArray(item?.item_fiscal_data) ? item.item_fiscal_data[0] : item?.item_fiscal_data;
    const forn = Array.isArray(item?.item_supplier_data) ? item.item_supplier_data[0] : item?.item_supplier_data;

    check(
      "P5 campos 'fantasma' gravaram em catalog_items",
      item?.fabricante === "Tilibra" &&
        (item?.notes || "").includes("Capa dura") &&
        item?.hide_price_table === true &&
        String(item?.last_adjusted_at || "").startsWith("2026-10-14"),
      JSON.stringify({ fab: item?.fabricante, notes: item?.notes, oculto: item?.hide_price_table, reaj: item?.last_adjusted_at })
    );

    check(
      "P6 campos fiscais novos gravaram em item_fiscal_data",
      fisc?.cst_pis === "49" &&
        fisc?.cst_cofins === "49" &&
        Number(fisc?.icms_base_pct) === 100 &&
        fisc?.cst_ibscbs === "000" &&
        fisc?.cclass_trib === "000000" &&
        fisc?.gtin_tributavel === GTIN_INNER_OK,
      JSON.stringify(fisc)
    );

    check(
      "P7 ficha do fornecedor/embalagem gravou em item_supplier_data",
      forn?.supplier_sku === "114148" &&
        forn?.manufacturer_ref === "354945" &&
        forn?.supplier_name === "TILIBRA" &&
        forn?.pack_qty === 4 &&
        forn?.master_qty === 5 &&
        forn?.gtin_inner === GTIN_INNER_OK &&
        forn?.gtin_master === DUN14_OK &&
        Number(forn?.emb_peso_kg) === 1.39 &&
        Number(forn?.master_peso_kg) === 7.22 &&
        forn?.source_type === "manual",
      JSON.stringify(forn)
    );

    // reload: tudo volta preenchido (persistiu de verdade)
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Cadastro de produto" }).waitFor({ timeout: 15000 });
    // abre o produto pela busca de SKU
    await page.fill("#ct-prod-sku", SKU_PROD);
    await page.locator(".ct-ac-list li", { hasText: SKU_PROD }).first().click({ timeout: 10000 });
    const embPesoReload = await page.inputValue("#ct-prod-emb-peso");
    const dunReload = await page.inputValue("#ct-prod-gtin-master");
    const cstpisReload = await page.inputValue("#ct-prod-cstpis");
    const fornSkuReload = await page.inputValue("#ct-prod-forn-sku");
    check(
      "P8 reload mostra a ficha completa persistida",
      dunReload === DUN14_OK &&
        fornSkuReload === "114148" &&
        cstpisReload === "49" &&
        embPesoReload.replace(",", ".").replace(/0+$/, "").startsWith("1.39"),
      `dun=${dunReload} fornSku=${fornSkuReload} cstpis=${cstpisReload} embPeso=${embPesoReload}`
    );
  } finally {
    await browser.close();
  }

  // limpeza: remove o produto do teste (cascade apaga as filhas)
  if (antes) {
    await admin.from("catalog_items").delete().eq("id", antes.id);
  } else {
    await admin.from("catalog_items").delete().eq("sku", SKU_PROD);
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
