import { NextRequest, NextResponse } from "next/server";
import { getStoreProducts } from "@/lib/products";

// Busca de produto da barra do topo: nome, SKU ou descricao publica, sem
// acento e sem caixa. So produtos da vitrine (ativos, sem variantes ocultas).
// Maximo 12 resultados; quem casa no nome/SKU vem antes de quem casa so na
// descricao. Desde 21/11/2026 devolve tambem a foto principal (item_images
// posicao 0, senao catalog_items.foto_url) para a lista mostrar a imagem.
export const dynamic = "force-dynamic";

function normaliza(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export async function GET(req: NextRequest) {
  const termo = normaliza((req.nextUrl.searchParams.get("q") ?? "").trim()).slice(0, 80);
  if (termo.length < 2) return NextResponse.json({ itens: [] });

  const todos = await getStoreProducts();
  const principais: typeof todos = [];
  const pelaDescricao: typeof todos = [];
  for (const p of todos) {
    if (normaliza(p.name).includes(termo) || normaliza(p.sku).includes(termo)) principais.push(p);
    else if (p.description && normaliza(p.description).includes(termo)) pelaDescricao.push(p);
  }
  const itens = [...principais, ...pelaDescricao].slice(0, 12).map((p) => ({
    sku: p.sku,
    name: p.name,
    price: p.price,
    category: p.category,
    foto: p.fotoUrl ?? null,
  }));

  return NextResponse.json({ itens });
}
