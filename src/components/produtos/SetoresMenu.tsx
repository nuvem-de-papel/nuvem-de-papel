"use client";

import { useEffect, useRef, useState } from "react";
import { IconeGrupo } from "@/components/catalogo/IconeGrupo";

// Menu "Todas as Categorias" (0057 - 18/11/2026): botao que abre a lista
// preta dos grupos com icone de linha fina (artefato aprovado pelo Joaquim).
// Clicar no grupo rola ate a secao dele em /produtos.

// Rolagem animada ate o grupo: duracao proporcional a distancia, entre 600 e 1100 ms.
const DURACAO_MIN = 600;
const DURACAO_MAX = 1100;
const MS_POR_PX = 0.45;

type ItemMenu = { slug: string; titulo: string; icone: string };

export function SetoresMenu({ itens, offsetTopo = 137 }: { itens: ItemMenu[]; offsetTopo?: number }) {
  const pararRef = useRef<(() => void) | null>(null);
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => () => pararRef.current?.(), []);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  function irPara(slug: string) {
    setAberto(false);
    const el = document.getElementById(slug);
    if (!el) return;
    pararRef.current?.();

    const inicio = window.scrollY;
    const alvo = Math.max(0, el.getBoundingClientRect().top + inicio - offsetTopo);
    const distancia = alvo - inicio;
    const duracao = Math.min(DURACAO_MAX, Math.max(DURACAO_MIN, Math.abs(distancia) * MS_POR_PX));

    let frame = 0;
    let t0 = 0;
    const parar = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", parar);
      window.removeEventListener("touchstart", parar);
      window.removeEventListener("keydown", parar);
      pararRef.current = null;
    };
    const passo = (agora: number) => {
      if (!t0) t0 = agora;
      const p = Math.min(1, (agora - t0) / duracao);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      window.scrollTo({ top: inicio + distancia * e, behavior: "instant" as ScrollBehavior });
      if (p < 1) frame = requestAnimationFrame(passo);
      else parar();
    };

    // rolagem manual do usuario cancela a animacao
    window.addEventListener("wheel", parar, { passive: true });
    window.addEventListener("touchstart", parar, { passive: true });
    window.addEventListener("keydown", parar);
    pararRef.current = parar;
    frame = requestAnimationFrame(passo);
    history.replaceState(null, "", `#${slug}`);
  }

  if (itens.length === 0) return null;

  return (
    <div ref={caixaRef} className="menu-categorias">
      <button
        type="button"
        className="menu-categorias-botao"
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-controls="menu-categorias-lista"
        onClick={() => setAberto((v) => !v)}
      >
        <IconeGrupo icone="menu" tamanho={20} />
        <span>Todas as Categorias</span>
        <span aria-hidden="true" className="menu-categorias-seta">
          ›
        </span>
      </button>
      {aberto && (
        <nav id="menu-categorias-lista" aria-label="Categorias" className="menu-categorias-lista">
          <ul>
            {itens.map((s) => (
              <li key={s.slug}>
                <a
                  href={`#${s.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    irPara(s.slug);
                  }}
                >
                  <IconeGrupo icone={s.icone} tamanho={20} />
                  {s.titulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
