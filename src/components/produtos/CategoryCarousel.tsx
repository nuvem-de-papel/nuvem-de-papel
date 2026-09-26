"use client";

import { useRef, useState } from "react";
import type { VarejoProduct } from "@/lib/products";
import { ProductImage } from "@/components/ProductImage";
import { useCart } from "@/components/carrinho/CartProvider";

function formatPrice(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function CategoryCarousel({ title, products }: { title: string; products: VarejoProduct[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { addItem } = useCart();
  const [adicionado, setAdicionado] = useState<string | null>(null);

  const scroll = (dir: 1 | -1) => {
    trackRef.current?.scrollBy({ left: dir * 520, behavior: "smooth" });
  };

  return (
    <section style={{ background: "var(--pink-100)", borderRadius: 18, padding: "22px 24px 14px", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 14px" }}>
        <h2 className="display" style={{ fontSize: 21, margin: 0, color: "var(--navy)" }}>
          {title}
        </h2>
        <span
          style={{
            background: "var(--pink-600)",
            color: "#FFFFFF",
            fontSize: 12,
            fontWeight: 700,
            padding: "5px 14px",
            borderRadius: 999,
          }}
        >
          Categoria
        </span>
        <span style={{ flex: 1, height: 2, background: "var(--pink-300)", borderRadius: 2 }} />
      </div>

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
            background: "var(--navy)",
            color: "#FFFFFF",
            fontSize: 20,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(7,59,76,0.3)",
            zIndex: 5,
          }}
        >
          ‹
        </button>

        <div
          ref={trackRef}
          style={{
            display: "flex",
            gap: 18,
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            padding: "4px 2px 14px",
            scrollbarWidth: "none",
          }}
        >
          {products.map((p) => (
            <div
              key={p.id}
              style={{
                minWidth: 236,
                maxWidth: 236,
                background: "#FFFFFF",
                border: "1px solid var(--border)",
                borderRadius: 14,
                overflow: "hidden",
                scrollSnapAlign: "start",
                boxShadow: "0 2px 8px rgba(7,59,76,0.06)",
              }}
            >
              <ProductImage category={p.category} style={{ borderRadius: 0, height: 150, aspectRatio: "auto" }} iconSize={54} />
              <div style={{ padding: "14px 16px 16px" }}>
                {p.category && (
                  <span
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--pink-600-dark)",
                      fontWeight: 700,
                    }}
                  >
                    {p.category}
                  </span>
                )}
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    margin: "5px 0 8px",
                    lineHeight: 1.3,
                    minHeight: "2.6em",
                    color: "var(--ink)",
                  }}
                >
                  {p.name}
                </div>
                <span className="display" style={{ fontWeight: 700, fontSize: 17, color: "var(--navy)" }}>
                  {formatPrice(p.price)}
                </span>
                <button
                  aria-label={
                    p.estoque === 0
                      ? `${p.name} esgotado`
                      : `Adicionar ${p.name}`
                  }
                  disabled={p.estoque === 0}
                  onClick={() => {
                    if (p.estoque === 0) return;
                    addItem({ id: p.id, sku: p.sku, name: p.name, price: p.price });
                    setAdicionado(p.id);
                    window.setTimeout(() => setAdicionado((atual) => (atual === p.id ? null : atual)), 1200);
                  }}
                  style={{
                    display: "block",
                    marginTop: 12,
                    background:
                      p.estoque === 0
                        ? "var(--ink-faint)"
                        : adicionado === p.id
                          ? "var(--blue-600)"
                          : "var(--pink-600)",
                    color: p.estoque === 0 ? "var(--ink-soft)" : "#FFFFFF",
                    border: "none",
                    width: "100%",
                    padding: 10,
                    borderRadius: 999,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: p.estoque === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {p.estoque === 0
                    ? "Esgotado"
                    : adicionado === p.id
                      ? "Adicionado ✓"
                      : "Adicionar"}
                </button>
                {p.estoque !== null && p.estoque > 0 && p.estoque <= 5 && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--blue-600)",
                    }}
                  >
                    Últimas {p.estoque} unidades
                  </div>
                )}
              </div>
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
            background: "var(--navy)",
            color: "#FFFFFF",
            fontSize: 20,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(7,59,76,0.3)",
            zIndex: 5,
          }}
        >
          ›
        </button>
      </div>
    </section>
  );
}
