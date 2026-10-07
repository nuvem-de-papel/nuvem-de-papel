/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

type IconDef = { match: RegExp; node: ReactNode };
type FotoDef = { match: RegExp; src: string; alt: string };

/* Fotos ilustrativas REAIS (Wikimedia Commons - licencas livres, credito em
 * public/produtos/CREDITS.md). A chave junta categoria + nome do produto;
 * nao achou a foto cai na padrao; arquivo faltando ou erro de carga cai no
 * placeholder SVG de sempre (o visual antigo, intacto). */
const FOTOS: FotoDef[] = [
  { match: /planner|agenda/, src: "/produtos/agenda.jpg", alt: "Agenda e planner com lápis" },
  { match: /caderno|fichari|bloco|bloqu/, src: "/produtos/caderno.jpg", alt: "Cadernos de espiral" },
  { match: /escolar|estojo|l[áa]pis|caneta|material|p[ée]ncil/, src: "/produtos/escolar.jpg", alt: "Lápis de cor em leque" },
  { match: /adesiv|criativ|papel|arma|cola|tesoura|artesan/, src: "/produtos/criativo.jpg", alt: "Adesivos coloridos" },
  { match: /presente|gift|acessor|caneca/, src: "/produtos/presente.jpg", alt: "Caneca de café sobre a mesa" },
];
const FOTO_PADRAO = { src: "/produtos/papelaria.jpg", alt: "Papelaria sobre a mesa" };

type IconDefList = IconDef[];

const ICONS: IconDefList = [
  {
    match: /caderno|agenda|planner|fichari|bloco|bloqu/,
    node: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="12" y1="8" x2="17" y2="8" />
        <line x1="12" y1="12" x2="17" y2="12" />
        <line x1="12" y1="16" x2="15" y2="16" />
      </>
    ),
  },
  {
    match: /escolar|l[áa]pis|caneta|material|p[ée]ncil/,
    node: (
      <>
        <path d="M4 20l4-1L20 7a2.12 2.12 0 0 0-3-3L5 16l-1 4z" />
        <line x1="14.5" y1="5.5" x2="18.5" y2="9.5" />
        <line x1="4" y1="20" x2="8" y2="19" />
      </>
    ),
  },
  {
    match: /criativ|adesiv|papel|arma|cola|tesoura|artesan/,
    node: (
      <>
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <line x1="20" y1="4" x2="8.12" y2="15.88" />
        <line x1="14.47" y1="14.48" x2="20" y2="20" />
        <line x1="8.12" y1="8.12" x2="12" y2="12" />
      </>
    ),
  },
  {
    match: /presente|gift|acessor/,
    node: (
      <>
        <path d="M20 12v9H4v-9" />
        <rect x="2" y="7" width="20" height="5" />
        <line x1="12" y1="21" x2="12" y2="7" />
        <path d="M12 7a2.5 2.5 0 1 1 2.5-2.5A2.5 2.5 0 0 1 12 7Z" />
        <path d="M12 7a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 12 7Z" />
      </>
    ),
  },
];

const DEFAULT_ICON: ReactNode = (
  <>
    <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
    <path d="M3 8l9 5 9-5" />
    <line x1="12" y1="13" x2="12" y2="21" />
  </>
);

export function ProductImage({
  category,
  name,
  style,
  iconSize = 64,
}: {
  category?: string | null;
  name?: string | null;
  style?: CSSProperties;
  iconSize?: number;
}) {
  const [falhou, setFalhou] = useState(false);
  const key = `${category ?? ""} ${name ?? ""}`.toLowerCase();
  const foto = FOTOS.find((f) => f.match.test(key)) ?? FOTO_PADRAO;
  const icon = ICONS.find((i) => i.match.test(key));

  return (
    <div
      style={{
        borderRadius: 10,
        background: "linear-gradient(145deg, #E6F0F4, #FFFFFF)",
        aspectRatio: "1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        ...style,
      }}
      aria-hidden={falhou ? "true" : undefined}
    >
      {falhou ? (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#B4D4E0"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon ? icon.node : DEFAULT_ICON}
        </svg>
      ) : (
        <img
          src={foto.src}
          alt={foto.alt}
          loading="lazy"
          onError={() => setFalhou(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
    </div>
  );
}
