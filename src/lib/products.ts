import { createClient } from "@/lib/supabase/server";

export type VarejoProduct = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  price: number;
};

type ItemPriceWithCatalogItem = {
  price: number | string;
  catalog_items: {
    id: string;
    sku: string;
    name: string;
    category: string | null;
    active: boolean;
  };
};

export async function getVarejoProducts(): Promise<VarejoProduct[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("item_prices")
    .select("price, catalog_items!inner(id, sku, name, category, active)")
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
  }));
}
