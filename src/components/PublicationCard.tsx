import type { Publication } from "@/lib/publications";

const STYLES = [
  { gradient: "linear-gradient(135deg,var(--blue-100),var(--lilac-100))", pillBg: "var(--blue-100)", pillColor: "var(--blue-600)" },
  { gradient: "linear-gradient(135deg,var(--pink-100),var(--blue-100))", pillBg: "var(--pink-100)", pillColor: "var(--pink-600)" },
  { gradient: "linear-gradient(135deg,var(--lilac-100),var(--pink-100))", pillBg: "var(--lilac-100)", pillColor: "var(--lilac-600)" },
];

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(iso)
  );
}

export function PublicationCard({ publicacao, index }: { publicacao: Publication; index: number }) {
  const style = STYLES[index % STYLES.length];

  return (
    <div style={{ background: "var(--bg-cloud)", border: "1px solid var(--ink-faint)", borderRadius: "var(--radius-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
      <div
        style={{
          height: 150,
          background: style.gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="52"
          height="52"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#073B4C"
          strokeOpacity="0.3"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 4h13a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V4z" />
          <line x1="8" y1="8" x2="15" y2="8" />
          <line x1="8" y1="12" x2="15" y2="12" />
          <line x1="8" y1="16" x2="12" y2="16" />
        </svg>
      </div>
      <div style={{ padding: 20 }}>
        <span
          style={{
            background: style.pillBg,
            color: style.pillColor,
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: "var(--radius-chip)",
          }}
        >
          {publicacao.category}
        </span>
        <h3 style={{ fontFamily: "Open Sans", fontWeight: 600, fontSize: 16, margin: "12px 0 8px", color: "var(--ink)" }}>
          {publicacao.title}
        </h3>
        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          {formatDate(publicacao.publishedAt)}
          {publicacao.readingMinutes ? ` · ${publicacao.readingMinutes} min de leitura` : ""}
        </div>
      </div>
    </div>
  );
}
