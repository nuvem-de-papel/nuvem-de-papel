import { NextRequest, NextResponse } from "next/server";
import { getStoreProducts } from "@/lib/products";

// Busca de produto pela lupa do topo: nome ou SKU, sem acento e sem caixa.
// So produtos da vitrine (ativos, sem variantes ocultas). Maximo 12 resultados.
export const dynamic = "force-dynamic";

function normaliza(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export async function GET(req: NextRequest) {
  const termo = normaliza((req.nextUrl.searchParams.get("q") ?? "").trim()).slice(0, 80);
  if (termo.length < 2) return NextResponse.json({ itens: [] });

  const todos = await getStoreProducts();
  const itens = todos
    .filter((p) => normaliza(p.name).includes(termo) || normaliza(p.sku).includes(termo))
    .slice(0, 12)
    .map((p) => ({ sku: p.sku, name: p.name, price: p.price, category: p.category }));

  return NextResponse.json({ itens });
}
