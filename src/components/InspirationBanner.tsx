"use client";

// Banner "Papelaria criativa" — 10/11/2026 (pedido do Joaquim): as fotos
// decorativas do Pexels viraram carrossel de PRODUTO real (ProductCard
// - imagem, categoria, nome, preco, estoque disponivel/indisponivel),
// igual ao Destaques/Lapis-Lapiseira/Borrachas. Mantem o fundo com video
// full-bleed esmaecido atras do conteudo (ajustado em rodada anterior,
// o Joaquim avaliou que nao ficou perfeito mas decidiu deixar assim por
// enquanto).
import { useRef } from "react";
import type { VarejoProduct } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

export function InspirationBanner({ produtos }: { produtos: VarejoProduct[] }) {
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
      </div>
    </section>
  );
}
