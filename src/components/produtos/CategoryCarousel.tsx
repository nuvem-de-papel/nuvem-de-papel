"use client";

import { useRef } from "react";
import type { VarejoProduct } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

// Secao de setor em /produtos. Cards iguais aos da home: ProductCard dentro
// de .carousel-item (mesma classe e mesmo tamanho). So o cabecalho rosa muda.
export function CategoryCarousel({
  title,
  products,
  cor,
  corTitulo,
}: {
  title: string;
  products: VarejoProduct[];
  /** cor do setor (paleta). Sem cor = visual padrao rosa. */
  cor?: string;
  /** cor do titulo do setor, diferente do fundo */
  corTitulo?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => {
    trackRef.current?.scrollBy({ left: dir * 520, behavior: "smooth" });
  };

  return (
    <section
      style={{
        background: cor ? `color-mix(in srgb, ${cor} 18%, #FFFFFF)` : "var(--pink-100)",
        borderRadius: 18,
        padding: "22px 24px 14px",
        marginBottom: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 14px" }}>
        <h2 className="display" style={{ fontSize: 21, margin: 0, color: corTitulo ?? "var(--navy)" }}>
          {title}
        </h2>
        <span
          style={{
            background: "#FFFFFF",
            color: "#100D0D",
            fontSize: 12,
            fontWeight: 700,
            padding: "5px 14px",
            borderRadius: 999,
          }}
        >
          Categoria
        </span>
        <span style={{ flex: 1, height: 1, background: "#100D0D" }} />
      </div>

      {products.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 15, padding: "18px 0 8px" }}>
          Em breve, novidades nessa categoria.
        </p>
      ) : (
        <div style={{ position: "relative" }}>
          <button
            onClick={() => scroll(-1)}
            aria-label="Rolar para a esquerda"
            style={{
              position: "absolute",
              top: "40%",
              left: -14,
              transform: "translateY(-50%)",
              width: 42,
              height: 42,
              borderRadius: "50%",
              border: "none",
              background: corTitulo ?? "var(--navy)",
              color: "#FFFFFF",
              fontSize: 20,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(0, 107, 225,0.3)",
              zIndex: 5,
            }}
          >
            ‹
          </button>

          <div ref={trackRef} className="carousel-track">
            {products.map((p) => (
              <div key={p.id} className="carousel-item">
                <ProductCard produto={p} />
              </div>
            ))}
          </div>

          <button
            onClick={() => scroll(1)}
            aria-label="Rolar para a direita"
            style={{
              position: "absolute",
              top: "40%",
              right: -14,
              transform: "translateY(-50%)",
              width: 42,
              height: 42,
              borderRadius: "50%",
              border: "none",
              background: corTitulo ?? "var(--navy)",
              color: "#FFFFFF",
              fontSize: 20,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(0, 107, 225,0.3)",
              zIndex: 5,
            }}
          >
            ›
          </button>
        </div>
      )}
    </section>
  );
}
