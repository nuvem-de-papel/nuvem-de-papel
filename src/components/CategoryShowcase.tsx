// "Navegue por Categoria" - pedido do Joaquim pra reproduzir o banner de
// referencia (grid de 6 categorias, foto circular + titulo script rosa +
// descricao). Fotos genericas do Pexels (mesmo banco usado no
// InspirationBanner), licenca livre p/ uso comercial. Substitui o antigo
// CategoryHighlights (cards retangulares com icone) nesta secao da home.
// 09/11/2026: titulo/descricao/fotoId vem de CATEGORIAS_PRODUTOS
// (src/lib/categoriasProdutos.ts), fonte unica compartilhada com as 6
// secoes fixas de /produtos - clicar aqui leva direto pra secao certa.
import { CATEGORIAS_PRODUTOS } from "@/lib/categoriasProdutos";

function fotoPexels(id: number, largura = 300) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${largura}`;
}

export function CategoryShowcase() {
  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "16px 32px 72px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <h2 className="script-heading" style={{ fontSize: 35 }}>Navegue por Categoria</h2>
        <div
          aria-hidden="true"
          style={{ width: 64, height: 3, background: "var(--cta)", opacity: 0.6, margin: "16px auto 0", borderRadius: 2 }}
        />
      </div>

      <div className="category-showcase-grid">
        {CATEGORIAS_PRODUTOS.map((cat) => (
          <a key={cat.slug} href={`/produtos#${cat.slug}`} className="category-showcase-item">
            <div className="category-showcase-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoPexels(cat.fotoId)} alt={cat.titulo} loading="lazy" />
            </div>
            <h3>{cat.titulo}</h3>
            <p>{cat.descricao}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
