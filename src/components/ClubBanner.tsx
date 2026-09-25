export function ClubBanner() {
  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "0 32px 72px" }}>
      <div
        style={{
          background: "linear-gradient(120deg,#3a2f4a,#4a3a5c)",
          border: "1px solid var(--ink-faint)",
          borderRadius: "var(--radius-card)",
          padding: "32px 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,0.12)",
              color: "var(--ink)",
              fontSize: 11,
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: "var(--radius-chip)",
              textTransform: "uppercase",
              letterSpacing: 0.4,
              marginBottom: 10,
            }}
          >
            Clube exclusivo
          </span>
          <h3 className="display" style={{ fontSize: 22, color: "var(--ink)", marginBottom: 6 }}>
            Clube Nuvem de Papel
          </h3>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", maxWidth: 480, margin: 0 }}>
            Assinatura mensal com frete grátis, curadoria de novidades e benefícios exclusivos
            para assinantes.
          </p>
        </div>
        <button
          style={{
            background: "var(--pink-600)",
            color: "var(--on-accent)",
            padding: "14px 28px",
            borderRadius: "var(--radius-control)",
            fontWeight: 700,
            fontSize: 14,
            whiteSpace: "nowrap",
          }}
        >
          Conhecer o Clube
        </button>
      </div>
    </section>
  );
}
