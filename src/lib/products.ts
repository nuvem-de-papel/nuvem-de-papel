import { createClient } from "@/lib/supabase/server";

export type VarejoProduct = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  price: number;
  /** Saldo do CD (0049). 0 = sob consulta: vitrine oferece pedido de orcamento. */
  estoque: number | null;
  /** Foto real do produto (0032, catalog_items.foto_url). null = sem foto. */
  fotoUrl: string | null;
  /** Descrição pública (0038, catalog_items.description). null = sem descrição. */
  description: string | null;
  /** Grade (0051): SKU do produto pai. null = item sem grade. */
  grupoPai: string | null;
  /** Grade (0051): rótulo da variante (ex.: Modelo 2). */
  cor: string | null;
  /** Oferta (0053): aparece no banner de Ofertas. */
  emOferta: boolean;
  /** Destaque (0053): aparece no banner de Destaques. */
  emDestaque: boolean;
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
    foto_url: string | null;
    description: string | null;
    grupo_pai: string | null;
    cor: string | null;
    em_oferta: boolean;
    em_destaque: boolean;
    item_images: { url: string; position: number }[] | null;
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
      "price, min_quantity, valid_from, valid_until, catalog_items!inner(id, sku, name, category, active, foto_url, description, grupo_pai, cor, em_oferta, em_destaque, item_images(url, position))"
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

  // Saldo do CD (0049) e a unica fonte de venda da vitrine. Falha ou sem
  // linha = 0 (sob consulta): fail-closed, nunca vende sem saldo confirmado.
  const { data: cdRows, error: cdError } = await supabase
    .from("item_stock_cd_public")
    .select("item_id, stock_on_hand")
    .returns<{ item_id: string; stock_on_hand: number }[]>();
  if (cdError) console.error("getStoreProducts cd:", cdError.message);
  const saldoCd = new Map((cdRows ?? []).map((r) => [r.item_id, Number(r.stock_on_hand)]));

  const porItem = new Map<string, VarejoProduct>();
  for (const row of data ?? []) {
    const item = row.catalog_items;
    // Grade (0051): variante (ex.: BLT38A) nao vira card proprio - aparece
    // na pagina do produto principal (BLT38).
    if (item.grupo_pai && item.grupo_pai !== item.sku) continue;
    if (porItem.has(item.id)) continue; // ordenado: primeira linha é a base
    porItem.set(item.id, {
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      price: Number(row.price),
      estoque: saldoCd.get(item.id) ?? 0,
      // 0048: capa real (item_images, position=0) tem prioridade sobre o
      // foto_url antigo (URL do fornecedor, so pros produtos importados
      // pela Busca Web).
      fotoUrl:
        (item.item_images ?? []).find((img) => img.position === 0)?.url ??
        item.foto_url,
      description: item.description,
      grupoPai: item.grupo_pai,
      cor: item.cor,
      emOferta: item.em_oferta,
      emDestaque: item.em_destaque,
    });
  }
  return [...porItem.values()];
}
