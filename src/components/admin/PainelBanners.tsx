"use client";

import { useState } from "react";

// Destaques institucionais da home do painel (atalhos para os modulos com
// IA e loja): colapsaveis — o X some o card e "Mostrar destaques" traz
// todos de volta (persistencia nao vale o localStorage numa home de gestao).

const ICO = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const BANNERS = [
  {
    href: "/crm/marketing",
    tom: "a",
    titulo: "Campanhas de mensagens",
    texto: "Envie, engaje e comunique sua base de clientes",
    ico: (
      <>
        <path d="M3.5 10.5v3A1.5 1.5 0 0 0 5 15h2l7 4V5l-7 4H5a1.5 1.5 0 0 0-1.5 1.5z" />
        <path d="M17.5 8.5a5 5 0 0 1 0 7" />
      </>
    ),
  },
  {
    href: "/produtos",
    tom: "b",
    titulo: "Catálogo online no ar",
    texto: "Pedido pela loja sincronizado com o estoque",
    ico: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.8 3 2.8 15 0 18-2.8-3-2.8-15 0-18z" />
      </>
    ),
  },
  {
    href: "/crm/carta",
    tom: "c",
    titulo: "Carta de insights com IA",
    texto: "Analise do negócio em linguagem natural",
    ico: (
      <>
        <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
        <path d="M9.5 2.8v3.7M14.5 2.8v3.7M9.5 17.5v3.7M14.5 17.5v3.7M2.8 9.5h3.7M2.8 14.5h3.7M17.5 9.5h3.7M17.5 14.5h3.7" />
      </>
    ),
  },
] as const;

export function PainelBanners() {
  const [ocultos, setOcultos] = useState<number[]>([]);

  return (
    <section className="painel-banners" aria-label="Destaques do painel">
      {BANNERS.map((b, i) =>
        ocultos.includes(i) ? null : (
          <div key={b.href} className={`painel-banner painel-banner--${b.tom}`}>
            <span className="painel-ico painel-ico--claro">
              <svg {...ICO}>{b.ico}</svg>
            </span>
            <div>
              <a className="painel-banner-link" href={b.href}>
                {b.titulo}
              </a>
              <small>{b.texto}</small>
            </div>
            <button
              type="button"
              className="painel-banner-x"
              aria-label={`Ocultar destaque: ${b.titulo}`}
              onClick={() => setOcultos((v) => [...v, i])}
            >
              ×
            </button>
          </div>
        )
      )}
      {ocultos.length > 0 && (
        <button
          type="button"
          className="painel-banners-mostrar"
          onClick={() => setOcultos([])}
        >
          + Mostrar destaques
        </button>
      )}
    </section>
  );
}
