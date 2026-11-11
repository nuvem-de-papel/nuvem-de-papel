"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { PROMO_ICONS } from "@/components/produtos/PromoStrip";

type Slide = {
  tag: string;
  title: string;
  text: string;
  bg: string;
  fg: string;
  tagBg: string;
  tagFg: string;
  icon: ReactNode;
  imagem: string;
};

const SLIDES: Slide[] = [
  {
    tag: "Frete grátis",
    title: "Entrega grátis acima de R$ 199",
    text: "Seus materiais favoritos direto para casa, sem custo de frete.",
    bg: "linear-gradient(120deg,#006BE1,#006BE1)",
    fg: "#FFFFFF",
    tagBg: "#FC99D3",
    tagFg: "#FFFFFF",
    icon: PROMO_ICONS.truck,
    imagem: "/banners/banner-frete.jpg",
  },
  {
    tag: "Clube",
    title: "Clube Nuvem de Papel",
    text: "Assinatura mensal com brindes, cupons e novidades em primeira mão.",
    bg: "linear-gradient(120deg,#FC99D3,#E9761C)",
    fg: "#3A1526",
    tagBg: "#006BE1",
    tagFg: "#FFFFFF",
    icon: PROMO_ICONS.gift,
    imagem: "/banners/banner-clube.jpg",
  },
  {
    tag: "Escolar 2027",
    title: "Coleção escolar completa",
    text: "Cadernos, canetas, mochilas e tudo para o ano letivo começar bem.",
    bg: "linear-gradient(120deg,#2C9C48,#8FC9B8)",
    fg: "#FFFFFF",
    tagBg: "#FFFFFF",
    tagFg: "#2C9C48",
    icon: PROMO_ICONS.backpack,
    imagem: "/banners/banner-escolar.jpg",
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
              padding: "52px 32px",
              borderRadius: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
              <img src={s.imagem} alt="" width={96} height={96} style={{ width: 96, height: 96, borderRadius: 18, objectFit: "cover", flexShrink: 0 }} />
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
              background: i === slide ? "#FC99D3" : "rgba(255,255,255,0.45)",
              cursor: "pointer",
            }}
          />
        ))}
      </div>
    </section>
  );
}
