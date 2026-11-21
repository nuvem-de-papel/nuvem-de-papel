"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSemAnimacao } from "@/components/acessibilidade/useSemAnimacao";
import type { VarejoProduct } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";
import { IconeGrupo } from "@/components/catalogo/IconeGrupo";

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
  icone,
}: {
  /** icone do setor/grupo antes do titulo (chave de ICONES_GRUPO) */
  icone?: string;
  title: string;
  products: VarejoProduct[];
  /** cor do setor (paleta). Sem cor = navy da marca. */
  cor?: string;
  /** cor do titulo (padrao = cor do setor; titulo, setas e vidro usam a mesma) */
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
  const semAnimacao = useSemAnimacao();
  // 21/11/2026: titulo, icone, setas e vidro na MESMA cor (a do setor).
  // Sem cor (Lancamentos, Destaques, Ofertas, Combina com) = navy da marca.
  const tom = corTitulo ?? cor ?? "#073B4C";
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
      // 19/11/2026 (pedido do Joaquim): no maximo 5 cards inteiros por tela (a faixa
      // do 6o virou margem lateral com fundo - .faixa-carrossel);
      // abaixo disso, quantos couberem com a largura base.
      const n = Math.min(5, Math.max(1, Math.floor((W + GAP) / (BASE * 0.7 + GAP))));
      const w = (W - (n - 1) * GAP) / n;
      setEncaixe({ n, w });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(track);
    return () => ro.disconnect();
  }, [encaixar, lista.length]);

  // 21/11/2026 (pedido do Joaquim): rolagem ~2x mais lenta que o "smooth"
  // nativo e em CIRCULO. Chegando ao fim, os cards que ja sairam pela esquerda
  // passam para o fim da fila (sem mexer no que esta na tela) e a rolagem
  // continua: depois do ultimo vem o primeiro. Para a esquerda, o mesmo ao
  // contrario. Nunca volta tudo de uma vez. Cada produto continua aparecendo
  // uma vez so no DOM (sem clones - os E2E acham o card pelo link).
  const DURACAO_MS = 900;
  const [giro, setGiro] = useState(0); // indice de `lista` que aparece primeiro
  const animandoRef = useRef(false);
  const rafRef = useRef(0);
  const pendenteRef = useRef<{ ajuste: number; dir: 1 | -1 } | null>(null);
  const exibidos = lista.length > 1 && giro % lista.length ? [...lista.slice(giro % lista.length), ...lista.slice(0, giro % lista.length)] : lista;

  const larguraItem = (t: HTMLDivElement) => {
    const a = t.children[0] as HTMLElement | undefined;
    const b = t.children[1] as HTMLElement | undefined;
    return a && b ? b.offsetLeft - a.offsetLeft : a ? a.offsetWidth + GAP : 0;
  };
  const passoDe = (t: HTMLDivElement) => (encaixar && encaixe ? encaixe.n * (encaixe.w + GAP) : Math.max(larguraItem(t), 520));

  const animar = (t: HTMLDivElement, destino: number) => {
    const max = t.scrollWidth - t.clientWidth;
    const fim = Math.max(0, Math.min(max, destino));
    const inicio = t.scrollLeft;
    cancelAnimationFrame(rafRef.current);
    if (semAnimacao || Math.abs(fim - inicio) < 1) {
      t.scrollLeft = fim;
      animandoRef.current = false;
      return;
    }
    animandoRef.current = true;
    t.style.scrollSnapType = "none";
    const t0 = performance.now();
    const quadro = (agora: number) => {
      const p = Math.min(1, (agora - t0) / DURACAO_MS);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // ease-in-out
      t.scrollLeft = inicio + (fim - inicio) * e;
      if (p < 1) rafRef.current = requestAnimationFrame(quadro);
      else {
        t.style.scrollSnapType = "";
        animandoRef.current = false;
      }
    };
    rafRef.current = requestAnimationFrame(quadro);
  };

  const scroll = (dir: 1 | -1) => {
    const t = trackRef.current;
    if (!t || animandoRef.current) return;
    const L = exibidos.length;
    const item = larguraItem(t);
    const passo = passoDe(t);
    const max = t.scrollWidth - t.clientWidth;
    if (max <= 2 || item <= 0 || L < 2) return; // tudo cabe na tela
    const pos = t.scrollLeft;
    if (dir === 1 && max - pos < passo - 2) {
      // fim da fila: cards escondidos a esquerda vao para o fim
      const falta = Math.ceil((passo - (max - pos)) / item);
      const k = Math.min(falta, Math.floor((pos + 2) / item));
      if (k > 0) {
        animandoRef.current = true;
        pendenteRef.current = { ajuste: -k * item, dir };
        setGiro((g) => (g + k) % L);
        return;
      }
    }
    if (dir === -1 && pos < passo - 2) {
      // inicio da fila: cards escondidos a direita vem para a frente
      const falta = Math.ceil((passo - pos) / item);
      const k = Math.min(falta, Math.floor((max - pos + 2) / item));
      if (k > 0) {
        animandoRef.current = true;
        pendenteRef.current = { ajuste: k * item, dir };
        setGiro((g) => (g - k + L * 2) % L);
        return;
      }
    }
    animar(t, pos + dir * passo);
  };

  // depois de girar a fila: compensa a posicao (a tela nao pisca) e anima
  useLayoutEffect(() => {
    const p = pendenteRef.current;
    const t = trackRef.current;
    if (!p || !t) return;
    pendenteRef.current = null;
    t.style.scrollSnapType = "none";
    t.scrollLeft = t.scrollLeft + p.ajuste;
    animar(t, t.scrollLeft + p.dir * passoDe(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giro]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
  useEffect(() => {
    if (!autoPlayMs || pausado || semAnimacao || lista.length <= 1) return;
    const id = window.setInterval(() => scrollRef.current(1), autoPlayMs);
    return () => window.clearInterval(id);
  }, [autoPlayMs, pausado, semAnimacao, lista.length]);

  return (
    <section
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      style={{
        // 20/11/2026: vidro no tom do setor (cor translucida + blur)
        background: `color-mix(in srgb, ${tom} ${Math.max(intensidadeCor * 2.4, 22)}%, transparent)`,
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.55)",
        boxShadow: "0 8px 28px rgba(7,59,76,0.10)",
        borderRadius: 18,
        padding: "22px 24px 14px",
        marginBottom: 18,
      }}
      className="carrossel-caixa"
    >
      <div className="carrossel-topo" style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 14px" }}>
        <h2 className="display" style={{ fontSize: 21, margin: 0, color: tom, display: "flex", alignItems: "center", gap: 8 }}>
          {icone && <IconeGrupo icone={icone} tamanho={22} />}
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
        <div className="carrossel-busca" style={{ position: "relative", flexShrink: 0, width: 320 }}>
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
            onChange={(e) => {
              setBusca(e.target.value);
              setGiro(0);
            }}
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
              background: tom,
              color: "#FFFFFF",
              fontSize: 20,
              cursor: "pointer",
              boxShadow: `0 4px 14px color-mix(in srgb, ${tom} 35%, transparent)`,
              zIndex: 5,
            }}
          >
            ‹
          </button>

          <div ref={trackRef} className="carousel-track">
            {exibidos.map((p) => (
              <div key={p.id} className="carousel-item" style={encaixar && encaixe ? { flex: `0 0 ${encaixe.w}px`, minWidth: 0, maxWidth: encaixe.w } : undefined}>
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
              background: tom,
              color: "#FFFFFF",
              fontSize: 20,
              cursor: "pointer",
              boxShadow: `0 4px 14px color-mix(in srgb, ${tom} 35%, transparent)`,
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
