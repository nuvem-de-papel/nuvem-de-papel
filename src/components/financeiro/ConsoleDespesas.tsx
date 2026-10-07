"use client";

import { useMemo, useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { criarDespesa, type RateioLinha } from "@/app/financeiro/actions";

export type ContaDespesa = { code: string; name: string; grupo: string };
export type CentroCusto = { id: string; code: string; name: string };
export type DespesaRow = {
  id: string;
  competencia: string; // AAAA-MM-DD
  descricao: string;
  conta: string;
  centroId: string | null;
  valor: number;
  pagoEm: string | null;
};

const CARD: CSSProperties = {
  background: "var(--bg-cloud)",
  border: "1px solid var(--ink-faint)",
  borderRadius: "var(--radius-card)",
  padding: 24,
  boxShadow: "var(--shadow-card)",
};
const INPUT: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--ink-faint)",
  borderRadius: 8,
  fontSize: 14,
  background: "#FFFFFF",
  color: "var(--ink)",
  fontFamily: "inherit",
};
const LABEL: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  color: "var(--ink-soft)",
  marginBottom: 6,
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
const GRUPO_LABEL: Record<string, string> = {
  despesa_operacional: "Despesas operacionais",
  despesa_financeira: "Despesas financeiras",
  ir_csf: "IR/CSLL",
};

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const rotuloMes = (m: string) => {
  const [a, mes] = m.split("-");
  return `${mes}/${a}`;
};

type LinhaRateio = { uid: number; centroId: string; pct: string };

export function ConsoleDespesas({
  contas,
  centros,
  despesas,
}: {
  contas: ContaDespesa[];
  centros: CentroCusto[];
  despesas: DespesaRow[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const mesAtual = new Date().toISOString().slice(0, 7);

  // formulário
  const [descricao, setDescricao] = useState("");
  const [competencia, setCompetencia] = useState(mesAtual);
  const [conta, setConta] = useState("");
  const [valor, setValor] = useState("");
  const [pago, setPago] = useState(false);
  const [ratear, setRatear] = useState(false);
  const [centro, setCentro] = useState("");
  const [linhas, setLinhas] = useState<LinhaRateio[]>([
    { uid: 1, centroId: centros[0]?.id ?? "", pct: "50" },
    { uid: 2, centroId: centros[1]?.id ?? centros[0]?.id ?? "", pct: "50" },
  ]);

  // filtro da lista: null = automático (mês da despesa mais recente)
  const [mesFiltro, setMesFiltro] = useState<string | null>(null);

  const somaPct = linhas.reduce((a, l) => a + (Number(l.pct) > 0 ? Number(l.pct) : 0), 0);
  const valorNum = Number(valor.replace(",", "."));

  const meses = useMemo(() => {
    const set = new Set<string>([mesAtual]);
    for (const d of despesas) set.add(d.competencia.slice(0, 7));
    return [...set].sort().reverse();
  }, [despesas, mesAtual]);

  const mesAtivo = mesFiltro ?? despesas[0]?.competencia.slice(0, 7) ?? mesAtual;
  const doMes = despesas.filter((d) => d.competencia.slice(0, 7) === mesAtivo);

  const totalMes = doMes.reduce((a, d) => a + d.valor, 0);
  const porCentro = centros.map((c) => ({
    ...c,
    total: doMes.filter((d) => d.centroId === c.id).reduce((a, d) => a + d.valor, 0),
  }));
  const semCentro = doMes.filter((d) => !d.centroId).reduce((a, d) => a + d.valor, 0);

  const bloqueado =
    descricao.trim().length < 3 ||
    !conta ||
    !Number.isFinite(valorNum) ||
    valorNum <= 0 ||
    (ratear && Math.abs(somaPct - 100) > 0.01);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (bloqueado || pendente) return;
    setAviso(null);
    startTransition(async () => {
      const rateio: RateioLinha[] | null = ratear
        ? linhas
            .filter((l) => l.centroId && Number(l.pct) > 0)
            .map((l) => ({ centroId: l.centroId, pct: Number(l.pct) }))
        : null;
      const r = await criarDespesa({
        descricao: descricao.trim(),
        competencia,
        conta,
        valor: valorNum,
        pagoAgora: pago,
        centroId: centro || null,
        rateio,
      });
      setAviso({ tipo: r.ok ? "ok" : "erro", texto: r.ok ? r.msg : r.erro });
      if (r.ok) {
        setDescricao("");
        setValor("");
        setPago(false);
        router.refresh();
      }
    });
  }

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 72px" }}>
      <PageHeader
        titulo="Despesas"
        subtitulo="Lançamento de despesas (com rateio por centro de custo) — entra no DRE pela competência."
        voltarPara="/financeiro"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24,
          marginBottom: 24,
          alignItems: "start",
        }}
      >
        <form onSubmit={enviar} style={CARD} aria-label="Nova despesa">
          <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "var(--navy)" }}>Nova despesa</h2>

          <div style={{ marginBottom: 14 }}>
            <label style={LABEL} htmlFor="desp-descricao">
              Descrição
            </label>
            <input
              id="desp-descricao"
              aria-label="Descrição da despesa"
              placeholder="Ex.: Aluguel da loja"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              style={INPUT}
              maxLength={160}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={LABEL} htmlFor="desp-competencia">
                Competência
              </label>
              <input
                id="desp-competencia"
                aria-label="Competência da despesa"
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL} htmlFor="desp-valor">
                Valor (R$)
              </label>
              <input
                id="desp-valor"
                aria-label="Valor"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                style={INPUT}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={LABEL} htmlFor="desp-conta">
              Conta do plano
            </label>
            <select
              id="desp-conta"
              aria-label="Conta"
              value={conta}
              onChange={(e) => setConta(e.target.value)}
              style={INPUT}
            >
              <option value="">Escolha a conta de despesa…</option>
              {Object.entries(
                contas.reduce<Record<string, ContaDespesa[]>>((acc, c) => {
                  (acc[c.grupo] ??= []).push(c);
                  return acc;
                }, {})
              ).map(([grupo, lista]) => (
                <optgroup key={grupo} label={GRUPO_LABEL[grupo] ?? grupo}>
                  {lista.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 18, marginBottom: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13.5, display: "flex", gap: 7, alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                aria-label="Pago agora"
                checked={pago}
                onChange={(e) => setPago(e.target.checked)}
              />
              Pago agora (sai do caixa)
            </label>
            <label style={{ fontSize: 13.5, display: "flex", gap: 7, alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                aria-label="Ratear por centro de custo"
                checked={ratear}
                onChange={(e) => setRatear(e.target.checked)}
              />
              Ratear por centro de custo
            </label>
          </div>

          {!ratear ? (
            <div style={{ marginBottom: 16 }}>
              <label style={LABEL} htmlFor="desp-centro">
                Centro de custo
              </label>
              <select
                id="desp-centro"
                aria-label="Centro de custo"
                value={centro}
                onChange={(e) => setCentro(e.target.value)}
                style={INPUT}
              >
                <option value="">Sem centro de custo</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }} aria-label="Rateio">
              <span style={LABEL}>Rateio (% por centro — precisa somar 100%)</span>
              {linhas.map((l, i) => (
                <div key={l.uid} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <select
                    aria-label={`Centro ${i + 1}`}
                    value={l.centroId}
                    onChange={(e) =>
                      setLinhas((ls) =>
                        ls.map((x) => (x.uid === l.uid ? { ...x, centroId: e.target.value } : x))
                      )
                    }
                    style={{ ...INPUT, flex: 1 }}
                  >
                    <option value="">Escolha o centro…</option>
                    {centros.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Percentual ${i + 1}`}
                    inputMode="decimal"
                    value={l.pct}
                    onChange={(e) =>
                      setLinhas((ls) =>
                        ls.map((x) => (x.uid === l.uid ? { ...x, pct: e.target.value } : x))
                      )
                    }
                    style={{ ...INPUT, width: 84, textAlign: "right" }}
                  />
                  <span style={{ fontSize: 13, color: "var(--ink-soft)", width: 44 }}>%</span>
                  <button
                    type="button"
                    aria-label={`Remover centro ${i + 1}`}
                    onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((x) => x.uid !== l.uid) : ls))}
                    style={{
                      border: "1px solid var(--ink-faint)",
                      background: "#FFFFFF",
                      borderRadius: 8,
                      width: 32,
                      height: 34,
                      cursor: "pointer",
                      color: "var(--ink-soft)",
                      fontWeight: 700,
                    }}
                    title="Remover linha"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
                <button
                  type="button"
                  aria-label="Adicionar centro"
                  onClick={() =>
                    setLinhas((ls) =>
                      ls.length >= centros.length
                        ? ls
                        : [...ls, { uid: Math.max(...ls.map((x) => x.uid)) + 1, centroId: "", pct: "" }]
                    )
                  }
                  disabled={linhas.length >= centros.length}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    background: "none",
                    border: "1px dashed var(--ink-faint)",
                    borderRadius: 999,
                    padding: "6px 14px",
                    cursor: "pointer",
                    color: "var(--navy)",
                  }}
                >
                  + Adicionar centro
                </button>
                <span
                  aria-label="Soma do rateio"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    marginLeft: "auto",
                    color: Math.abs(somaPct - 100) < 0.01 ? "#1F8A4C" : "#B42318",
                  }}
                >
                  Soma: {somaPct}%
                </span>
              </div>
            </div>
          )}

          <button type="submit" aria-label="Lançar despesa" disabled={bloqueado || pendente} style={{ ...BOTAO, opacity: bloqueado || pendente ? 0.5 : 1 }}>
            {pendente ? "Lançando…" : "Lançar despesa"}
          </button>

          {aviso && (
            <p
              role="status"
              aria-live="polite"
              style={{
                marginTop: 14,
                fontSize: 13.5,
                fontWeight: 700,
                color: aviso.tipo === "ok" ? "#1F8A4C" : "#B42318",
              }}
            >
              {aviso.texto}
            </p>
          )}
          <p style={{ marginTop: 14, fontSize: 12, color: "var(--ink-soft)" }}>
            Despesa lançada não se apaga: o diário é imutável — correção entra como novo lançamento.
          </p>
        </form>

        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {porCentro.map((c) => (
              <div key={c.id} aria-label={`Total ${c.code}`} style={{ ...CARD, padding: 18 }}>
                <p style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {c.code} — {c.name}
                </p>
                <p className="display" style={{ fontSize: 22, marginTop: 6 }}>
                  {brl(c.total)}
                </p>
              </div>
            ))}
            {semCentro > 0 && (
              <div aria-label="Total sem centro" style={{ ...CARD, padding: 18 }}>
                <p style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Sem centro
                </p>
                <p className="display" style={{ fontSize: 22, marginTop: 6 }}>
                  {brl(semCentro)}
                </p>
              </div>
            )}
            <div aria-label="Total do mês" style={{ ...CARD, padding: 18, background: "#FFFFFF" }}>
              <p style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Total {rotuloMes(mesAtivo)}
              </p>
              <p className="display" style={{ fontSize: 22, marginTop: 6 }}>
                {brl(totalMes)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <section aria-label="Despesas do mês" style={CARD}>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0, color: "var(--navy)" }}>
            Despesas ({rotuloMes(mesAtivo)})
          </h2>
          <label style={{ fontSize: 12.5, color: "var(--ink-soft)", display: "flex", gap: 8, alignItems: "center" }}>
            Mês
            <select
              aria-label="Mês das despesas"
              value={mesAtivo}
              onChange={(e) => setMesFiltro(e.target.value)}
              style={{ ...INPUT, width: "auto", fontWeight: 700 }}
            >
              {meses.map((m) => (
                <option key={m} value={m}>
                  {rotuloMes(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {doMes.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>Nenhuma despesa lançada neste mês.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 12, textTransform: "uppercase" }}>
                <th style={{ paddingBottom: 10 }}>Descrição</th>
                <th style={{ paddingBottom: 10 }}>Conta</th>
                <th style={{ paddingBottom: 10 }}>Centro</th>
                <th style={{ paddingBottom: 10 }}>Pagamento</th>
                <th style={{ paddingBottom: 10, textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {doMes.map((d) => {
                const c = centros.find((x) => x.id === d.centroId);
                return (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--ink-faint)" }}>
                    <td style={{ padding: "11px 0", fontWeight: 600, color: "var(--ink)" }}>{d.descricao}</td>
                    <td style={{ padding: "11px 0", color: "var(--ink-soft)" }}>
                      {d.conta} — {contas.find((x) => x.code === d.conta)?.name ?? ""}
                    </td>
                    <td style={{ padding: "11px 0" }}>
                      {c ? (
                        <span
                          style={{
                            background: "var(--blue-100)",
                            color: "var(--blue-600)",
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "3px 10px",
                            borderRadius: 999,
                          }}
                        >
                          {c.code}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "11px 0", color: d.pagoEm ? "var(--ink)" : "#B45309", fontSize: 13 }}>
                      {d.pagoEm
                        ? `Pago ${d.pagoEm.slice(8, 10)}/${d.pagoEm.slice(5, 7)}`
                        : "Em aberto (a pagar)"}
                    </td>
                    <td style={{ padding: "11px 0", textAlign: "right", fontWeight: 700 }}>{brl(d.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
