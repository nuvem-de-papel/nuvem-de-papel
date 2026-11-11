"use client";

import { useRef, type ReactNode } from "react";
import type { VarejoProduct } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

// Carrossel de produtos reutilizavel (estilo "Destaques"/"Lápis ou
// Lapiseira?"/"Borrachas" da referencia): titulo script rosa + setas +
// fileira de ProductCard com scroll horizontal. Usa o catalogo real
// (getStoreProducts ja filtrado por quem chama) - fica vazio/com poucos
// itens ate ter produto cadastrado de verdade, por decisao do Joaquim
// (09/11/2026): nao e mockup, e o componente definitivo.
export function ProductCarousel({
  titulo,
  subtitulo,
  subtituloMaxWidth = 620,
  produtos,
  verTodosHref,
  rotulo,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  subtituloMaxWidth?: number | string;
  produtos: VarejoProduct[];
  verTodosHref?: string;
  rotulo?: string;
}) {
  const trilhoRef = useRef<HTMLDivElement | null>(null);

  function rolar(direcao: 1 | -1) {
    const el = trilhoRef.current;
    if (!el) return;
    el.scrollBy({ left: direcao * Math.min(el.clientWidth * 0.9, 600), behavior: "smooth" });
  }

  return (
    <section className="tech-band" style={{ maxWidth: 1240, margin: "0 auto", padding: "8px 32px 72px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        {rotulo && (
          <div className="tech-label" style={{ justifyContent: "center" }}>
            {rotulo}
          </div>
        )}
        <h2 className="script-heading" style={{ fontSize: 36 }}>{titulo}</h2>
        {subtitulo && (
          <p style={{ fontSize: 19, color: "#000000", maxWidth: subtituloMaxWidth, margin: "12px auto 0", lineHeight: 1.6 }}>
            {subtitulo}
          </p>
        )}
        {verTodosHref && (
          <a href={verTodosHref} style={{ fontSize: 13, color: "var(--ink-soft)", display: "inline-block", marginTop: 10 }}>
            Ver todos →
          </a>
        )}
      </div>

      {produtos.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 18 }}>
          Em breve, novidades nessa categoria.
        </p>
      ) : (
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
            {produtos.map((produto) => (
              <div key={produto.id} className="carousel-item">
                <ProductCard produto={produto} />
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
      )}
    </section>
  );
}
