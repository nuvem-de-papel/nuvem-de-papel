// Banner "tematico" (2a posicao de banner na home) - mesmo padrao visual do
// InspirationBanner (titulo script rosa + 3 fotos), mas arquivo separado de
// proposito pra nao arriscar mexer no banner ja aprovado. A referencia do
// Joaquim mostrava produtos com personagens licenciados (Harry Potter,
// Disney) - como nao da pra usar fotos de banco de imagens com esses
// personagens (direito autoral/marca), aqui entram fotos genericas de
// papelaria (Pexels, licenca livre p/ uso comercial), com copy tambem
// generica (sem citar franquias).
const FOTOS = [
  { id: 6192765, alt: "Lapis, apagador colorido e clipes de papel organizados" },
  { id: 9598103, alt: "Canetas coloridas suspensas, vista de perto" },
  { id: 9743014, alt: "Clipes de papel em tons de rosa" },
] as const;

function fotoPexels(id: number, largura = 700) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${largura}`;
}

export function ThematicBanner() {
  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "8px 32px 72px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h2 className="script-heading" style={{ fontSize: 37, margin: "0 auto", maxWidth: "none", whiteSpace: "nowrap" }}>
          Papelaria cheia de personalidade pra quem ama criar
        </h2>
        <div
          aria-hidden="true"
          style={{ width: 64, height: 3, background: "var(--cta)", opacity: 0.6, margin: "18px auto 0", borderRadius: 2 }}
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
