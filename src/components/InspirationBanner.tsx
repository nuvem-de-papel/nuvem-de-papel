"use client";

// Banner "Papelaria criativa" — reestruturado 09/11/2026 (pedido do
// Joaquim, 2a rodada): video vira FUNDO da secao inteira (full-bleed,
// esmaecido sob um véu pastel pra legibilidade, mesmo espirito do
// Hero.tsx), as 6 fotos ficam por cima, em carrossel, no tamanho grande
// que elas tinham antes de virar carrossel (300px/220px de altura, como
// era no grid estatico original de 3 fotos). Titulo sem subtitulo.
// Fotos reais do banco gratuito Pexels (busca "papelaria criativa",
// https://www.pexels.com/pt-br/procurar/?q=papelaria%20criativa). Licenca
// Pexels permite uso comercial livre, sem atribuicao obrigatoria.
import { useRef } from "react";

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
  {
    id: 6193082,
    alt: "Adesivos e etiquetas decorativas em tons pastel sobre caderno aberto",
  },
  {
    id: 5705998,
    alt: "Canetinhas coloridas organizadas ao lado de planner aberto",
  },
  {
    id: 30552130,
    alt: "Papelaria criativa com materiais de artesanato em cores suaves",
  },
] as const;

function fotoPexels(id: number, largura = 700) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${largura}`;
}

export function InspirationBanner() {
  const trilhoRef = useRef<HTMLDivElement | null>(null);

  function rolar(direcao: 1 | -1) {
    const el = trilhoRef.current;
    if (!el) return;
    el.scrollBy({ left: direcao * Math.min(el.clientWidth * 0.9, 600), behavior: "smooth" });
  }

  return (
    <section style={{ position: "relative", overflow: "hidden", padding: "40px 0 72px" }}>
      <video
        src="/videos/papelaria-criativa-hero.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }}
      />
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: "rgba(255,251,247,0.72)", zIndex: 1 }}
      />

      <div style={{ position: "relative", zIndex: 2, maxWidth: 1240, margin: "0 auto", padding: "0 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 className="script-heading" style={{ fontSize: 40, margin: "0 auto", maxWidth: "none", whiteSpace: "nowrap" }}>
            Papelaria criativa para alegrar sua rotina
          </h2>
          <div
            aria-hidden="true"
            style={{ width: 64, height: 3, background: "var(--cta)", margin: "18px auto 0", borderRadius: 2, opacity: 0.6 }}
          />
        </div>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            aria-label="Anterior"
            className="carousel-arrow carousel-arrow-left"
            onClick={() => rolar(-1)}
          >
            ‹
          </button>
          <div ref={trilhoRef} className="carousel-track">
            {FOTOS.map((foto) => (
              <div key={foto.id} className="media-photo-item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fotoPexels(foto.id)}
                  alt={foto.alt}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            aria-label="Próximo"
            className="carousel-arrow carousel-arrow-right"
            onClick={() => rolar(1)}
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
