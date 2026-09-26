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
  catalog_items: {
    id: string;
    sku: string;
    name: string;
    category: string | null;
    active: boolean;
    item_stock_public: { stock_available: number } | null;
  };
};

export async function getVarejoProducts(): Promise<VarejoProduct[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("item_prices")
    .select(
      "price, catalog_items!inner(id, sku, name, category, active, item_stock_public(stock_available))"
    )
    .eq("channel", "varejo")
    .eq("catalog_items.active", true)
    .returns<ItemPriceWithCatalogItem[]>();

  if (error) {
    console.error("getVarejoProducts:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.catalog_items.id,
    sku: row.catalog_items.sku,
    name: row.catalog_items.name,
    category: row.catalog_items.category,
    price: Number(row.price),
    estoque: row.catalog_items.item_stock_public
      ? Number(row.catalog_items.item_stock_public.stock_available)
      : null,
  }));
}
