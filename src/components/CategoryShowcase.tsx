// "Navegue por Categoria" - pedido do Joaquim pra reproduzir o banner de
// referencia (grid de 6 categorias, foto circular + titulo script rosa +
// descricao). Fotos genericas do Pexels (mesmo banco usado no
// InspirationBanner), licenca livre p/ uso comercial. Substitui o antigo
// CategoryHighlights (cards retangulares com icone) nesta secao da home.
const CATEGORIAS = [
  {
    titulo: "Cadernos",
    descricao: "Cadernos criativos, inteligentes e com folhas decoradas para transformar sua rotina",
    fotoId: 7054755,
  },
  {
    titulo: "Organização",
    descricao: "Organização com charme: agendas, blocos e acessórios para uma rotina prática e criativa",
    fotoId: 30101194,
  },
  {
    titulo: "Lápis e Lapiseiras",
    descricao: "Lápis e lapiseiras criativas para escrever, destacar e presentear",
    fotoId: 6192765,
  },
  {
    titulo: "Canetas",
    descricao: "Canetas criativas, coloridas e fofas para escrever, decorar e presentear",
    fotoId: 6969285,
  },
  {
    titulo: "Estojos e Nécessaires",
    descricao: "Estojos e nécessaires criativos para organizar com charme e personalidade",
    fotoId: 6193741,
  },
  {
    titulo: "Presentes e Coleções",
    descricao: "Itens especiais de papelaria e presentes para inspirar sua rotina",
    fotoId: 28503362,
  },
] as const;

function fotoPexels(id: number, largura = 300) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${largura}`;
}

export function CategoryShowcase() {
  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "16px 32px 72px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <h2 className="script-heading" style={{ fontSize: 34 }}>Navegue por Categoria</h2>
        <div
          aria-hidden="true"
          style={{ width: 64, height: 3, background: "var(--cta)", opacity: 0.6, margin: "16px auto 0", borderRadius: 2 }}
        />
      </div>

      <div className="category-showcase-grid">
        {CATEGORIAS.map((cat) => (
          <a key={cat.titulo} href="/produtos" className="category-showcase-item">
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
