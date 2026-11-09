import { Hero } from "@/components/Hero";
import { InspirationBanner } from "@/components/InspirationBanner";
import { CategoryShowcase } from "@/components/CategoryShowcase";
import { ThematicBanner } from "@/components/ThematicBanner";
import { PenCategoryBanner } from "@/components/PenCategoryBanner";
import { ProductCarousel } from "@/components/ProductCarousel";
import { getStoreProducts, type VarejoProduct } from "@/lib/products";

// Normaliza texto (minusculo, sem acento) pra filtrar categoria sem
// depender de grafia exata (ex.: "Lápis" vs "lapis").
function normaliza(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function porCategoria(produtos: VarejoProduct[], termos: string[]) {
  return produtos.filter((p) => {
    const categoria = normaliza(p.category ?? "");
    return termos.some((termo) => categoria.includes(normaliza(termo)));
  });
}

export default async function HomePage() {
  const produtos = await getStoreProducts();
  const destaque = produtos.slice(0, 8);
  const lapisELapiseiras = porCategoria(produtos, ["lapis", "lapiseira"]);
  const borrachas = porCategoria(produtos, ["borracha"]);

  return (
    <main>
      <Hero />
      <CategoryShowcase />
      <InspirationBanner />
      <ThematicBanner />

      <ProductCarousel titulo="Destaques" produtos={destaque} verTodosHref="/produtos" />

      <PenCategoryBanner />

      <ProductCarousel titulo="Lápis ou Lapiseira?" produtos={lapisELapiseiras} />

      <ProductCarousel
        titulo="Borrachas criativas e colecionáveis para quem ama papelaria fofa"
        produtos={borrachas}
      />
    </main>
  );
}
