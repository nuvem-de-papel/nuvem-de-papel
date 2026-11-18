import { Hero } from "@/components/Hero";
import { CategoryShowcase } from "@/components/CategoryShowcase";
import { CategoryCarousel } from "@/components/produtos/CategoryCarousel";
import { getStoreProducts, type VarejoProduct } from "@/lib/products";
import { agruparPorGrupo, gruposDoMenu } from "@/lib/categoriasProdutos";
import { carregarGrupos } from "@/lib/gruposSetores";
import { createClient } from "@/lib/supabase/server";

// Vitrine do Hero em loop: 1o produto de cada grupo, depois o 2o de cada, etc.
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
  const [produtos, grupos] = await Promise.all([getStoreProducts(), carregarGrupos(createClient())]);
  const destaque = produtos.filter((p) => p.emDestaque);
  const ofertas = produtos.filter((p) => p.emOferta);
  // Lancamento (0055): vence sozinho em lancamento_ate (regra em lib/lancamento).
  const lancamentos = produtos.filter((p) => p.emLancamento);
  // 0057: carrosseis por GRUPO do banco (grupo sem produto some; "Outros" no fim)
  const setores = agruparPorGrupo(produtos, grupos);

  return (
    <main style={{ overflowX: "clip" }}>
      <Hero vitrine={ordemLoop(setores)} />

      {lancamentos.length > 0 && (
        <section aria-label="Lançamentos" style={{ width: "100vw", marginLeft: "calc(50% - 50vw)", padding: "34px 56px 18px", boxSizing: "border-box" }}>
          <CategoryCarousel title="Lançamentos" products={lancamentos} intensidadeCor={10} encaixar />
        </section>
      )}
      <CategoryShowcase grupos={gruposDoMenu(setores)} />

      <section className="fundo-animado fundo-home-setores">
        <div style={{ width: "100vw", marginLeft: "calc(50% - 50vw)", padding: "34px 56px 0", boxSizing: "border-box" }}>
          {setores.map((setor) => (
            <div key={setor.slug} style={{ marginBottom: 18 }}>
              <CategoryCarousel title={setor.title} products={setor.items} cor={setor.cor} corTitulo={setor.corTitulo} intensidadeCor={10} encaixar />
            </div>
          ))}
        </div>
      </section>

      {destaque.length > 0 && (
        <div style={{ width: "100vw", marginLeft: "calc(50% - 50vw)", padding: "18px 56px 0", boxSizing: "border-box" }}>
          <CategoryCarousel title="Destaques" products={destaque} intensidadeCor={10} encaixar />
        </div>
      )}

      {ofertas.length > 0 && (
        <div style={{ width: "100vw", marginLeft: "calc(50% - 50vw)", padding: "18px 56px 72px", boxSizing: "border-box" }}>
          <CategoryCarousel title="Ofertas" products={ofertas} intensidadeCor={10} encaixar />
        </div>
      )}
    </main>
  );
}
