/* Helpers E2E da vitrine nova (17/11/2026).
 * Desde o redesenho (PRs #29-#31) a lista /produtos NAO tem botao de
 * carrinho: o item entra pela pagina do produto (/produtos/<SKU>), botao
 * "Adicionar ao carrinho" (ProductActions grande). E a vitrine le o saldo do
 * CD (item_stock_cd_public = item_stock_by_location do local tipo 'cd',
 * cadastro manual da 0044) - separado do ledger item_stock que o checkout
 * reserva. Saldo de CD 0 = "sob consulta" (nao adiciona ao carrinho).
 * Por isso as suites semeiam o saldo do CD e devolvem o valor anterior. */

const TENANT = "00000000-0000-0000-0000-000000000001";

async function localCd(admin) {
  const { data, error } = await admin
    .from("stock_locations")
    .select("id")
    .eq("tenant_id", TENANT)
    .eq("tipo", "cd")
    .order("priority", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("local de estoque tipo 'cd' nao encontrado: " + (error?.message ?? "sem linha"));
  return data.id;
}

// Grava o saldo do CD e devolve o anterior (null = nao havia linha).
async function definirSaldoCd(admin, itemId, qtd) {
  const loc = await localCd(admin);
  const { data: antes } = await admin
    .from("item_stock_by_location")
    .select("stock_on_hand")
    .eq("item_id", itemId)
    .eq("location_id", loc)
    .maybeSingle();
  const { error } = await admin
    .from("item_stock_by_location")
    .upsert({ item_id: itemId, location_id: loc, stock_on_hand: qtd }, { onConflict: "item_id,location_id" });
  if (error) throw new Error("saldo do CD falhou: " + error.message);
  return antes ? Number(antes.stock_on_hand) : null;
}

async function restaurarSaldoCd(admin, itemId, anterior) {
  const loc = await localCd(admin);
  if (anterior === null || anterior === undefined) {
    await admin.from("item_stock_by_location").delete().eq("item_id", itemId).eq("location_id", loc);
  } else {
    await admin
      .from("item_stock_by_location")
      .upsert({ item_id: itemId, location_id: loc, stock_on_hand: anterior }, { onConflict: "item_id,location_id" });
  }
}

// Abre /produtos/<sku>, ajusta a quantidade e clica "Adicionar ao carrinho".
// Nome exato: os cards do "Combina com" usam "Adicionar <nome> ao carrinho".
async function adicionarPelaPagina(page, base, sku, qtd = 1) {
  await page.goto(`${base}/produtos/${encodeURIComponent(sku)}`, { waitUntil: "domcontentloaded" });
  const btn = page.getByRole("button", { name: "Adicionar ao carrinho", exact: true });
  await btn.waitFor({ timeout: 15000 });
  for (let i = 1; i < qtd; i++) {
    await page.getByRole("button", { name: "Aumentar quantidade" }).click();
  }
  await btn.click();
  await page.getByRole("button", { name: "Adicionado", exact: true }).waitFor({ timeout: 5000 }).catch(() => {});
}

module.exports = { definirSaldoCd, restaurarSaldoCd, adicionarPelaPagina };
