"use client";

/*
  © 2026 Upward Creative Academy. Todos os direitos reservados.
  LICENÇA DE USO: liberado para usar em projetos seus e de clientes.
  É proibido revender, redistribuir, compartilhar ou publicar este código (original ou modificado)
  como template, kit, curso ou produto.

  Base: FAQ Cartas Empilhadas (upw:upw1ef9b1f5c6a7), adaptado para a vitrine de vidro do Hero.
  Cada carta é um produto real. A carta de cima vira ao clique e mostra a descrição.
  Arraste para os lados, use as setas ou o teclado para trocar. Passa sozinha a cada 6 s.
*/

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import type { VarejoProduct } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";
import { ProductActions } from "@/components/produtos/ProductActions";

const INTERVALO_MS = 6000;
const LIMIAR_PX = 90;
const SAIDA_MS = 340;
const LARGURA = 340;
const ALTURA = 592;
const INTERATIVOS = "button, a, input, select, textarea";

// Posição de cada carta na pilha: [x, y, giro, escala]. A carta 0 é a de cima.
const PILHA: [number, number, number, number][] = [
  [0, 0, 0, 1],
  [0, 14, -4, 0.96],
  [0, 26, 3, 0.92],
];

const CSS = `
@keyframes upw-hero-sai {
  from { transform: translate3d(var(--x0), 0, 0) rotate(var(--r0)); }
  to { transform: translate3d(calc(var(--dir) * 140%), -40px, 0) rotate(calc(var(--dir) * 24deg)); opacity: 0; }
}
@keyframes upw-hero-entra {
  from { transform: translate3d(-140%, -40px, 0) rotate(-24deg); opacity: 0; }
  to { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .upw-hero-carta { transition: none !important; }
  .upw-hero-virar { transition: none !important; }
  .upw-hero-saida { animation: none !important; opacity: 0 !important; }
  .upw-hero-entrada { animation: none !important; }
}
`;

type Saida = { chave: number; produto: VarejoProduct; dir: 1 | -1; x0: number };
type Entrada = { chave: number; id: string };

const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Vitrine do Hero: quadro de vidro com cartas de produto empilhadas.
// A ordem chega pronta da home: 1o produto de cada setor, depois o 2o, etc.
export function HeroVitrine({ produtos }: { produtos: VarejoProduct[] }) {
  const total = produtos.length;
  const [inicio, setInicio] = useState(0);
  const [virada, setVirada] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [dx, setDx] = useState(0);
  const [saida, setSaida] = useState<Saida | null>(null);
  const [entrada, setEntrada] = useState<Entrada | null>(null);
  const gesto = useRef<{ id: number; x0: number; moveu: boolean } | null>(null);
  const moveuRef = useRef(false);
  const sequencia = useRef(0);

  // carta de cima sai pela direita (setas) ou pelo lado do arraste; vai para o fim do monte
  // x0 = onde a carta estava no momento do arraste; a saída começa dali
  const proxima = useCallback(
    (dir: 1 | -1, x0 = 0) => {
      if (total < 2) return;
      sequencia.current += 1;
      setSaida({ chave: sequencia.current, produto: produtos[inicio % total], dir, x0 });
      setEntrada(null);
      setVirada(false);
      setInicio((inicio + 1) % total);
    },
    [inicio, produtos, total],
  );

  // a última carta do fundo volta para cima
  const anterior = useCallback(() => {
    if (total < 2) return;
    const anteriorIdx = (inicio - 1 + total) % total;
    sequencia.current += 1;
    setVirada(false);
    setEntrada({ chave: sequencia.current, id: produtos[anteriorIdx].id });
    setInicio(anteriorIdx);
  }, [inicio, produtos, total]);

  // troca automática: pausa com o mouse em cima, com a carta virada ou durante o arraste
  useEffect(() => {
    if (total < 2 || pausado || virada || arrastando) return;
    const t = window.setInterval(() => proxima(1), INTERVALO_MS);
    return () => window.clearInterval(t);
  }, [total, pausado, virada, arrastando, proxima]);

  // remove a carta que saiu depois da animação
  useEffect(() => {
    if (!saida) return;
    const t = window.setTimeout(() => setSaida(null), SAIDA_MS);
    return () => window.clearTimeout(t);
  }, [saida]);

  function aoApertar(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest(INTERATIVOS)) return;
    gesto.current = { id: e.pointerId, x0: e.clientX, moveu: false };
    moveuRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function aoMover(e: PointerEvent<HTMLDivElement>) {
    const g = gesto.current;
    if (!g || e.pointerId !== g.id) return;
    const d = e.clientX - g.x0;
    if (!g.moveu && Math.abs(d) < 6) return;
    if (!g.moveu) {
      g.moveu = true;
      moveuRef.current = true;
      setArrastando(true);
    }
    setDx(d);
  }

  function aoSoltar(e: PointerEvent<HTMLDivElement>, cancelado = false) {
    const g = gesto.current;
    if (!g || e.pointerId !== g.id) return;
    gesto.current = null;
    const d = e.clientX - g.x0;
    setArrastando(false);
    setDx(0);
    if (!cancelado && g.moveu && Math.abs(d) > LIMIAR_PX) proxima(d < 0 ? -1 : 1, d);
  }

  // clique na carta de cima vira a carta (ignora cliques em botões e links e o fim de um arraste)
  function aoClicar(e: MouseEvent<HTMLDivElement>) {
    if (moveuRef.current) {
      moveuRef.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest(INTERATIVOS)) return;
    setVirada((v) => !v);
  }

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      proxima(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      anterior();
    } else if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
      e.preventDefault();
      setVirada((v) => !v);
    }
  }

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

  const n = Math.min(3, total);
  const cartas = Array.from({ length: n }, (_, d) => ({ d, produto: produtos[(inicio + d) % total] }));
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
  const estiloCarta: CSSProperties = { position: "absolute", left: 0, top: 0, width: LARGURA, height: ALTURA };

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
      <style>{CSS}</style>
      <div
        role="region"
        aria-label="Vitrine de produtos"
        tabIndex={0}
        onKeyDown={aoTeclar}
        style={{ position: "relative", width: LARGURA, height: ALTURA, margin: "0 auto", outline: "none" }}
      >
        {saida && (
          <div
            key={`saida-${saida.chave}`}
            className="upw-hero-saida"
            aria-hidden="true"
            style={
              {
                ...estiloCarta,
                zIndex: 30,
                pointerEvents: "none",
                animation: `upw-hero-sai ${SAIDA_MS}ms ease-in forwards`,
                "--dir": String(saida.dir),
                "--x0": `${saida.x0}px`,
                "--r0": `${saida.x0 / 18}deg`,
              } as CSSProperties
            }
          >
            <ProductCard produto={saida.produto} grande />
          </div>
        )}

        {cartas
          .slice()
          .reverse()
          .map(({ d, produto }) => {
            const eTopo = d === 0;
            const entrando = eTopo && entrada !== null && entrada.id === produto.id;
            const [px, py, giro, escala] = PILHA[d];
            const transform = eTopo
              ? `translate3d(${dx}px, 0, 0) rotate(${dx / 18}deg)`
              : `translate3d(${px}px, ${py}px, 0) rotate(${giro}deg) scale(${escala})`;
            return (
              <div
                key={produto.id}
                className="upw-hero-carta"
                aria-hidden={!eTopo}
                onPointerDown={eTopo ? aoApertar : undefined}
                onPointerMove={eTopo ? aoMover : undefined}
                onPointerUp={eTopo ? (e) => aoSoltar(e) : undefined}
                onPointerCancel={eTopo ? (e) => aoSoltar(e, true) : undefined}
                onClick={eTopo ? aoClicar : undefined}
                style={{
                  ...estiloCarta,
                  zIndex: n - d,
                  transform,
                  transition: eTopo && arrastando ? "none" : "transform .45s cubic-bezier(.3,1.25,.5,1)",
                  animation: entrando ? "upw-hero-entra .42s ease-out" : undefined,
                  cursor: eTopo ? (arrastando ? "grabbing" : "grab") : "default",
                  touchAction: "pan-y",
                  pointerEvents: eTopo ? "auto" : "none",
                  userSelect: "none",
                }}
              >
                <div
                  className="upw-hero-virar"
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    transformStyle: "preserve-3d",
                    transition: "transform .6s cubic-bezier(.3,1.2,.5,1)",
                    transform: eTopo && virada ? "rotateY(180deg)" : "rotateY(0deg)",
                  }}
                >
                  <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}>
                    <ProductCard produto={produto} grande />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      transform: "rotateY(180deg)",
                      backfaceVisibility: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      padding: 20,
                      minWidth: 0,
                      overflow: "hidden",
                      borderRadius: "var(--radius-card)",
                      border: "1px solid rgba(255,255,255,0.55)",
                      background: "rgba(255,255,255,0.22)",
                      backdropFilter: "blur(16px)",
                      WebkitBackdropFilter: "blur(16px)",
                      boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
                      color: "#000000",
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      {produto.category ?? "Produto"}
                    </span>
                    <h3
                      style={{
                        margin: "10px 0 0",
                        fontSize: 22,
                        lineHeight: 1.15,
                        fontWeight: 800,
                        color: "#000000",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {produto.name}
                    </h3>
                    <p
                      style={{
                        margin: "16px 0 0",
                        fontSize: 16,
                        lineHeight: 1.5,
                        fontWeight: 700,
                        color: "#000000",
                        overflowWrap: "anywhere",
                        display: "-webkit-box",
                        WebkitLineClamp: 8,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {produto.description ?? "Descrição em breve."}
                    </p>
                    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, whiteSpace: "nowrap" }}>{moeda(produto.price)}</span>
                      <ProductActions produto={produto} grande somenteBotoes />
                      <span style={{ flex: 1 }} />
                      <button
                        type="button"
                        onClick={() => setVirada(false)}
                        style={{ ...botao, width: "auto", padding: "0 14px", fontSize: 13, fontWeight: 700 }}
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <button type="button" aria-label="Produto anterior" onClick={anterior} style={botao}>
          ‹
        </button>
        <span
          style={{
            fontFamily: "ui-monospace, Consolas, monospace",
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "0.04em",
            color: "#000000",
            whiteSpace: "nowrap",
          }}
        >
          {String((inicio % total) + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setVirada((v) => !v)}
          aria-label={virada ? "Voltar para a foto do produto" : "Ver detalhes do produto"}
          style={{
            height: 36,
            padding: "0 14px",
            borderRadius: 999,
            border: "1px solid rgba(16,13,13,0.35)",
            background: "#FFFFFF",
            color: "#000000",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {virada ? "Ver foto" : "Ver detalhes"}
        </button>
        <button type="button" aria-label="Próximo produto" onClick={() => proxima(1)} style={botao}>
          ›
        </button>
      </div>
    </div>
  );
}
