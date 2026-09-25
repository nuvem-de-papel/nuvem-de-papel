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
      <div style={{ height: 150, background: style.gradient }} />
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
