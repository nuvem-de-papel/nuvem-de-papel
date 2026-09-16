import { getPublications } from "@/lib/publications";
import { PublicationCard } from "@/components/PublicationCard";

export default async function PublicacoesPage() {
  const publicacoes = await getPublications();

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 32, marginBottom: 8 }}>
        Publicações
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Dicas de organização, lançamentos e novidades — direto do banco de dados.
      </p>

      {publicacoes.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>Nenhuma publicação encontrada.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
          {publicacoes.map((publicacao, index) => (
            <PublicationCard key={publicacao.id} publicacao={publicacao} index={index} />
          ))}
        </div>
      )}
    </main>
  );
}
