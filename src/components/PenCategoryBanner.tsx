// Banner "Canetas" (estilo da referencia: titulo + descricao + fileira de
// fotos com legenda por tipo). Fotos genericas do Pexels (licenca livre).
const TIPOS = [
  { label: "Esferográfica", fotoId: 4492447 },
  { label: "Gel", fotoId: 6193094 },
  { label: "Hidrográfica/Fineliner", fotoId: 9598103 },
  { label: "Marca-texto", fotoId: 6969285 },
] as const;

function fotoPexels(id: number, largura = 500) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${largura}`;
}

export function PenCategoryBanner() {
  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "8px 32px 72px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h2 className="script-heading" style={{ fontSize: 36 }}>Canetas</h2>
        <p
          style={{
            fontSize: 19,
            color: "#000000",
            maxWidth: 620,
            margin: "12px auto 0",
            lineHeight: 1.6,
          }}
        >
          Canetas são mágicas: com um simples traço, elas escrevem histórias, desenham
          sonhos e organizam planos. Criativas, coloridas e fofas, perfeitas pra deixar sua
          rotina mais leve e divertida.
        </p>
      </div>

      <div className="pen-category-grid">
        {TIPOS.map((tipo) => (
          <div key={tipo.label} className="pen-category-item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoPexels(tipo.fotoId)} alt={tipo.label} loading="lazy" />
            <span>{tipo.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
