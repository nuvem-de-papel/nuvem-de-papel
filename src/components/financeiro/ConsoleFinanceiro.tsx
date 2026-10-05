"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { liquidarParcela } from "@/app/financeiro/actions";
import { PageHeader } from "@/components/admin/PageHeader";

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

/** Uma linha da view `v_dre` (migration 0021): valor ja com sinal da conta.
 * Classe 4 sai `credito - debito` (receita positiva, deducao negativa);
 * classes 5 e 6 sao `debito - credito` (custo/despesa positivo). */
export type LinhaDRE = {
  mes: string;
  grupo: string;
  code: string;
  nome: string;
  valor: number;
};

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

function rotuloMes(mes: string) {
  return new Date(mes + "T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

type LinhaDREMostrada = { rotulo: string; valor: number; tipo: "item" | "total" | "final" };

/** Monta o DRE completo a partir das linhas de UM mes de competencia.
 *  Receita (grupo receita_bruta) ja vem positiva; deducoes ja vem negativas;
 *  CMV e despesas valem como positivo e entram subtraidos. */
function montarDRE(linhas: LinhaDRE[]): LinhaDREMostrada[] {
  const soma = (g: string) => linhas.filter((l) => l.grupo === g).reduce((a, l) => a + l.valor, 0);
  const depr = linhas.filter((l) => l.code === "6.1.5").reduce((a, l) => a + l.valor, 0);
  const rb = soma("receita_bruta");
  const ded = soma("deducoes_receita");
  const liq = rb + ded;
  const cmv = soma("custo_vendidos");
  const bruto = liq - cmv;
  const oper = soma("despesa_operacional") - depr;
  const ebitda = bruto - oper;
  const ebit = ebitda - depr;
  const outras = soma("outras_receitas");
  const fin = soma("despesa_financeira");
  const lair = ebit + outras - fin;
  const ir = soma("ir_csf");
  return [
    { rotulo: "Receita bruta de vendas", valor: rb, tipo: "item" },
    { rotulo: "(-) Deduções da receita bruta", valor: ded, tipo: "item" },
    { rotulo: "= Receita líquida", valor: liq, tipo: "total" },
    { rotulo: "(-) Custo dos produtos vendidos", valor: -cmv, tipo: "item" },
    { rotulo: "= Lucro bruto", valor: bruto, tipo: "total" },
    { rotulo: "(-) Despesas operacionais", valor: -oper, tipo: "item" },
    { rotulo: "= EBITDA", valor: ebitda, tipo: "total" },
    { rotulo: "(-) Depreciação e amortização", valor: -depr, tipo: "item" },
    { rotulo: "= Resultado operacional (EBIT)", valor: ebit, tipo: "total" },
    { rotulo: "(+) Outras receitas", valor: outras, tipo: "item" },
    { rotulo: "(-) Despesas financeiras", valor: -fin, tipo: "item" },
    { rotulo: "= Resultado antes do imposto (LAIR)", valor: lair, tipo: "total" },
    { rotulo: "(-) IRPJ e CSLL", valor: -ir, tipo: "item" },
    { rotulo: "= Lucro líquido do período", valor: lair - ir, tipo: "final" },
  ];
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
  dre,
}: {
  resumo: ResumoFinanceiro;
  parcelas: ParcelaPendente[];
  faturamento: FaturamentoCanal[];
  dre: LinhaDRE[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [form, setForm] = useState<Record<string, { valor: string; metodo: string }>>({});
  const [mesDRE, setMesDRE] = useState("");

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

  const mesesDRE = [...new Set(dre.map((l) => l.mes))].sort();
  const mesEscolhido = mesesDRE.includes(mesDRE) ? mesDRE : mesesDRE[mesesDRE.length - 1] ?? "";
  const linhasDRE = montarDRE(dre.filter((l) => l.mes === mesEscolhido));

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "26px 24px 60px" }}>
      <PageHeader
        titulo="Financeiro"
        subtitulo="Contas a receber dos cartões no PDV, liquidações e faturamento dos últimos 30 dias."
        voltarPara="/crm"
      />

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

      <section style={{ ...CARD, marginBottom: 20 }} aria-label="DRE">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0, color: "var(--navy)" }}>
            DRE — Demonstrativo do Resultado do Exercício (competência)
          </h2>
          {mesesDRE.length > 0 && (
            <label
              style={{ fontSize: 12.5, color: "var(--ink-soft)", display: "flex", gap: 8, alignItems: "center" }}
            >
              Competência
              <select
                aria-label="Competência da DRE"
                value={mesEscolhido}
                onChange={(e) => setMesDRE(e.target.value)}
                style={{ ...INPUT, fontWeight: 700 }}
              >
                {mesesDRE.map((m) => (
                  <option key={m} value={m}>
                    {rotuloMes(m)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {dre.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>
            Nenhum lançamento contábil gravado até agora. As vendas faturadas, os recebimentos de
            compra e as liquidações de título passam a gerar lançamento automático (dupla entrada,
            chave por evento) — nenhum lançamento é digitado à mão.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    color: "var(--ink-soft)",
                    fontSize: 11.5,
                    textTransform: "uppercase",
                  }}
                >
                  <th style={{ padding: "6px 8px" }}>Linha</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhasDRE.map((l) => (
                  <tr
                    key={l.rotulo}
                    style={{
                      borderTop: l.tipo === "item" ? "1px solid var(--border)" : "2px solid var(--navy)",
                      background: l.tipo === "final" ? "#DCFCE7" : l.tipo === "total" ? "var(--bg-cotton)" : undefined,
                    }}
                  >
                    <td
                      style={{
                        padding: "9px 8px",
                        fontWeight: l.tipo === "item" ? 500 : 800,
                        color: l.tipo === "item" ? "var(--ink)" : "var(--navy)",
                      }}
                    >
                      {l.rotulo}
                    </td>
                    <td
                      style={{
                        padding: "9px 8px",
                        textAlign: "right",
                        fontWeight: l.tipo === "item" ? 700 : 800,
                        color:
                          l.tipo === "final"
                            ? l.valor >= 0
                              ? "#166534"
                              : "#991B1B"
                            : l.valor < 0
                              ? "#991B1B"
                              : "var(--navy)",
                      }}
                    >
                      {brl(l.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "10px 0 0" }}>
              Fonte: <code>v_dre</code> — diário de dupla entrada por mês de competência (migration
              0021/0022). O caixa continua em “A receber”, “A pagar” e “Liquidado no mês”.
            </p>
          </div>
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
