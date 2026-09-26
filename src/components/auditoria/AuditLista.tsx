"use client";

import { useState } from "react";

export type Linha = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
};

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function curto(id: string | null): string {
  if (!id) return "—";
  return id.slice(0, 8);
}

function temMudanca(v: unknown): boolean {
  return v !== null && v !== undefined;
}

export function AuditLista({ linhas }: { linhas: Linha[] }) {
  const [filtro, setFiltro] = useState("");

  const filtradas = filtro.trim()
    ? linhas.filter((l) => {
        const alvo = filtro.trim().toLowerCase();
        return (
          l.action.toLowerCase().includes(alvo) ||
          (l.actor_email ?? "").toLowerCase().includes(alvo) ||
          l.entity.toLowerCase().includes(alvo)
        );
      })
    : linhas;

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 32, marginBottom: 8, color: "var(--ink)" }}>
        Auditoria
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 24 }}>
        Trilha “quem fez o quê, quando” — últimas 200 ações registradas automaticamente.
      </p>

      <input
        type="search"
        placeholder="Filtrar por ação, e-mail ou entidade…"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "10px 14px",
          border: "1.5px solid var(--border)",
          borderRadius: 10,
          fontSize: 14,
          fontFamily: "'Open Sans', sans-serif",
          background: "var(--bg-cloud)",
          outline: "none",
          marginBottom: 20,
          display: "block",
        }}
      />

      <div
        style={{
          background: "var(--bg-cloud)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          padding: 24,
          boxShadow: "var(--shadow-card)",
        }}
      >
        {filtradas.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            Nenhuma ação registrada ainda.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  color: "var(--ink-soft)",
                  fontSize: 12,
                  textTransform: "uppercase",
                }}
              >
                <th style={{ paddingBottom: 12 }}>Quando</th>
                <th style={{ paddingBottom: 12 }}>Quem</th>
                <th style={{ paddingBottom: 12 }}>Ação</th>
                <th style={{ paddingBottom: 12 }}>Alvo</th>
                <th style={{ paddingBottom: 12, textAlign: "right" }}>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 0", color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                    {quando(l.created_at)}
                  </td>
                  <td style={{ padding: "12px 0", fontWeight: 600, color: "var(--ink)" }}>
                    {l.actor_email ?? (l.actor_user_id ? curto(l.actor_user_id) : "sistema")}
                  </td>
                  <td style={{ padding: "12px 0" }}>
                    <span
                      style={{
                        background: "var(--lilac-100)",
                        color: "var(--lilac-600)",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: "var(--radius-chip)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {l.action}
                    </span>
                  </td>
                  <td style={{ padding: "12px 0", color: "var(--ink-soft)", fontSize: 13 }}>
                    {l.entity}
                    {l.entity_id ? ` ${curto(l.entity_id)}` : ""}
                  </td>
                  <td style={{ padding: "12px 0", textAlign: "right" }}>
                    {temMudanca(l.before) || temMudanca(l.after) ? (
                      <details style={{ display: "inline-block" }}>
                        <summary
                          style={{
                            cursor: "pointer",
                            color: "var(--blue-600)",
                            fontWeight: 700,
                            fontSize: 12,
                            listStyle: "none",
                          }}
                        >
                          ver
                        </summary>
                        <pre
                          style={{
                            textAlign: "left",
                            fontSize: 11.5,
                            background: "var(--bg-cotton)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            padding: 10,
                            marginTop: 8,
                            maxWidth: 420,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {JSON.stringify({ before: l.before, after: l.after }, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
