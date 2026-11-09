"use client";

// Banner "Canetas" (titulo + fileira de fotos com legenda por tipo).
// Fotos genericas do Pexels (licenca livre).
// 09/11/2026: virou carrossel (seta manual) igual ao InspirationBanner -
// medida unica .media-photo-item (250px altura, largura automatica).
import { useRef } from "react";

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
  const trilhoRef = useRef<HTMLDivElement | null>(null);

  function rolar(direcao: 1 | -1) {
    const el = trilhoRef.current;
    if (!el) return;
    el.scrollBy({ left: direcao * Math.min(el.clientWidth * 0.9, 600), behavior: "smooth" });
  }

  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "8px 32px 72px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h2 className="script-heading" style={{ fontSize: 36 }}>Canetas</h2>
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
          {TIPOS.map((tipo) => (
            <div key={tipo.label} style={{ flex: "0 0 auto" }}>
              <div className="media-photo-item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoPexels(tipo.fotoId)} alt={tipo.label} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
              <div className="media-photo-caption">{tipo.label}</div>
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
