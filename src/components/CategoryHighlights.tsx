const CATEGORIES = [
  {
    title: "Cadernos & Agendas",
    description: "Cadernos e agendas para o seu dia a dia.",
    bg: "var(--blue-100)",
    fg: "var(--blue-600)",
    icon: (
      <path d="M4 3h13a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4V3Z M8 3v18" />
    ),
  },
  {
    title: "Organização & Planners",
    description: "Planners e agendas para uma rotina produtiva.",
    bg: "var(--pink-100)",
    fg: "var(--pink-600)",
    icon: (
      <path d="M3 10h18M8 3v4M16 3v4M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    ),
  },
  {
    title: "Presentes & Acessórios",
    description: "Itens especiais de papelaria e presentes.",
    bg: "var(--lilac-100)",
    fg: "var(--lilac-600)",
    icon: <path d="M20 12v9H4v-9M2 7h20v5H2V7ZM12 22V7M12 7a2.5 2.5 0 1 1 2.5-2.5A2.5 2.5 0 0 1 12 7ZM12 7a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 12 7Z" />,
  },
];

export function CategoryHighlights() {
  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "72px 32px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <h2 className="display" style={{ fontSize: 28, color: "var(--ink)" }}>
          Feito pro seu jeito de organizar
        </h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 8 }}>
          Escolha por categoria e encontre o que precisa
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
        {CATEGORIES.map((cat) => (
          <div
            key={cat.title}
            style={{
              background: cat.bg,
              border: "1px solid var(--ink-faint)",
              borderRadius: "var(--radius-card)",
              padding: 24,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: "rgba(0,0,0,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
                color: cat.fg,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                {cat.icon}
              </svg>
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: "0 0 6px" }}>
              {cat.title}
            </h3>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 14px" }}>
              {cat.description}
            </p>
            <a href="/produtos" style={{ fontSize: 12, fontWeight: 700, color: cat.fg }}>
              Explorar →
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
