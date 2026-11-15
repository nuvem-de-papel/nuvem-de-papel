"use client";

import { useEffect, useRef } from "react";

// Rolagem animada ate o setor: duracao proporcional a distancia, entre 600 e 1100 ms.
const DURACAO_MIN = 600;
const DURACAO_MAX = 1100;
const MS_POR_PX = 0.45;

type Setor = { slug: string; titulo: string };

export function SetoresMenu({ itens, offsetTopo = 137 }: { itens: Setor[]; offsetTopo?: number }) {
  const pararRef = useRef<(() => void) | null>(null);

  useEffect(() => () => pararRef.current?.(), []);

  function irPara(slug: string) {
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

  return (
    <nav aria-label="Setores" style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", alignItems: "center", justifyContent: "center", flex: 1 }}>
      {itens.map((s) => (
        <a
          key={s.slug}
          href={`#${s.slug}`}
          onClick={(e) => {
            e.preventDefault();
            irPara(s.slug);
          }}
          style={{ fontSize: 16, fontWeight: 600, color: "#000000", textDecoration: "none", textTransform: "uppercase", letterSpacing: 0.3 }}
        >
          {s.titulo}
        </a>
      ))}
    </nav>
  );
}
