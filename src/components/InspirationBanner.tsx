"use client";

// Banner "Papelaria criativa" — pedido do Joaquim (09/11/2026): trocar a
// fileira estatica de 3 fotos por um carrossel real, com o video
// "papelaria criativa" (public/videos/papelaria-criativa-hero.mp4) como
// 1a slide e 6 fotos Pexels em seguida. Padrao de <video> copiado do
// Hero.tsx (autoPlay/muted/playsInline/preload). Fotos reais do banco
// gratuito Pexels (busca "papelaria criativa",
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

function fotoPexels(id: number, largura = 900) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${largura}`;
}

export function InspirationBanner() {
  const trilhoRef = useRef<HTMLDivElement | null>(null);

  function rolar(direcao: 1 | -1) {
    const el = trilhoRef.current;
    if (!el) return;
    el.scrollBy({ left: direcao * el.clientWidth, behavior: "smooth" });
  }

  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "8px 32px 72px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h2 className="script-heading" style={{ fontSize: 40, margin: "0 auto", maxWidth: "none", whiteSpace: "nowrap" }}>
          Papelaria criativa para alegrar sua rotina
        </h2>
        <p
          style={{
            fontSize: 19,
            color: "#000000",
            maxWidth: "none",
            margin: "14px auto 0",
            lineHeight: 1.6,
            whiteSpace: "nowrap",
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

      <div style={{ position: "relative" }}>
        <button
          type="button"
          aria-label="Anterior"
          className="carousel-arrow carousel-arrow-left"
          onClick={() => rolar(-1)}
        >
          ‹
        </button>
        <div ref={trilhoRef} className="inspiration-carousel-track">
          <div className="inspiration-carousel-slide">
            <video
              src="/videos/papelaria-criativa-hero.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-hidden="true"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
          {FOTOS.map((foto) => (
            <div key={foto.id} className="inspiration-carousel-slide">
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
    </section>
  );
}
