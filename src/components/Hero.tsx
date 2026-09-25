"use client";

import { useEffect, useRef } from "react";

export function Hero() {
  const bgRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      if (bgRef.current) bgRef.current.style.transform = `translateY(${scrollY * 0.15}px)`;
      if (midRef.current) midRef.current.style.transform = `translateY(${scrollY * 0.35}px)`;
      if (fgRef.current) fgRef.current.style.transform = `translateY(${scrollY * 0.55}px)`;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "76px 32px 100px",
        background: "linear-gradient(180deg, #073B4C 0%, #0A4E63 40%, var(--bg-cotton) 100%)",
        minHeight: 560,
      }}
    >
      {/* CAMADA 1 — fundo: estantes de livraria (parallax lento) */}
      <div ref={bgRef} style={{ position: "absolute", inset: 0, willChange: "transform" }}>
        <svg width="100%" height="100%" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice" fill="none">
          {/* parede */}
          <rect width="1440" height="600" fill="#0A4E63" />
          {/* estante esquerda */}
          <rect x="40" y="80" width="220" height="440" rx="4" fill="#0D5268" />
          <rect x="50" y="90" width="200" height="80" rx="2" fill="#08414F" />
          <rect x="50" y="180" width="200" height="80" rx="2" fill="#08414F" />
          <rect x="50" y="270" width="200" height="80" rx="2" fill="#08414F" />
          <rect x="50" y="360" width="200" height="80" rx="2" fill="#08414F" />
          {/* livros estante esquerda */}
          {[0, 1, 2, 3].map((row) =>
            [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <rect key={`el-${row}-${i}`} x={56 + i * 24} y={94 + row * 90} width={18 + (i % 3) * 4} height={68 - (i % 2) * 10} rx={2} fill={["#E084AC", "#FFD166", "#8FC9B8", "#C4A8FF", "#F2B8CE", "#B4D4E0", "#F6C2A7", "#9B7FDE"][i % 8]} opacity={0.7} />
            ))
          )}
          {/* estante direita */}
          <rect x="1180" y="60" width="220" height="460" rx="4" fill="#0D5268" />
          <rect x="1190" y="70" width="200" height="85" rx="2" fill="#08414F" />
          <rect x="1190" y="165" width="200" height="85" rx="2" fill="#08414F" />
          <rect x="1190" y="260" width="200" height="85" rx="2" fill="#08414F" />
          <rect x="1190" y="355" width="200" height="85" rx="2" fill="#08414F" />
          {/* livros estante direita */}
          {[0, 1, 2, 3].map((row) =>
            [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <rect key={`ed-${row}-${i}`} x={1196 + i * 24} y={74 + row * 95} width={18 + ((i + row) % 3) * 4} height={73 - (i % 2) * 12} rx={2} fill={["#FFD166", "#E084AC", "#C4A8FF", "#8FC9B8", "#F6C2A7", "#F2B8CE", "#9B7FDE", "#B4D4E0"][(i + row) % 8]} opacity={0.7} />
            ))
          )}
          {/* estante central fundo */}
          <rect x="360" y="140" width="180" height="360" rx="4" fill="#0B4A5C" />
          <rect x="368" y="148" width="164" height="75" rx="2" fill="#083D4A" />
          <rect x="368" y="233" width="164" height="75" rx="2" fill="#083D4A" />
          <rect x="368" y="318" width="164" height="75" rx="2" fill="#083D4A" />
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3, 4, 5, 6].map((i) => (
              <rect key={`ec-${row}-${i}`} x={374 + i * 23} y={152 + row * 85} width={17 + (i % 3) * 4} height={63 - (i % 2) * 8} rx={2} fill={["#8FC9B8", "#FFD166", "#E084AC", "#B4D4E0", "#C4A8FF", "#F6C2A7", "#F2B8CE"][i % 7]} opacity={0.6} />
            ))
          )}
          <rect x="900" y="120" width="200" height="380" rx="4" fill="#0B4A5C" />
          <rect x="908" y="128" width="184" height="80" rx="2" fill="#083D4A" />
          <rect x="908" y="218" width="184" height="80" rx="2" fill="#083D4A" />
          <rect x="908" y="308" width="184" height="80" rx="2" fill="#083D4A" />
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <rect key={`ed2-${row}-${i}`} x={914 + i * 23} y={132 + row * 90} width={17 + ((i + row) % 3) * 4} height={68 - (i % 2) * 10} rx={2} fill={["#E084AC", "#C4A8FF", "#FFD166", "#8FC9B8", "#F2B8CE", "#B4D4E0", "#9B7FDE", "#F6C2A7"][(i + row) % 8]} opacity={0.6} />
            ))
          )}
          {/* chão */}
          <rect y="520" width="1440" height="80" fill="#062E3A" />
          <rect y="520" width="1440" height="3" fill="#0D5268" />
        </svg>
      </div>

      {/* CAMADA 2 — meio: pessoas silhueta + mesa de livros (parallax médio) */}
      <div ref={midRef} style={{ position: "absolute", inset: 0, willChange: "transform" }}>
        <svg width="100%" height="100%" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice" fill="none">
          {/* pessoa 1 — esquerda, olhando estante */}
          <g opacity="0.85">
            <ellipse cx="280" cy="440" rx="22" ry="55" fill="#062E3A" />
            <circle cx="280" cy="378" r="16" fill="#062E3A" />
            <rect x="268" y="490" width="10" height="40" rx="4" fill="#062E3A" />
            <rect x="284" y="490" width="10" height="40" rx="4" fill="#062E3A" />
          </g>
          {/* pessoa 2 — caminhando centro */}
          <g opacity="0.75">
            <ellipse cx="720" cy="435" rx="20" ry="52" fill="#062E3A" />
            <circle cx="720" cy="376" r="15" fill="#062E3A" />
            <rect x="709" y="482" width="9" height="42" rx="4" fill="#062E3A" />
            <rect x="724" y="482" width="9" height="42" rx="4" fill="#062E3A" />
            {/* braço com livro */}
            <rect x="738" y="415" width="28" height="6" rx="3" fill="#062E3A" />
            <rect x="760" y="405" width="14" height="22" rx="2" fill="#E084AC" opacity="0.6" />
          </g>
          {/* pessoa 3 — direita, lendo */}
          <g opacity="0.8">
            <ellipse cx="1100" cy="442" rx="21" ry="54" fill="#062E3A" />
            <circle cx="1100" cy="380" r="15" fill="#062E3A" />
            <rect x="1089" y="492" width="9" height="38" rx="4" fill="#062E3A" />
            <rect x="1104" y="492" width="9" height="38" rx="4" fill="#062E3A" />
            {/* livro na mão */}
            <rect x="1075" y="420" width="20" height="26" rx="2" fill="#FFD166" opacity="0.5" />
          </g>
          {/* pessoa 4 — pequena, fundo */}
          <g opacity="0.5">
            <ellipse cx="500" cy="450" rx="16" ry="42" fill="#062E3A" />
            <circle cx="500" cy="402" r="12" fill="#062E3A" />
            <rect x="492" y="488" width="7" height="34" rx="3" fill="#062E3A" />
            <rect x="504" y="488" width="7" height="34" rx="3" fill="#062E3A" />
          </g>
          {/* mesa central com pilha de livros */}
          <g opacity="0.7">
            <rect x="620" y="460" width="200" height="10" rx="3" fill="#0A4150" />
            <rect x="640" y="470" width="8" height="55" rx="3" fill="#0A4150" />
            <rect x="792" y="470" width="8" height="55" rx="3" fill="#0A4150" />
            {/* pilha de livros */}
            <rect x="660" y="448" width="50" height="12" rx="2" fill="#E084AC" opacity="0.65" />
            <rect x="655" y="436" width="56" height="12" rx="2" fill="#FFD166" opacity="0.65" />
            <rect x="662" y="424" width="48" height="12" rx="2" fill="#8FC9B8" opacity="0.65" />
            <rect x="730" y="448" width="45" height="12" rx="2" fill="#C4A8FF" opacity="0.6" />
            <rect x="726" y="436" width="50" height="12" rx="2" fill="#F2B8CE" opacity="0.6" />
          </g>
        </svg>
      </div>

      {/* CAMADA 3 — frente: partículas flutuantes (parallax rápido) */}
      <div ref={fgRef} style={{ position: "absolute", inset: 0, willChange: "transform", pointerEvents: "none" }}>
        <svg width="100%" height="100%" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice" fill="none">
          {/* partículas / poeira iluminada */}
          <circle cx="200" cy="200" r="3" fill="#FFD166" opacity="0.5" />
          <circle cx="450" cy="150" r="2" fill="#E084AC" opacity="0.4" />
          <circle cx="680" cy="250" r="2.5" fill="#FFD166" opacity="0.35" />
          <circle cx="900" cy="180" r="2" fill="#C4A8FF" opacity="0.4" />
          <circle cx="1100" cy="220" r="3" fill="#E084AC" opacity="0.3" />
          <circle cx="350" cy="320" r="1.5" fill="#FFD166" opacity="0.5" />
          <circle cx="1250" cy="300" r="2" fill="#8FC9B8" opacity="0.4" />
          <circle cx="150" cy="380" r="2" fill="#C4A8FF" opacity="0.3" />
          <circle cx="550" cy="100" r="2.5" fill="#FFD166" opacity="0.45" />
          <circle cx="1050" cy="120" r="1.5" fill="#E084AC" opacity="0.5" />
          {/* estrelas / brilhos */}
          <path d="M300 170l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#FFD166" opacity="0.3" />
          <path d="M850 140l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#E084AC" opacity="0.25" />
          <path d="M1200 190l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#C4A8FF" opacity="0.3" />
        </svg>
      </div>

      {/* CONTEÚDO — z-index acima do parallax */}
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 56,
          alignItems: "center",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              padding: "7px 16px",
              borderRadius: "var(--radius-chip)",
              fontSize: 13,
              fontWeight: 700,
              color: "#FFD166",
              backdropFilter: "blur(4px)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8Z" />
            </svg>
            Novidades toda semana
          </span>

          <h1
            className="display"
            style={{ fontSize: 53, lineHeight: 1.14, margin: "22px 0 18px", color: "#FFFFFF" }}
          >
            Sua papelaria favorita agora{" "}
            <span style={{ color: "#FFD166" }}>na nuvem</span>
          </h1>

          <p
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.75)",
              lineHeight: 1.6,
              maxWidth: 460,
              margin: "0 0 34px",
            }}
          >
            Produtos criativos e bem organizados para elevar sua rotina — do caderno
            perfeito aos acessórios certos para o seu dia a dia.
          </p>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <button
              style={{
                background: "var(--cta)",
                color: "#FFFFFF",
                padding: "16px 32px",
                borderRadius: "var(--radius-control)",
                fontWeight: 700,
                fontSize: 16,
                boxShadow: "0 4px 16px rgba(224,132,172,0.35)",
              }}
            >
              Ver produtos
            </button>
            <button
              style={{
                background: "transparent",
                color: "#FFFFFF",
                padding: "14px 28px",
                borderRadius: "var(--radius-control)",
                fontWeight: 600,
                fontSize: 16,
                border: "2px solid rgba(255,255,255,0.3)",
              }}
            >
              Conhecer o Clube
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 28,
              marginTop: 40,
              paddingTop: 24,
              borderTop: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <div>
              <div className="display" style={{ fontSize: 22, color: "#FFFFFF" }}>
                +12 mil
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>clientes ativos</div>
            </div>
            <div>
              <div className="display" style={{ fontSize: 22, color: "#FFFFFF" }}>
                4,9 ★
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>avaliação média</div>
            </div>
            <div>
              <div className="display" style={{ fontSize: 22, color: "#FFFFFF" }}>
                48h
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>envio expresso</div>
            </div>
          </div>
        </div>

        <div style={{ position: "relative", height: 440 }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 20,
              width: 340,
              height: 400,
              borderRadius: "var(--radius-card)",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="120"
              height="120"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFD166"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <line x1="8" y1="3" x2="8" y2="21" />
              <line x1="12" y1="8" x2="17" y2="8" />
              <line x1="12" y1="12" x2="17" y2="12" />
            </svg>
          </div>
          <div
            style={{
              position: "absolute",
              top: 30,
              left: 0,
              width: 190,
              background: "rgba(255,255,255,0.92)",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Planner mais vendido</div>
            <div style={{ fontWeight: 700, fontSize: 14, margin: "4px 0", color: "var(--ink)" }}>
              Planner Semanal 2027
            </div>
            <div style={{ color: "var(--pink-600)", fontSize: 13, display: "flex", gap: 2 }}>
              ★★★★★
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 30,
              background: "rgba(255,255,255,0.92)",
              borderRadius: "var(--radius-control)",
              padding: "12px 18px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                background: "var(--cta)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              %
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
              Frete grátis acima de R$ 199
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
