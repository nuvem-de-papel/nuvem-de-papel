import { getPublications } from "@/lib/publications";
import { PublicationCard } from "@/components/PublicationCard";
import { PageHeader } from "@/components/admin/PageHeader";

export default async function PublicacoesPage() {
  const publicacoes = await getPublications();

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 72px" }}>
      <PageHeader
        titulo="Publicações"
        subtitulo="Dicas de organização, lançamentos e novidades — direto do banco de dados."
        voltarPara="/"
      />

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
