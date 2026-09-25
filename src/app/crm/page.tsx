import { getCrmSummary } from "@/lib/crm";

export const dynamic = "force-dynamic";

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const STATUS_LABEL: Record<string, string> = {
  entregue: "Entregue",
  em_rota: "Em rota",
  processando: "Processando",
  cancelado: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  entregue: "var(--pink-600)",
  em_rota: "var(--blue-600)",
  processando: "var(--lilac-600)",
  cancelado: "var(--ink-faint)",
};

// Nota: --pink-600 é o accent corporativo (teal escuro), não rosa — nome da
// variável mantido por compatibilidade com globals.css (ver rebrand 2026-09-23).

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  ouro: { bg: "var(--pink-100)", color: "var(--pink-600)" },
  diamante: { bg: "var(--lilac-100)", color: "var(--lilac-600)" },
  prata: { bg: "var(--blue-100)", color: "var(--blue-600)" },
  bronze: { bg: "var(--bg-cloud)", color: "var(--ink-soft)" },
};

export default async function CrmPage() {
  const data = await getCrmSummary();
  const maxStatusCount = Math.max(1, ...data.pedidosPorStatus.map((s) => s.count));

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 32, marginBottom: 8, color: "var(--ink)" }}>
        CRM
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Painel administrativo — dado real do Supabase, atrás de login básico.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 32 }}>
        {[
          { label: "Receita do mês", value: formatBRL(data.receitaMes) },
          { label: "Pedidos no mês", value: String(data.pedidosMes) },
          { label: "Novos clientes no mês", value: String(data.novosClientesMes) },
          { label: "Ticket médio", value: formatBRL(data.ticketMedio) },
        ].map((kpi) => (
          <div key={kpi.label} style={{ background: "var(--bg-cloud)", border: "1px solid var(--ink-faint)", borderRadius: "var(--radius-card)", padding: 20, boxShadow: "var(--shadow-card)" }}>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4 }}>{kpi.label}</p>
            <p className="display" style={{ fontSize: 26, marginTop: 8 }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, marginBottom: 32 }}>
        <div style={{ background: "var(--bg-cloud)", border: "1px solid var(--ink-faint)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-card)" }}>
          <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>Clientes recentes</h2>
          {data.clientesRecentes.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Nenhum pedido registrado ainda.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 12, textTransform: "uppercase" }}>
                  <th style={{ paddingBottom: 12 }}>Cliente</th>
                  <th style={{ paddingBottom: 12 }}>Nível</th>
                  <th style={{ paddingBottom: 12, textAlign: "center" }}>Pedidos</th>
                  <th style={{ paddingBottom: 12, textAlign: "right" }}>Total gasto</th>
                </tr>
              </thead>
              <tbody>
                {data.clientesRecentes.map((c) => {
                  const tier = TIER_STYLE[c.tier] ?? TIER_STYLE.bronze;
                  return (
                    <tr key={c.id} style={{ borderTop: "1px solid var(--ink-faint)" }}>
                      <td style={{ padding: "12px 0", fontWeight: 600, color: "var(--ink)" }}>{c.name}</td>
                      <td style={{ padding: "12px 0" }}>
                        <span
                          style={{
                            background: tier.bg,
                            color: tier.color,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "3px 10px",
                            borderRadius: "var(--radius-chip)",
                          }}
                        >
                          {c.tier}
                        </span>
                      </td>
                      <td style={{ padding: "12px 0", textAlign: "center", color: "var(--ink-soft)" }}>{c.pedidos}</td>
                      <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 700, color: "var(--ink)" }}>{formatBRL(c.totalGasto)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ background: "var(--bg-cloud)", border: "1px solid var(--ink-faint)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-card)" }}>
          <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>Pedidos por status</h2>
          {data.pedidosPorStatus.map((s) => (
            <div key={s.status} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span>{STATUS_LABEL[s.status] ?? s.status}</span>
                <span style={{ color: "var(--ink-soft)", fontWeight: 700 }}>{s.count}</span>
              </div>
              <div style={{ background: "var(--bg-cloud)", height: 8, borderRadius: 999, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${(s.count / maxStatusCount) * 100}%`,
                    background: STATUS_COLOR[s.status] ?? "var(--ink-faint)",
                    height: "100%",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>Campanhas ativas</h2>
        {data.campanhasAtivas.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Nenhuma campanha ativa ou agendada.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {data.campanhasAtivas.map((c) => (
              <div key={c.id} style={{ background: "var(--bg-cloud)", border: "1px solid var(--ink-faint)", borderRadius: "var(--radius-card)", padding: 20, boxShadow: "var(--shadow-card)" }}>
                <span
                  style={{
                    background: c.status === "ativa" ? "var(--blue-100)" : "var(--lilac-100)",
                    color: c.status === "ativa" ? "var(--blue-600)" : "var(--lilac-600)",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "var(--radius-chip)",
                  }}
                >
                  {c.status === "ativa" ? "Ativa" : "Agendada"}
                </span>
                <h3 style={{ fontWeight: 700, fontSize: 15, margin: "10px 0 6px", color: "var(--ink)" }}>{c.name}</h3>
                {c.info ? <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>{c.info}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
