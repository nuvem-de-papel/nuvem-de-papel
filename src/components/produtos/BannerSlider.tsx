"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type Slide = {
  tag: string;
  title: string;
  text: string;
  bg: string;
  fg: string;
  tagBg: string;
  tagFg: string;
  icon: ReactNode;
};

const SLIDES: Slide[] = [
  {
    tag: "Frete grátis",
    title: "Entrega grátis acima de R$ 199",
    text: "Seus materiais favoritos direto para casa, sem custo de frete.",
    bg: "linear-gradient(120deg,#073B4C,#14607C)",
    fg: "#FFFFFF",
    tagBg: "#E084AC",
    tagFg: "#FFFFFF",
    icon: (
      <>
        <path d="M1.5 5h11v10H1.5z" />
        <path d="M12.5 8.5H17l3.5 3.5V15h-8z" />
        <circle cx="6" cy="17.5" r="2" />
        <circle cx="16.5" cy="17.5" r="2" />
        <line x1="3.5" y1="17.5" x2="4" y2="17.5" />
        <line x1="18.5" y1="17.5" x2="20" y2="17.5" />
      </>
    ),
  },
  {
    tag: "Clube",
    title: "Clube Nuvem de Papel",
    text: "Assinatura mensal com brindes, cupons e novidades em primeira mão.",
    bg: "linear-gradient(120deg,#E084AC,#D06A97)",
    fg: "#3A1526",
    tagBg: "#073B4C",
    tagFg: "#FFFFFF",
    icon: (
      <>
        <path d="M20 12v9H4v-9" />
        <rect x="2" y="7" width="20" height="5" />
        <line x1="12" y1="21" x2="12" y2="7" />
        <path d="M12 7a2.5 2.5 0 1 1 2.5-2.5A2.5 2.5 0 0 1 12 7Z" />
        <path d="M12 7a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 12 7Z" />
      </>
    ),
  },
  {
    tag: "Escolar 2027",
    title: "Coleção escolar completa",
    text: "Cadernos, canetas, mochilas e tudo para o ano letivo começar bem.",
    bg: "linear-gradient(120deg,#2C9C48,#8FC9B8)",
    fg: "#FFFFFF",
    tagBg: "#FFFFFF",
    tagFg: "#2C9C48",
    icon: (
      <>
        <path d="M6 10a6 6 0 0 1 12 0v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9z" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3" />
        <line x1="9.5" y1="15" x2="14.5" y2="15" />
      </>
    ),
  },
];

export function BannerSlider() {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <section style={{ position: "relative", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          transform: `translateX(-${slide * 100}%)`,
          transition: "transform .5s ease",
        }}
      >
        {SLIDES.map((s) => (
          <div
            key={s.tag}
            style={{
              minWidth: "100%",
              background: s.bg,
              color: s.fg,
              padding: "52px 0",
            }}
          >
            <div
              style={{
                maxWidth: 1240,
                margin: "0 auto",
                padding: "0 32px",
                display: "flex",
                alignItems: "center",
                gap: 28,
              }}
            >
              <svg
                width="72"
                height="72"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0, opacity: 0.85 }}
                aria-hidden="true"
              >
                {s.icon}
              </svg>
              <div>
                <span
                  style={{
                    display: "inline-block",
                    background: s.tagBg,
                    color: s.tagFg,
                    fontWeight: 700,
                    padding: "8px 18px",
                    borderRadius: 999,
                    fontSize: 13,
                    marginBottom: 10,
                  }}
                >
                  {s.tag}
                </span>
                <h2 className="display" style={{ fontSize: 30, margin: "0 0 6px", color: s.fg }}>
                  {s.title}
                </h2>
                <p style={{ margin: 0, opacity: 0.9, maxWidth: 520, fontSize: 15 }}>{s.text}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 8,
        }}
      >
        {SLIDES.map((s, i) => (
          <button
            key={s.tag}
            onClick={() => setSlide(i)}
            aria-label={`Ir para o slide ${i + 1}`}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              border: "none",
              padding: 0,
              background: i === slide ? "#E084AC" : "rgba(255,255,255,0.45)",
              cursor: "pointer",
            }}
          />
        ))}
      </div>
    </section>
  );
}
