import { Hero } from "@/components/Hero";
import { CategoryHighlights } from "@/components/CategoryHighlights";
import { ClubBanner } from "@/components/ClubBanner";
import { ProductCard } from "@/components/ProductCard";
import { PublicationCard } from "@/components/PublicationCard";
import { getVarejoProducts } from "@/lib/products";
import { getPublications } from "@/lib/publications";

export default async function HomePage() {
  const [produtos, publicacoes] = await Promise.all([getVarejoProducts(), getPublications()]);
  const destaque = produtos.slice(0, 3);
  const novidades = publicacoes.slice(0, 3);

  return (
    <main>
      <Hero />
      <CategoryHighlights />

      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "0 32px 56px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 className="display" style={{ fontSize: 24, color: "var(--ink)" }}>
            Produtos em destaque
          </h2>
          <a href="/produtos" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Ver todos →
          </a>
        </div>
        {destaque.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Nenhum produto encontrado.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 22 }}>
            {destaque.map((produto) => (
              <ProductCard key={produto.id} produto={produto} />
            ))}
          </div>
        )}
      </section>

      <ClubBanner />

      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "0 32px 80px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 className="display" style={{ fontSize: 24, color: "var(--ink)" }}>
            Publicações & novidades
          </h2>
          <a href="/publicacoes" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Ver todas →
          </a>
        </div>
        {novidades.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Nenhuma publicação encontrada.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 22 }}>
            {novidades.map((publicacao, index) => (
              <PublicationCard key={publicacao.id} publicacao={publicacao} index={index} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
