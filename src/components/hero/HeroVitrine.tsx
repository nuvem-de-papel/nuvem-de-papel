"use client";

import { useEffect, useState } from "react";
import type { VarejoProduct } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

// Vitrine do Hero: quadro de vidro com o card real do produto (mesma medida
// do card da home). Passa sozinho em loop; pausa com o mouse em cima.
// A ordem chega pronta da home: 1o produto de cada setor, depois o 2o, etc.
export function HeroVitrine({ produtos }: { produtos: VarejoProduct[] }) {
  const [i, setI] = useState(0);
  const [pausado, setPausado] = useState(false);
  const total = produtos.length;

  useEffect(() => {
    if (total < 2 || pausado) return;
    const t = window.setInterval(() => setI((atual) => (atual + 1) % total), 3500);
    return () => window.clearInterval(t);
  }, [total, pausado]);

  if (total === 0) {
    return (
      <div
        style={{
          width: 360,
          height: 400,
          borderRadius: "var(--radius-card)",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
        }}
      />
    );
  }

  const atual = produtos[i % total];
  const andar = (d: number) => setI((antes) => (antes + d + total) % total);
  const botao = {
    width: 36,
    height: 36,
    borderRadius: 999,
    border: "1px solid rgba(16,13,13,0.35)",
    background: "#FFFFFF",
    color: "#100D0D",
    fontSize: 18,
    cursor: "pointer",
  } as const;

  return (
    <div
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      style={{
        width: 360,
        height: 660,
        padding: 10,
        borderRadius: "var(--radius-card)",
        background: "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.22)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
      }}
    >
      <div key={atual.id} style={{ width: 340, height: 592, margin: "0 auto" }}>
        <ProductCard produto={atual} grande />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
        <button type="button" aria-label="Produto anterior" onClick={() => andar(-1)} style={botao}>
          ‹
        </button>
        <span
          style={{
            fontFamily: "ui-monospace, Consolas, monospace",
            fontSize: 11,
            letterSpacing: "0.12em",
            color: "#000000",
          }}
        >
          {String((i % total) + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
        <button type="button" aria-label="Próximo produto" onClick={() => andar(1)} style={botao}>
          ›
        </button>
      </div>
    </div>
  );
}
