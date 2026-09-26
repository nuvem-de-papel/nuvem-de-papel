"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { liquidarParcela } from "@/app/financeiro/actions";

export type ParcelaPendente = {
  id: string;
  numero: number;
  status: string;
  vencimento: string;
  valor: number;
  saldo: number;
  titulo: string;
  tituloStatus: string;
  cliente: string;
};

export type ResumoFinanceiro = {
  receber: number;
  vencidos: number;
  pagar: number;
  liquidadoMes: number;
  faturamento30d: number;
  margem30d: number;
  faixasVencidas: { faixa: string; valor: number }[];
};

export type FaturamentoCanal = { canal: string; total: number; pedidos: number };

const BTN = {
  border: "none",
  borderRadius: 999,
  padding: "7px 14px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const CARD: React.CSSProperties = {
  background: "var(--bg-cloud)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 18,
};

const INPUT: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  fontSize: 13,
};

const METODOS = [
  { valor: "pix", label: "Pix" },
  { valor: "boleto", label: "Boleto" },
  { valor: "transferencia", label: "Transferência" },
  { valor: "cartao", label: "Cartão" },
  { valor: "debito", label: "Débito" },
  { valor: "dinheiro", label: "Dinheiro" },
];

const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  aberto: { label: "Em aberto", bg: "#FFF4D6", fg: "#8A6400" },
  parcial: { label: "Parcial", bg: "#E0F2FE", fg: "#075985" },
  liquidado: { label: "Liquidado", bg: "#DCFCE7", fg: "#166534" },
  vencido: { label: "Vencido", bg: "#FEE2E2", fg: "#991B1B" },
  cancelado: { label: "Cancelado", bg: "#EEE", fg: "#555" },
};

export function ConsoleFinanceiro({
  resumo,
  parcelas,
  faturamento,
}: {
  resumo: ResumoFinanceiro;
  parcelas: ParcelaPendente[];
  faturamento: FaturamentoCanal[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [form, setForm] = useState<Record<string, { valor: string; metodo: string }>>({});

  function formDa(p: ParcelaPendente) {
    return form[p.id] ?? { valor: p.saldo.toFixed(2), metodo: "pix" };
  }

  function setFormDa(p: ParcelaPendente, patch: Partial<{ valor: string; metodo: string }>) {
    setForm((prev) => ({ ...prev, [p.id]: { ...formDa(p), ...patch } }));
  }

  function liquidar(p: ParcelaPendente) {
    const f = formDa(p);
    startTransition(async () => {
      const r = await liquidarParcela(p.id, Number(f.valor), f.metodo, "");
      setAviso(r.ok ? { tipo: "ok", texto: r.msg } : { tipo: "erro", texto: r.erro });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "26px 24px 60px" }}>
      <h1 className="display" style={{ fontSize: 26, color: "var(--navy)", margin: "0 0 4px" }}>
        Financeiro
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 18px" }}>
        Contas a receber dos cartões no PDV, liquidações e faturamento dos últimos 30 dias.
      </p>

      {aviso && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: aviso.tipo === "ok" ? "#DCFCE7" : "#FEE2E2",
            color: aviso.tipo === "ok" ? "#166534" : "#991B1B",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13.5,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {aviso.texto}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ ...CARD, background: "var(--pink-100)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>A receber</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--navy)" }} aria-label="A receber">
            {brl(resumo.receber)}
          </div>
        </div>
        <div style={{ ...CARD, background: resumo.pagar > 0 ? "#FEF3C7" : "var(--bg-cloud)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: resumo.pagar > 0 ? "#B45309" : "var(--navy)" }}>
            A pagar
          </div>
          <div
            style={{ fontSize: 22, fontWeight: 800, color: resumo.pagar > 0 ? "#B45309" : "var(--navy)" }}
            aria-label="A pagar"
          >
            {brl(resumo.pagar)}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 6 }}>
            fornecedores
          </div>
        </div>
        <div style={{ ...CARD, background: resumo.vencidos > 0 ? "#FEE2E2" : "var(--bg-cloud)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: resumo.vencidos > 0 ? "#991B1B" : "var(--navy)" }}>
            Vencidos
          </div>
          <div
            style={{ fontSize: 22, fontWeight: 800, color: resumo.vencidos > 0 ? "#991B1B" : "var(--navy)" }}
            aria-label="Vencidos"
          >
            {brl(resumo.vencidos)}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 6 }}>
            {resumo.faixasVencidas.map((f) => `${f.faixa}: ${brl(f.valor)}`).join(" · ")}
          </div>
        </div>
        <div style={{ ...CARD, background: "#DCFCE7" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>Liquidado no mês</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#166534" }} aria-label="Liquidado no mes">
            {brl(resumo.liquidadoMes)}
          </div>
        </div>
        <div style={{ ...CARD }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>Faturamento 30d</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--navy)" }} aria-label="Faturamento 30 dias">
            {brl(resumo.faturamento30d)}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 6 }}>
            margem bruta {brl(resumo.margem30d)}
          </div>
        </div>
      </div>

      <section style={{ ...CARD, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--navy)" }}>
          Faturamento por canal (30 dias)
        </h2>
        {faturamento.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>Sem vendas no período.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 11.5, textTransform: "uppercase" }}>
                <th style={{ padding: "6px 8px" }}>Canal</th>
                <th style={{ padding: "6px 8px" }}>Pedidos</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {faturamento.map((f) => (
                <tr key={f.canal} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "9px 8px", fontWeight: 600, textTransform: "capitalize" }}>{f.canal}</td>
                  <td style={{ padding: "9px 8px" }}>{f.pedidos}</td>
                  <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700 }}>{brl(f.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={CARD}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--navy)" }}>Contas a receber</h2>
        {parcelas.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>
            Nenhuma parcela em aberto — vendas no crédito do PDV aparecem aqui.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 11.5, textTransform: "uppercase" }}>
                  <th style={{ padding: "6px 8px" }}>Título</th>
                  <th style={{ padding: "6px 8px" }}>Cliente</th>
                  <th style={{ padding: "6px 8px" }}>Parcela</th>
                  <th style={{ padding: "6px 8px" }}>Vencimento</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Saldo</th>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                  <th style={{ padding: "6px 8px" }}>Liquidar</th>
                </tr>
              </thead>
              <tbody>
                {parcelas.map((p) => {
                  const hoje = new Date().toISOString().slice(0, 10);
                  const chave = p.status === "aberto" && p.vencimento < hoje ? "vencido" : p.status;
                  const badge = STATUS_BADGE[chave] ?? STATUS_BADGE.aberto;
                  const f = formDa(p);
                  return (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "9px 8px", fontWeight: 600 }}>{p.titulo}</td>
                      <td style={{ padding: "9px 8px" }}>{p.cliente}</td>
                      <td style={{ padding: "9px 8px" }}>{p.numero}x</td>
                      <td style={{ padding: "9px 8px", color: "var(--ink-soft)" }}>
                        {new Date(p.vencimento + "T12:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700 }}>{brl(p.saldo)}</td>
                      <td style={{ padding: "9px 8px" }}>
                        <span
                          style={{
                            background: badge.bg,
                            color: badge.fg,
                            borderRadius: 999,
                            padding: "3px 10px",
                            fontSize: 11.5,
                            fontWeight: 700,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: "9px 8px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={f.valor}
                            onChange={(e) => setFormDa(p, { valor: e.target.value })}
                            aria-label={`Valor a liquidar ${p.titulo} ${p.numero}x`}
                            style={{ ...INPUT, width: 96 }}
                          />
                          <select
                            value={f.metodo}
                            onChange={(e) => setFormDa(p, { metodo: e.target.value })}
                            aria-label={`Metodo ${p.titulo} ${p.numero}x`}
                            style={INPUT}
                          >
                            {METODOS.map((m) => (
                              <option key={m.valor} value={m.valor}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          <button
                            disabled={pendente}
                            onClick={() => liquidar(p)}
                            aria-label={`Liquidar ${p.titulo} parcela ${p.numero}`}
                            style={{ ...BTN, background: "#16A34A", color: "#FFF" }}
                          >
                            Liquidar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
