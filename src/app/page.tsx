import { Hero } from "@/components/Hero";
import { CategoryShowcase } from "@/components/CategoryShowcase";
import { CategoryCarousel } from "@/components/produtos/CategoryCarousel";
import { getStoreProducts, type VarejoProduct } from "@/lib/products";
import { agruparPorSetor } from "@/lib/categoriasProdutos";

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

// Vitrine do Hero em loop: 1o produto de cada setor, depois o 2o de cada, etc.
function ordemLoop(setores: { items: VarejoProduct[] }[]): VarejoProduct[] {
  const saida: VarejoProduct[] = [];
  const maior = Math.max(0, ...setores.map((s) => s.items.length));
  for (let j = 0; j < maior; j++) {
    for (const setor of setores) {
      if (setor.items[j]) saida.push(setor.items[j]);
    }
  }
  return saida;
}

export default async function HomePage() {
  const produtos = await getStoreProducts();
  const destaque = produtos.slice(0, 8);
  const lapisELapiseiras = porCategoria(produtos, ["lapis", "lapiseira"]);
  const setores = agruparPorSetor(produtos);

  return (
    <main style={{ overflowX: "clip" }}>
      <Hero vitrine={ordemLoop(setores)} />
      <CategoryShowcase />

      <section className="fundo-animado fundo-home-setores">
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "34px 32px 0" }}>
          {setores.map((setor) => (
            <div key={setor.slug} style={{ marginBottom: 18 }}>
              <CategoryCarousel title={setor.title} products={setor.items} cor={setor.cor} corTitulo={setor.corTitulo} />
            </div>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 32px 0" }}>
        <CategoryCarousel title="Destaques" products={destaque} />
      </div>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 32px 72px" }}>
        <CategoryCarousel title="Lápis ou Lapiseira?" products={lapisELapiseiras} />
      </div>
    </main>
  );
}
