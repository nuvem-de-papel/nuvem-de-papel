// Banner "Papelaria criativa" - pedido do Joaquim: reproduzir o estilo de
// banner de referencia (titulo script rosa + subtitulo + fileira de fotos),
// usando fotos reais do banco gratuito Pexels (busca "papelaria criativa",
// https://www.pexels.com/pt-br/procurar/?q=papelaria%20criativa). Licenca
// Pexels permite uso comercial livre, sem atribuicao obrigatoria.
const FOTOS = [
  {
    id: 6193094,
    alt: "Marcadores, lapis de cor e clipes organizados em tons pastel sobre a mesa",
  },
  {
    id: 6969285,
    alt: "Composicao flat lay com clipes de papel e canetinhas coloridas",
  },
  {
    id: 35822002,
    alt: "Materiais de artesanato e adesivos coloridos para projetos criativos",
  },
] as const;

function fotoPexels(id: number, largura = 700) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${largura}`;
}

export function InspirationBanner() {
  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "8px 32px 72px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h2 className="script-heading" style={{ fontSize: 38, margin: "0 auto", maxWidth: 720 }}>
          Papelaria criativa para alegrar sua rotina
        </h2>
        <p
          style={{
            fontSize: 15,
            color: "var(--ink-soft)",
            maxWidth: 560,
            margin: "14px auto 0",
            lineHeight: 1.6,
          }}
        >
          Itens fofos e cheios de charme para organizar o dia a dia com cor, leveza e
          criatividade - perfeitos para presentear ou se presentear.
        </p>
        <div
          aria-hidden="true"
          style={{ width: 64, height: 3, background: "var(--cta)", margin: "18px auto 0", borderRadius: 2, opacity: 0.6 }}
        />
      </div>

      <div className="banner-photos">
        {FOTOS.map((foto) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={foto.id}
            src={fotoPexels(foto.id)}
            alt={foto.alt}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ))}
      </div>
    </section>
  );
}
