"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { VarejoProduct } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

// Secao de setor em /produtos. Cards iguais aos da home: ProductCard dentro
// de .carousel-item (mesma classe e mesmo tamanho). So o cabecalho rosa muda.
export function CategoryCarousel({
  title,
  products,
  cor,
  corTitulo,
  intensidadeCor = 18,
  encaixar = false,
  autoPlayMs = 0,
}: {
  title: string;
  products: VarejoProduct[];
  /** cor do setor (paleta). Sem cor = visual padrao rosa. */
  cor?: string;
  /** cor do titulo do setor, diferente do fundo */
  corTitulo?: string;
  /** % da cor do setor misturada ao branco (menor = mais claro) */
  intensidadeCor?: number;
  /** mostra so cards inteiros: a largura de cada um se ajusta ao espaco */
  encaixar?: boolean;
  /** rodizio automatico em ms (0 = desligado); pausa com o mouse em cima */
  autoPlayMs?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const GAP = 18;
  const BASE = 260;
  const [encaixe, setEncaixe] = useState<{ n: number; w: number } | null>(null);
  const [pausado, setPausado] = useState(false);
  const [busca, setBusca] = useState("");
  const normBusca = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const termo = normBusca(busca.trim());
  const lista = termo
    ? products.filter((p) => normBusca(p.name).includes(termo) || normBusca(p.sku).includes(termo))
    : products;

  useLayoutEffect(() => {
    if (!encaixar) return;
    const track = trackRef.current;
    if (!track) return;
    const medir = () => {
      const W = track.clientWidth - 4; // padding lateral do track (2px de cada lado)
      const n = Math.max(1, Math.floor((W + GAP) / (BASE + GAP)));
      const w = (W - (n - 1) * GAP) / n;
      setEncaixe({ n, w });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(track);
    return () => ro.disconnect();
  }, [encaixar, lista.length]);

  // Loop: no fim, a seta direita volta ao inicio; no inicio, a esquerda vai ao fim.
  const scroll = (dir: 1 | -1) => {
    const t = trackRef.current;
    if (!t) return;
    const passo = encaixar && encaixe ? encaixe.n * (encaixe.w + GAP) : 520;
    const max = t.scrollWidth - t.clientWidth;
    if (dir === 1 && t.scrollLeft >= max - 4) t.scrollTo({ left: 0, behavior: "smooth" });
    else if (dir === -1 && t.scrollLeft <= 4) t.scrollTo({ left: max, behavior: "smooth" });
    else t.scrollBy({ left: dir * passo, behavior: "smooth" });
  };

  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
  useEffect(() => {
    if (!autoPlayMs || pausado || lista.length <= 1) return;
    const id = window.setInterval(() => scrollRef.current(1), autoPlayMs);
    return () => window.clearInterval(id);
  }, [autoPlayMs, pausado, lista.length]);

  return (
    <section
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      style={{
        background: cor ? `color-mix(in srgb, ${cor} ${intensidadeCor}%, #FFFFFF)` : "var(--pink-100)",
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
        <span style={{ width: 24, height: 1, background: "#100D0D", flexShrink: 0 }} />
        <div style={{ position: "relative", flexShrink: 0, width: 320 }}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#100D0D"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nesta faixa"
            aria-label="Buscar nesta faixa"
            style={{
              width: "100%",
              height: 34,
              borderRadius: 999,
              border: "1px solid rgba(16,13,13,0.25)",
              background: "#FFFFFF",
              padding: "0 12px 0 34px",
              fontSize: 14,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>
        <span style={{ flex: 1, height: 1, background: "#100D0D" }} />
      </div>

      {lista.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 15, padding: "18px 0 8px" }}>
          {termo ? "Nenhum produto encontrado nesta faixa." : "Em breve, novidades nessa categoria."}
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
            {lista.map((p) => (
              <div key={p.id} className="carousel-item" style={encaixar && encaixe ? { flex: `0 0 ${encaixe.w}px` } : undefined}>
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
