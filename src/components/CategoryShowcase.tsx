// "Navegue por Categoria" - grade circular da home (titulo script rosa +
// descricao). 18/11/2026 (0057): passou dos 7 setores fixos para os GRUPOS
// do banco que tem produto na vitrine; o circulo mostra o icone de linha
// fina do grupo, na cor do grupo (as fotos Pexels eram placeholders
// emprestados de outros setores). Clicar leva para /produtos#<slug>.
import { IconeGrupo } from "@/components/catalogo/IconeGrupo";
import type { GrupoSetor } from "@/lib/categoriasProdutos";

export function CategoryShowcase({ grupos }: { grupos: GrupoSetor[] }) {
  if (grupos.length === 0) return null;
  const total = String(grupos.length).padStart(2, "0");
  return (
    <section className="tech-band" style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 32px 72px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div className="tech-label" style={{ justifyContent: "center" }}>
          Navegue por categoria · {total} {grupos.length === 1 ? "grupo" : "grupos"}
        </div>
        <div
          aria-hidden="true"
          style={{ width: 64, height: 3, background: "var(--cta)", opacity: 0.6, margin: "0 auto", borderRadius: 2 }}
        />
      </div>

      <div className="category-showcase-grid">
        {grupos.map((g) => (
          <a key={g.slug} href={`/produtos#${g.slug}`} className="category-showcase-item">
            <div className="category-showcase-photo category-showcase-icone" style={{ background: `${g.cor}33` }}>
              <IconeGrupo icone={g.icone} tamanho={56} />
            </div>
            <h3>{g.title}</h3>
          </a>
        ))}
      </div>
    </section>
  );
}
