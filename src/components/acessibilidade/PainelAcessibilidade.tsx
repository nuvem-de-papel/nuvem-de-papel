"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  CHAVE_A11Y,
  EVENTO_A11Y,
  PREFS_PADRAO,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_PASSO,
  aplicarPrefs,
  ehPadrao,
  lerPrefs,
  limitarZoom,
  type ChaveBool,
  type PrefsA11y,
} from "@/lib/acessibilidade";

// Painel proprio de acessibilidade (padrao comum 20/11/2026, ver
// I:\Projetos\_libras\PADRAO-ACESSIBILIDADE-VLIBRAS.md): fonte, espacamento,
// contraste, links, guia de leitura e pausa de animacoes. Desde 21/11/2026 o
// botao mora na barra do topo (Header.tsx), ao lado do botao do VLibras. O
// painel e a guia de leitura vao por portal para o <body>: o .site-header tem
// backdrop-filter, que prenderia o position:fixed dentro da barra, e o zoom de
// fonte nao pode empurrar o painel para fora da tela. Preferencias so no
// localStorage; o script do <head> (SCRIPT_PREFS_A11Y) aplica antes da
// primeira pintura e este componente so sincroniza.

const ALTERNAR: { chave: ChaveBool; rotulo: string }[] = [
  { chave: "espacoLinhas", rotulo: "Espaçamento entre linhas" },
  { chave: "contraste", rotulo: "Alto contraste" },
  { chave: "destacarLinks", rotulo: "Destacar links" },
  { chave: "guiaLeitura", rotulo: "Guia de leitura" },
  { chave: "semAnimacao", rotulo: "Pausar animações" },
];

function salvar(p: PrefsA11y) {
  try {
    if (ehPadrao(p)) localStorage.removeItem(CHAVE_A11Y);
    else localStorage.setItem(CHAVE_A11Y, JSON.stringify(p));
  } catch {
    /* modo privado / storage bloqueado: vale so nesta pagina */
  }
}

export function PainelAcessibilidade() {
  const [aberto, setAberto] = useState(false);
  const [prefs, setPrefs] = useState<PrefsA11y>(PREFS_PADRAO);
  const [carregado, setCarregado] = useState(false);
  const botaoRef = useRef<HTMLButtonElement | null>(null);
  const painelRef = useRef<HTMLElement | null>(null);
  const guiaRef = useRef<HTMLDivElement | null>(null);
  const [posicao, setPosicao] = useState<CSSProperties>({});

  // painel fixo logo abaixo do botao, alinhado pela direita
  useEffect(() => {
    if (!aberto) return;
    const medir = () => {
      const r = botaoRef.current?.getBoundingClientRect();
      if (!r) return;
      setPosicao({ top: Math.round(r.bottom + 8), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, { passive: true });
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir);
    };
  }, [aberto, prefs.zoom]);

  // carrega o que o script do <head> ja aplicou
  useEffect(() => {
    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem(CHAVE_A11Y);
    } catch {
      /* sem storage */
    }
    setPrefs(lerPrefs(salvo));
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (!carregado) return;
    aplicarPrefs(prefs, document.documentElement);
    salvar(prefs);
    window.dispatchEvent(new Event(EVENTO_A11Y));
  }, [prefs, carregado]);

  // Esc fecha e devolve o foco ao botao; clique fora fecha
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botaoRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (painelRef.current?.contains(alvo) || botaoRef.current?.contains(alvo)) return;
      setAberto(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [aberto]);

  // guia de leitura: faixa que acompanha o ponteiro
  useEffect(() => {
    if (!prefs.guiaLeitura) return;
    let raf = 0;
    let y = window.innerHeight / 2;
    const pintar = () => {
      raf = 0;
      if (guiaRef.current) guiaRef.current.style.transform = `translateY(${Math.round(y - 14)}px)`;
    };
    const mover = (e: PointerEvent) => {
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(pintar);
    };
    pintar();
    window.addEventListener("pointermove", mover, { passive: true });
    return () => {
      window.removeEventListener("pointermove", mover);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [prefs.guiaLeitura]);

  const mudarZoom = (delta: number) => setPrefs((p) => ({ ...p, zoom: limitarZoom(p.zoom + delta) }));
  const alternar = (k: ChaveBool) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="a11y-raiz">
      <button
        ref={botaoRef}
        type="button"
        className="a11y-botao"
        aria-label="Acessibilidade"
        aria-expanded={aberto}
        aria-controls="a11y-painel"
        onClick={() => setAberto((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="4" r="2" />
          <path d="M4 8l8 1.5L20 8" />
          <path d="M12 9.5V14" />
          <path d="M8.5 21l3.5-7 3.5 7" />
        </svg>
      </button>

      {carregado && createPortal(
        <div className="a11y-raiz a11y-camada">
      {aberto && (
        <section ref={painelRef} id="a11y-painel" className="a11y-painel" style={posicao} aria-label="Opções de acessibilidade">
          <h2 className="a11y-titulo">Acessibilidade</h2>

          <div className="a11y-linha" role="group" aria-label="Tamanho do texto">
            <button type="button" onClick={() => mudarZoom(-ZOOM_PASSO)} disabled={prefs.zoom <= ZOOM_MIN} aria-label="Diminuir texto">
              A−
            </button>
            <output aria-live="polite" aria-label="Tamanho atual do texto">
              {prefs.zoom}%
            </output>
            <button type="button" onClick={() => mudarZoom(ZOOM_PASSO)} disabled={prefs.zoom >= ZOOM_MAX} aria-label="Aumentar texto">
              A+
            </button>
          </div>

          {ALTERNAR.map(({ chave, rotulo }) => (
            <button key={chave} type="button" className="a11y-alternar" aria-pressed={prefs[chave]} onClick={() => alternar(chave)}>
              <span>{rotulo}</span>
              <span className="a11y-estado" aria-hidden="true">
                {prefs[chave] ? "ligado" : "desligado"}
              </span>
            </button>
          ))}

          <button type="button" className="a11y-restaurar" onClick={() => setPrefs({ ...PREFS_PADRAO })} disabled={ehPadrao(prefs)}>
            Restaurar padrão
          </button>
          <p className="a11y-nota">Libras: use o botão Libras ao lado, na barra do topo.</p>
          <p className="a11y-nota">
            <a href="/como-navegar">Como navegar no site</a>
          </p>
        </section>
      )}

      {prefs.guiaLeitura && <div ref={guiaRef} className="a11y-guia-barra" aria-hidden="true" />}
        </div>,
        document.body
      )}
    </div>
  );
}
