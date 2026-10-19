"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  executarMarketingManual,
  marcarReclamacao,
  resolverReclamacao,
} from "@/app/crm/marketing/actions";

export type MarketingStats = {
  enviados: number;
  cliques: number;
  reclamacoes: number;
  resolvidas: number;
  linkGoogle: boolean;
};

export type AvaliacaoLinha = {
  id: string;
  codigo: string;
  cliente: string;
  email: string | null;
  enviadoEm: string;
  clicou: boolean;
  reclamacao: boolean;
  resolvida: boolean;
};

const CARD: CSSProperties = {
  background: "var(--bg-cloud)",
  border: "1px solid var(--ink-faint)",
  borderRadius: "var(--radius-card)",
  padding: 24,
  boxShadow: "var(--shadow-card)",
};
const BOTAO: CSSProperties = {
  background: "var(--navy)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 999,
  padding: "11px 22px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const CHIP: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
};
const STAT_BOX: CSSProperties = {
  flex: "1 1 140px",
  background: "#FFFFFF",
  border: "1px solid var(--ink-faint)",
  borderRadius: 12,
  padding: "14px 16px",
};

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function ConsoleMarketing({ linhas, stats }: { linhas: AvaliacaoLinha[]; stats: MarketingStats }) {
  const router = useRouter();
  const [carregando, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  function executar() {
    if (carregando) return;
    setAviso(null);
    startTransition(async () => {
      const r = await executarMarketingManual();
      setAviso({ tipo: r.ok ? "ok" : "erro", texto: r.ok ? r.msg : r.erro });
      if (r.ok) router.refresh();
    });
  }

  function alternar(id: string, acao: "marcar" | "resolver", valor: boolean) {
    if (carregando) return;
    setAviso(null);
    startTransition(async () => {
      const r =
        acao === "marcar"
          ? await marcarReclamacao(id, valor)
          : await resolverReclamacao(id, valor);
      setAviso({ tipo: r.ok ? "ok" : "erro", texto: r.ok ? r.msg : r.erro });
      if (r.ok) router.refresh();
    });
  }

  const pendentes = linhas.filter((l) => l.reclamacao && !l.resolvida);

  return (
    <>
      <PageHeader
        titulo="Marketing"
        subtitulo="Reativação de clientes e avaliações no Google."
        voltarPara="/crm"
      />

      {!stats.linkGoogle && (
        <div
          role="status"
          style={{
            ...CARD,
            padding: "12px 16px",
            marginBottom: 16,
            borderLeft: "4px solid #B9770E",
            background: "#FEF5E7",
          }}
        >
          <strong>Link do Google não configurado.</strong> Sem ele, o pedido de avaliação não é enviado. Cole o link “pedir avaliações” do Perfil da Empresa na tabela <code>marketing_config.google_review_link</code>.
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={executar} disabled={carregando} style={BOTAO}>
          {carregando ? "Executando…" : "Executar marketing agora"}
        </button>
        <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Reativa inativos e manda pedido de avaliação para pedidos entregues.
        </span>
      </div>

      {aviso && (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...CARD,
            padding: "12px 16px",
            marginBottom: 16,
            borderLeft: `4px solid ${aviso.tipo === "ok" ? "#2E9E6B" : "#C0392B"}`,
          }}
        >
          {aviso.texto}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={STAT_BOX}>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Avaliações enviadas</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)" }}>{stats.enviados}</div>
        </div>
        <div style={STAT_BOX}>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Cliques no link</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#2E9E6B" }}>{stats.cliques}</div>
        </div>
        <div style={STAT_BOX}>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Reclamações</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#C0392B" }}>{stats.reclamacoes}</div>
        </div>
        <div style={STAT_BOX}>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Resolvidas</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)" }}>{stats.resolvidas}</div>
        </div>
      </div>

      <section style={CARD}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--navy)" }}>
          Reclamações abertas ({pendentes.length})
        </h2>
        {pendentes.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Nenhuma reclamação aberta. Resolver reclamação é o que mais melhora a nota.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {pendentes.map((l) => (
              <li key={l.id} style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--ink-faint)", paddingTop: 10, flexWrap: "wrap" }}>
                <div>
                  <strong>{l.codigo}</strong> — {l.cliente} {l.email ? `(${l.email})` : ""}
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>avaliado em {formatarData(l.enviadoEm)}</div>
                </div>
                <button onClick={() => alternar(l.id, "resolver", true)} disabled={carregando} style={{ ...BOTAO, padding: "7px 16px" }}>
                  Marcar como resolvida
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ ...CARD, marginTop: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--navy)" }}>
          Pedidos de avaliação ({linhas.length})
        </h2>
        {linhas.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Nenhum pedido de avaliação enviado ainda. Entregue um pedido e execute a régua.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 12 }}>
                <th style={{ padding: "8px 6px" }}>Pedido</th>
                <th style={{ padding: "8px 6px" }}>Cliente</th>
                <th style={{ padding: "8px 6px" }}>Enviado</th>
                <th style={{ padding: "8px 6px" }}>Clique</th>
                <th style={{ padding: "8px 6px" }}>Status</th>
                <th style={{ padding: "8px 6px" }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid var(--ink-faint)" }}>
                  <td style={{ padding: "8px 6px", fontWeight: 600 }}>{l.codigo}</td>
                  <td style={{ padding: "8px 6px" }}>{l.cliente}</td>
                  <td style={{ padding: "8px 6px" }}>{formatarData(l.enviadoEm)}</td>
                  <td style={{ padding: "8px 6px" }}>
                    {l.clicou ? (
                      <span style={{ ...CHIP, background: "#E8F6EE", color: "#2E9E6B" }}>clicou</span>
                    ) : (
                      <span style={{ color: "var(--ink-soft)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    {l.reclamacao ? (
                      l.resolvida ? (
                        <span style={{ ...CHIP, background: "#E8F6EE", color: "#2E9E6B" }}>resolvida</span>
                      ) : (
                        <span style={{ ...CHIP, background: "#FDECEA", color: "#C0392B" }}>reclamação</span>
                      )
                    ) : (
                      <span style={{ color: "var(--ink-soft)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    {l.reclamacao ? (
                      <button
                        onClick={() => alternar(l.id, "resolver", !l.resolvida)}
                        disabled={carregando}
                        style={{ ...BOTAO, padding: "5px 12px", fontSize: 12 }}
                      >
                        {l.resolvida ? "Reabrir" : "Resolver"}
                      </button>
                    ) : (
                      <button
                        onClick={() => alternar(l.id, "marcar", true)}
                        disabled={carregando}
                        style={{ ...BOTAO, padding: "5px 12px", fontSize: 12, background: "transparent", color: "var(--ink-soft)", border: "1px solid var(--ink-faint)" }}
                      >
                        Marcar reclamação
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
