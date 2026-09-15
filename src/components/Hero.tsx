export function Hero() {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "76px 32px 100px",
        background:
          "linear-gradient(160deg,var(--blue-100) 0%,var(--bg-cotton) 55%,var(--pink-100) 100%)",
      }}
    >
      <svg
        style={{ position: "absolute", top: 20, left: -40, opacity: 0.7 }}
        width="160"
        height="96"
        viewBox="0 0 200 120"
        fill="none"
      >
        <path
          d="M40 90c-16 0-28-12-28-27 0-14 11-26 25-27 4-14 17-24 32-24 17 0 31 12 34 28 13 2 23 13 23 26 0 15-12 27-27 27H40z"
          fill="var(--lilac-100)"
        />
      </svg>
      <svg
        style={{ position: "absolute", bottom: 10, right: 60, opacity: 0.8 }}
        width="130"
        height="78"
        viewBox="0 0 200 120"
        fill="none"
      >
        <path
          d="M40 90c-16 0-28-12-28-27 0-14 11-26 25-27 4-14 17-24 32-24 17 0 31 12 34 28 13 2 23 13 23 26 0 15-12 27-27 27H40z"
          fill="var(--blue-100)"
        />
      </svg>

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
              background: "white",
              padding: "7px 16px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--pink-600)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8Z" />
            </svg>
            Novidades toda semana
          </span>

          <h1
            className="display"
            style={{ fontSize: 53, lineHeight: 1.14, margin: "22px 0 18px", color: "var(--ink)" }}
          >
            Sua papelaria favorita agora{" "}
            <span style={{ color: "var(--pink-600)" }}>na nuvem</span>
          </h1>

          <p
            style={{
              fontSize: 18,
              color: "var(--ink-soft)",
              lineHeight: 1.6,
              maxWidth: 460,
              margin: "0 0 34px",
            }}
          >
            Produtos criativos, fofos e organizados para transformar seu dia — do caderno
            perfeito ao adesivo mais fofo.
          </p>

          <div style={{ display: "flex", gap: 16 }}>
            <button
              style={{
                background: "var(--pink-600)",
                color: "white",
                padding: "16px 32px",
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 16,
                boxShadow: "var(--shadow-soft)",
              }}
            >
              Ver produtos
            </button>
            <button
              style={{
                background: "white",
                color: "var(--ink)",
                padding: "14px 28px",
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 16,
                border: "2px solid var(--lilac-100)",
              }}
            >
              Conhecer o Clube
            </button>
          </div>

          <div style={{ display: "flex", gap: 28, marginTop: 40 }}>
            <div>
              <div className="display" style={{ fontSize: 22, color: "var(--ink)" }}>
                +12 mil
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>clientes fofos</div>
            </div>
            <div>
              <div className="display" style={{ fontSize: 22, color: "var(--ink)" }}>
                4,9 ★
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>avaliação média</div>
            </div>
            <div>
              <div className="display" style={{ fontSize: 22, color: "var(--ink)" }}>
                48h
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>envio expresso</div>
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
              borderRadius: 32,
              background: "linear-gradient(145deg,var(--pink-300),var(--lilac-300))",
              boxShadow: "var(--shadow-soft)",
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
              stroke="white"
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
              background: "white",
              borderRadius: 20,
              padding: 16,
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Planner mais amado</div>
            <div style={{ fontWeight: 700, fontSize: 14, margin: "4px 0" }}>
              Fofura Semanal 2027
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
              background: "white",
              borderRadius: 999,
              padding: "12px 18px",
              boxShadow: "var(--shadow-card)",
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
                background: "var(--blue-100)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--blue-600)",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              %
            </div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Frete grátis acima de R$ 199</div>
          </div>
        </div>
      </div>
    </section>
  );
}
