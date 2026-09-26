import { createClient } from "@/lib/supabase/server";

export type VarejoProduct = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  price: number;
  /** null = item sem controle de estoque (ilimitado); 0 = esgotado. */
  estoque: number | null;
};

type ItemPriceWithCatalogItem = {
  price: number | string;
  min_quantity: number;
  catalog_items: {
    id: string;
    sku: string;
    name: string;
    category: string | null;
    active: boolean;
    item_stock_public: { stock_available: number } | null;
  };
};

// Vitrine da loja: visitante/equipe veem varejo; revenda ativa ve atacado
// (mesmo SKU, preço B). Faixa vigente escolhida por menor min_quantity —
// "preço a partir de" — mesma regra de exibição do PDV (F6).
export async function getStoreProducts(): Promise<VarejoProduct[]> {
  const supabase = createClient();

  let channel: "varejo" | "atacado" = "varejo";
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.status === "ativo" && profile.role === "revenda") {
      channel = "atacado";
    }
  }

  const agora = new Date().toISOString();
  const { data, error } = await supabase
    .from("item_prices")
    .select(
      "price, min_quantity, valid_from, valid_until, catalog_items!inner(id, sku, name, category, active, item_stock_public(stock_available))"
    )
    .eq("channel", channel)
    .eq("catalog_items.active", true)
    .lte("valid_from", agora)
    .or(`valid_until.is.null,valid_until.gt.${agora}`)
    .order("min_quantity", { ascending: true })
    .order("valid_from", { ascending: false })
    .returns<ItemPriceWithCatalogItem[]>();

  if (error) {
    console.error("getStoreProducts:", error.message);
    return [];
  }

  const porItem = new Map<string, VarejoProduct>();
  for (const row of data ?? []) {
    const item = row.catalog_items;
    if (porItem.has(item.id)) continue; // ordenado: primeira linha é a base
    porItem.set(item.id, {
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      price: Number(row.price),
      estoque: item.item_stock_public
        ? Number(item.item_stock_public.stock_available)
        : null,
    });
  }
  return [...porItem.values()];
}
