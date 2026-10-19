"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { executarCobrancaManual, atualizarRegra } from "@/app/financeiro/cobranca/actions";

export type ReguaPasso = {
  id: string;
  dias: number;
  canal: "email" | "whatsapp" | "ambos";
  ativo: boolean;
  texto: string;
};
export type CobrancaLinha = {
  id: string;
  codigo: string;
  cliente: string;
  email: string | null;
  valor: number;
  vencimento: string;
  diasAtraso: number;
  ultimaEtapa: number | null;
  ultimoSucesso: boolean | null;
};
export type EnvioLinha = {
  id: string;
  canal: string;
  enviadoEm: string;
  sucesso: boolean;
  erro: string | null;
  etapaDias: number | null;
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
const CHIP: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
};

const brl = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function rotuloEtapa(dias: number): string {
  if (dias < 0) return `${Math.abs(dias)}d antes`;
  if (dias === 0) return "no vencimento";
  return `${dias}d após`;
}

export function ConsoleCobranca({
  linhas,
  reguas,
  envios,
}: {
  linhas: CobrancaLinha[];
  reguas: ReguaPasso[];
  envios: EnvioLinha[];
}) {
  const router = useRouter();
  const [carregando, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [aba, setAba] = useState<"cobrancas" | "regua" | "historico">("cobrancas");
  const [rascunhos, setRascunhos] = useState<Record<string, ReguaPasso>>({});

  const total = useMemo(() => linhas.reduce((a, l) => a + l.valor, 0), [linhas]);
  const vencidas = linhas.filter((l) => l.diasAtraso >= 0);
  const semEmail = linhas.filter((l) => !l.email);

  function executar() {
    if (carregando) return;
    setAviso(null);
    startTransition(async () => {
      const r = await executarCobrancaManual();
      setAviso({ tipo: r.ok ? "ok" : "erro", texto: r.ok ? r.msg : r.erro });
      if (r.ok) router.refresh();
    });
  }

  function editar(id: string, campo: keyof ReguaPasso, valor: unknown) {
    const base = rascunhos[id] ?? reguas.find((r) => r.id === id)!;
    setRascunhos({ ...rascunhos, [id]: { ...base, [campo]: valor } });
  }

  function salvar(id: string) {
    const r = rascunhos[id];
    if (!r || carregando) return;
    setAviso(null);
    startTransition(async () => {
      const res = await atualizarRegra(id, { canal: r.canal, ativo: r.ativo, texto: r.texto });
      setAviso({ tipo: res.ok ? "ok" : "erro", texto: res.ok ? res.msg : res.erro });
      if (res.ok) {
        setRascunhos((prev) => {
          const copia = { ...prev };
          delete copia[id];
          return copia;
        });
        router.refresh();
      }
    });
  }

  const TABS = [
    { id: "cobrancas", nome: "Cobranças", n: linhas.length },
    { id: "regua", nome: "Régua", n: reguas.length },
    { id: "historico", nome: "Histórico", n: envios.length },
  ] as const;

  return (
    <>
      <PageHeader
        titulo="Cobrança automática"
        subtitulo="Régua de lembretes de títulos a receber por e-mail."
      />

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={executar} disabled={carregando} style={BOTAO}>
          {carregando ? "Executando…" : "Executar régua agora"}
        </button>
        <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          {linhas.length} parcela(s) na janela · {vencidas.length} vencida(s) · {brl(total)}
          {semEmail.length > 0 ? ` · ${semEmail.length} sem email` : ""}
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

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            style={{
              ...BOTAO,
              background: aba === t.id ? "var(--navy)" : "transparent",
              color: aba === t.id ? "#FFF" : "var(--ink-soft)",
              border: aba === t.id ? "none" : "1px solid var(--ink-faint)",
              padding: "8px 16px",
            }}
          >
            {t.nome} ({t.n})
          </button>
        ))}
      </div>

      {aba === "cobrancas" && (
        <div style={CARD}>
          {linhas.length === 0 ? (
            <p style={{ color: "var(--ink-soft)" }}>
              Nenhuma parcela em aberto na janela da régua (−15 a +3 dias).
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 12 }}>
                  <th style={{ padding: "8px 6px" }}>Doc</th>
                  <th style={{ padding: "8px 6px" }}>Cliente</th>
                  <th style={{ padding: "8px 6px" }}>Email</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>Saldo</th>
                  <th style={{ padding: "8px 6px" }}>Vencimento</th>
                  <th style={{ padding: "8px 6px" }}>Etapa</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid var(--ink-faint)" }}>
                    <td style={{ padding: "8px 6px", fontWeight: 600 }}>{l.codigo}</td>
                    <td style={{ padding: "8px 6px" }}>{l.cliente}</td>
                    <td style={{ padding: "8px 6px", color: l.email ? "var(--ink)" : "#C0392B" }}>
                      {l.email ?? "sem email"}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "right" }}>{brl(l.valor)}</td>
                    <td style={{ padding: "8px 6px" }}>
                      {new Date(l.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                      {l.diasAtraso > 0 && (
                        <span style={{ ...CHIP, background: "#FDECEA", color: "#C0392B", marginLeft: 6 }}>
                          {l.diasAtraso}d
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      {l.ultimaEtapa === null ? (
                        <span style={{ color: "var(--ink-soft)" }}>—</span>
                      ) : (
                        <span
                          style={{
                            ...CHIP,
                            background: l.ultimoSucesso ? "#E8F6EE" : "#FDECEA",
                            color: l.ultimoSucesso ? "#2E9E6B" : "#C0392B",
                          }}
                        >
                          {rotuloEtapa(l.ultimaEtapa)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {aba === "regua" && (
        <div style={{ display: "grid", gap: 16 }}>
          {reguas.map((r) => {
            const ed = rascunhos[r.id] ?? r;
            const mudou = Boolean(rascunhos[r.id]);
            return (
              <div key={r.id} style={CARD}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 16 }}>{rotuloEtapa(r.dias)}</strong>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={ed.ativo}
                      onChange={(e) => editar(r.id, "ativo", e.target.checked)}
                    />
                    ativo
                  </label>
                  <label style={{ fontSize: 13 }}>
                    canal{" "}
                    <select
                      value={ed.canal}
                      onChange={(e) => editar(r.id, "canal", e.target.value)}
                      style={{ ...INPUT, width: "auto", display: "inline-block", padding: "4px 8px" }}
                    >
                      <option value="email">email</option>
                      <option value="whatsapp" disabled>
                        whatsapp (etapa 2)
                      </option>
                      <option value="ambos" disabled>
                        ambos (etapa 2)
                      </option>
                    </select>
                  </label>
                  <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {"{nome} {valor} {vencimento} são obrigatórios"}
                  </span>
                  {mudou && (
                    <button onClick={() => salvar(r.id)} disabled={carregando} style={{ ...BOTAO, padding: "6px 14px" }}>
                      {carregando ? "Salvando…" : "Salvar"}
                    </button>
                  )}
                </div>
                <label style={LABEL}>Texto da mensagem</label>
                <textarea
                  value={ed.texto}
                  onChange={(e) => editar(r.id, "texto", e.target.value)}
                  rows={3}
                  style={INPUT}
                />
              </div>
            );
          })}
        </div>
      )}

      {aba === "historico" && (
        <div style={CARD}>
          {envios.length === 0 ? (
            <p style={{ color: "var(--ink-soft)" }}>Nenhum e-mail enviado ainda.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 12 }}>
                  <th style={{ padding: "8px 6px" }}>Quando</th>
                  <th style={{ padding: "8px 6px" }}>Canal</th>
                  <th style={{ padding: "8px 6px" }}>Etapa</th>
                  <th style={{ padding: "8px 6px" }}>Status</th>
                  <th style={{ padding: "8px 6px" }}>Erro</th>
                </tr>
              </thead>
              <tbody>
                {envios.map((e) => (
                  <tr key={e.id} style={{ borderTop: "1px solid var(--ink-faint)" }}>
                    <td style={{ padding: "8px 6px" }}>
                      {new Date(e.enviadoEm).toLocaleString("pt-BR")}
                    </td>
                    <td style={{ padding: "8px 6px" }}>{e.canal}</td>
                    <td style={{ padding: "8px 6px" }}>
                      {e.etapaDias === null ? "—" : rotuloEtapa(e.etapaDias)}
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <span
                        style={{
                          ...CHIP,
                          background: e.sucesso ? "#E8F6EE" : "#FDECEA",
                          color: e.sucesso ? "#2E9E6B" : "#C0392B",
                        }}
                      >
                        {e.sucesso ? "enviado" : "falhou"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 6px", color: "var(--ink-soft)" }}>{e.erro ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
