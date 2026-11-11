"use client";

// Banner "Papelaria criativa" — 10/11/2026 (pedido do Joaquim): as fotos
// decorativas do Pexels viraram carrossel de PRODUTO real (ProductCard
// - imagem, categoria, nome, preco, estoque disponivel/indisponivel),
// igual ao Destaques/Lapis-Lapiseira/Borrachas. Fundo com video full-bleed
// removido em 10/11/2026 (o Joaquim avaliou e pediu pra tirar) - secao
// fica com o fundo padrao da pagina.
import { useRef } from "react";
import type { VarejoProduct } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

export function InspirationBanner({
  produtos,
  titulo = "Papelaria criativa para alegrar sua rotina",
  indice,
  total,
}: {
  produtos: VarejoProduct[];
  titulo?: string;
  indice?: number;
  total?: number;
}) {
  const trilhoRef = useRef<HTMLDivElement | null>(null);

  function rolar(direcao: 1 | -1) {
    const el = trilhoRef.current;
    if (!el) return;
    el.scrollBy({ left: direcao * Math.min(el.clientWidth * 0.9, 600), behavior: "smooth" });
  }

  return (
    <section className="tech-band" style={{ padding: "40px 0 72px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          {indice && total && (
            <div className="tech-label" style={{ justifyContent: "center" }}>
              Setor {String(indice).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </div>
          )}
          <h2 className="script-heading" style={{ fontSize: 40, margin: "0 auto", maxWidth: "none", whiteSpace: "nowrap" }}>
            {titulo}
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
