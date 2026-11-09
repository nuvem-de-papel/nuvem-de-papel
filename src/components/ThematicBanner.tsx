"use client";

// Banner "tematico" (2a posicao de banner na home) - mesmo padrao visual do
// InspirationBanner (titulo script rosa + fotos), mas arquivo separado de
// proposito pra nao arriscar mexer no banner ja aprovado. A referencia do
// Joaquim mostrava produtos com personagens licenciados (Harry Potter,
// Disney) - como nao da pra usar fotos de banco de imagens com esses
// personagens (direito autoral/marca), aqui entram fotos genericas de
// papelaria (Pexels, licenca livre p/ uso comercial), com copy tambem
// generica (sem citar franquias).
// 09/11/2026: virou carrossel (seta manual) igual ao InspirationBanner -
// medida unica .media-photo-item (250px altura, largura automatica) e
// minimo de 4 fotos por secao (tinha 3, id 28503362 foi adicionado).
import { useRef } from "react";

const FOTOS = [
  { id: 6192765, alt: "Lapis, apagador colorido e clipes de papel organizados" },
  { id: 9598103, alt: "Canetas coloridas suspensas, vista de perto" },
  { id: 9743014, alt: "Clipes de papel em tons de rosa" },
  { id: 28503362, alt: "Itens especiais de papelaria coloridos e cheios de personalidade" },
] as const;

function fotoPexels(id: number, largura = 700) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${largura}`;
}

export function ThematicBanner() {
  const trilhoRef = useRef<HTMLDivElement | null>(null);

  function rolar(direcao: 1 | -1) {
    const el = trilhoRef.current;
    if (!el) return;
    el.scrollBy({ left: direcao * Math.min(el.clientWidth * 0.9, 600), behavior: "smooth" });
  }

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
    </section>
  );
}
