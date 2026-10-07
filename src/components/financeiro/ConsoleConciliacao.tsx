"use client";

import { useMemo, useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { importarExtrato, conciliarLinha, type ExtratoLinhaEntrada } from "@/app/financeiro/actions";

export type LinhaExtrato = {
  id: string;
  data: string; // AAAA-MM-DD
  descricao: string;
  valor: number; // sinal do banco
  status: "pendente" | "conciliada" | "ignorada";
  refTipo: "liquidacao" | "despesa" | null;
  refId: string | null;
};
export type CandidatoConciliacao = {
  ref: string; // "liquidacao:<id>" | "despesa:<id>"
  tipo: "liquidacao" | "despesa";
  data: string;
  descricao: string;
  valor: number;
};
export type ExtratoResumo = {
  id: string;
  fonte: string;
  arquivoNome: string | null;
  competencia: string;
  linhasTotal: number;
  linhasNovas: number;
  criadoEm: string;
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
const BOTAO_PEQUENO: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  borderRadius: 999,
  padding: "6px 14px",
  cursor: "pointer",
  border: "1px solid var(--ink-faint)",
  background: "#FFFFFF",
  color: "var(--navy)",
};

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const rotuloMes = (m: string) => {
  const [a, mes] = m.split("-");
  return `${mes}/${a}`;
};
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// ---------------------------------------------------------- parser do extrato --
function normData(v: string): string | null {
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, d, m, a] = br;
    if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return null;
    return `${a}-${m}-${d}`;
  }
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)) return v;
  return null;
}

function num(s: string): number | null {
  let v = String(s).replace(/R\$/gi, "").replace(/\s/g, "");
  if (/^\((.*)\)$/.test(v)) v = "-" + v.slice(1, -1);
  if (!v) return null;
  const virgula = v.includes(",");
  if (virgula && /\,\d{1,2}$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
  else if (virgula) v = v.replace(/,/g, "");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseExtrato(texto: string): ExtratoLinhaEntrada[] {
  const t = texto.trim();
  if (!t) return [];
  const out: ExtratoLinhaEntrada[] = [];

  if (/<STMTTRN>/i.test(t)) {
    const blocos = t.split(/<STMTTRN>/i).slice(1);
    for (const b of blocos) {
      const fim = b.indexOf("</STMTTRN>");
      const corpo = fim >= 0 ? b.slice(0, fim) : b;
      const data = corpo.match(/<DTPOSTED>(\d{8})/i)?.[1] ?? "";
      const valorBruto = corpo.match(/<TRNAMT>([-\d.,]+)/i)?.[1] ?? "";
      const fitid = corpo.match(/<FITID>([^<\r\n]+)/i)?.[1]?.trim() ?? null;
      const memo = corpo.match(/<(?:MEMO|NAME)>([^<\r\n]+)/i)?.[1]?.trim() ?? "";
      const dataISO = data ? normData(`${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)}`) : null;
      const valor = num(valorBruto);
      if (!dataISO || valor === null || valor === 0) continue;
      out.push({ data: dataISO, descricao: (memo || "Lançamento do banco").slice(0, 200), valor, fitid });
    }
    return out;
  }

  for (const bruta of t.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    const sep = linha.includes(";") ? ";" : linha.includes("|") ? "|" : null;
    if (!sep) continue;
    const partes = linha.split(sep).map((p) => p.trim());
    if (partes.length < 3) continue;
    const dataISO = normData(partes[0]);
    if (!dataISO) continue; // cabeçalho e linhas ruins caem aqui
    const valor = num(partes[partes.length - 1]);
    const descricao = partes.slice(1, -1).join(" ");
    if (valor === null || valor === 0 || !descricao) continue;
    out.push({ data: dataISO, descricao: descricao.slice(0, 200), valor, fitid: null });
  }
  return out;
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
}

function sugestaoPara(l: LinhaExtrato, cands: CandidatoConciliacao[]): CandidatoConciliacao | null {
  if (l.status !== "pendente") return null;
  let melhor: CandidatoConciliacao | null = null;
  let melhorDist = 6;
  for (const c of cands) {
    if (Math.abs(c.valor - l.valor) > 0.009) continue;
    const dist = Math.abs(diasEntre(c.data, l.data));
    if (dist <= 5 && dist < melhorDist) {
      melhor = c;
      melhorDist = dist;
    }
  }
  return melhor;
}

export function ConsoleConciliacao({
  linhas,
  candidatos,
  extratos,
}: {
  linhas: LinhaExtrato[];
  candidatos: CandidatoConciliacao[];
  extratos: ExtratoResumo[];
}) {
  const router = useRouter();
  const [carregando, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const mesAtual = new Date().toISOString().slice(0, 7);
  const [texto, setTexto] = useState("");
  const [competencia, setCompetencia] = useState(mesAtual);
  const [mesFiltro, setMesFiltro] = useState<string | null>(null);
  const [statusFiltro, setStatusFiltro] = useState("todas");
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});

  const parsed = useMemo(() => parseExtrato(texto), [texto]);
  const ehOfx = /<STMTTRN>/i.test(texto);

  const meses = useMemo(() => {
    const set = new Set<string>([mesAtual]);
    for (const d of linhas) set.add(d.data.slice(0, 7));
    return [...set].sort().reverse();
  }, [linhas, mesAtual]);

  const mesAtivo = mesFiltro ?? linhas[0]?.data.slice(0, 7) ?? mesAtual;
  const doMes = linhas.filter((d) => d.data.slice(0, 7) === mesAtivo);
  const visiveis = doMes.filter(
    (d) =>
      statusFiltro === "todas" ||
      (statusFiltro === "pendentes" && d.status === "pendente") ||
      (statusFiltro === "conciliadas" && d.status === "conciliada") ||
      (statusFiltro === "ignoradas" && d.status === "ignorada")
  );

  const pendentes = doMes.filter((d) => d.status === "pendente");
  const conciliadas = doMes.filter((d) => d.status === "conciliada");
  const saldo = doMes.reduce((a, d) => a + d.valor, 0);

  const usados = new Set(
    conciliadas.filter((d) => d.refTipo && d.refId).map((d) => `${d.refTipo}:${d.refId}`)
  );
  const candsLivres = candidatos.filter((c) => !usados.has(c.ref));

  function importar(e: FormEvent) {
    e.preventDefault();
    if (parsed.length === 0 || carregando) return;
    setAviso(null);
    startTransition(async () => {
      const r = await importarExtrato({
        fonte: ehOfx ? "ofx" : "csv",
        arquivoNome: null,
        competencia,
        linhas: parsed,
      });
      setAviso({ tipo: r.ok ? "ok" : "erro", texto: r.ok ? r.msg : r.erro });
      if (r.ok) {
        setTexto("");
        router.refresh();
      }
    });
  }

  function agir(linhaId: string, acao: string, ref?: string) {
    setAviso(null);
    startTransition(async () => {
      let refObj: { tipo: string; id: string } | null = null;
      if (ref) {
        const [tipo, id] = ref.split(":");
        refObj = { tipo, id };
      }
      const r = await conciliarLinha(linhaId, acao, refObj);
      setAviso({ tipo: r.ok ? "ok" : "erro", texto: r.ok ? r.msg : r.erro });
      if (r.ok) {
        setEscolhas((e) => {
          const novo = { ...e };
          delete novo[linhaId];
          return novo;
        });
        router.refresh();
      }
    });
  }

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 72px" }}>
      <PageHeader
        titulo="Conciliação bancária"
        subtitulo="Importe o extrato do banco (OFX/CSV) e confira linha a linha contra as liquidações e despesas do sistema."
        voltarPara="/financeiro"
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 20 }}>
        <div aria-label="Linhas pendentes" style={{ ...CARD, padding: 18 }}>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Pendentes {rotuloMes(mesAtivo)}
          </p>
          <p className="display" style={{ fontSize: 22, marginTop: 6 }}>
            {pendentes.length}
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
            {brl(pendentes.reduce((a, d) => a + d.valor, 0))}
          </p>
        </div>
        <div aria-label="Linhas conciliadas" style={{ ...CARD, padding: 18 }}>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Conciliadas {rotuloMes(mesAtivo)}
          </p>
          <p className="display" style={{ fontSize: 22, marginTop: 6 }}>
            {conciliadas.length}
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
            de {doMes.length} linhas do mês
          </p>
        </div>
        <div aria-label="Saldo do extrato" style={{ ...CARD, padding: 18 }}>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Saldo importado {rotuloMes(mesAtivo)}
          </p>
          <p className="display" style={{ fontSize: 22, marginTop: 6 }}>
            {brl(saldo)}
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
            soma das linhas com sinal do banco
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24,
          marginBottom: 24,
          alignItems: "start",
        }}
      >
        <form onSubmit={importar} style={CARD} aria-label="Formulário de importação">
          <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "var(--navy)" }}>Importar extrato</h2>

          <div style={{ marginBottom: 14 }}>
            <label style={LABEL} htmlFor="conc-competencia">
              Competência
            </label>
            <input
              id="conc-competencia"
              aria-label="Competência do extrato"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              style={INPUT}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={LABEL} htmlFor="conc-texto">
              Extrato (CSV data;descricao;valor — ou OFX do banco)
            </label>
            <textarea
              id="conc-texto"
              aria-label="Extrato (CSV ou OFX)"
              placeholder={"05/09/2026;Pix recebido;450,00\n12/09/2026;Tarifa bancaria;-18,90"}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={7}
              style={{ ...INPUT, fontFamily: "Consolas,monospace", fontSize: 13, resize: "vertical" }}
            />
          </div>

          <p aria-label="Linhas reconhecidas" style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 14 }}>
            {parsed.length > 0
              ? `${parsed.length} linha(s) reconhecida(s) — ${ehOfx ? "OFX" : "CSV"}`
              : "Cole o extrato para reconhecer as linhas."}
          </p>

          <button
            type="submit"
            aria-label="Importar extrato"
            disabled={parsed.length === 0 || carregando}
            style={{ ...BOTAO, opacity: parsed.length === 0 || carregando ? 0.5 : 1 }}
          >
            {carregando ? "Importando…" : "Importar extrato"}
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
            Reimportar o mesmo arquivo OFX não duplica linha (FITID do banco). Conciliar é controle —
            nada muda no diário.
          </p>
        </form>

        <aside aria-label="Importações" style={CARD}>
          <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "var(--navy)" }}>Importações</h2>
          {extratos.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>Nenhum extrato importado ainda.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13.5 }}>
              {extratos.slice(0, 8).map((e) => (
                <li key={e.id} style={{ borderTop: "1px solid var(--ink-faint)", padding: "10px 0" }}>
                  <b>{e.fonte.toUpperCase()}</b> — {e.arquivoNome || "colado na tela"} ·{" "}
                  {diaMes(String(e.criadoEm).slice(0, 10))}/{String(e.criadoEm).slice(0, 4)}
                  <br />
                  <span style={{ color: "var(--ink-soft)" }}>
                    {e.linhasNovas}/{e.linhasTotal} linhas novas · competência{" "}
                    {rotuloMes(e.competencia.slice(0, 7))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <section aria-label="Linhas do extrato" style={CARD}>
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
            Extrato ({rotuloMes(mesAtivo)})
          </h2>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ fontSize: 12.5, color: "var(--ink-soft)", display: "flex", gap: 8, alignItems: "center" }}>
              Mês
              <select
                aria-label="Mês do extrato"
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
            <label style={{ fontSize: 12.5, color: "var(--ink-soft)", display: "flex", gap: 8, alignItems: "center" }}>
              Status
              <select
                aria-label="Status das linhas"
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value)}
                style={{ ...INPUT, width: "auto", fontWeight: 700 }}
              >
                <option value="todas">Todas</option>
                <option value="pendentes">Pendentes</option>
                <option value="conciliadas">Conciliadas</option>
                <option value="ignoradas">Ignoradas</option>
              </select>
            </label>
          </div>
        </div>

        {doMes.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>Nenhuma linha neste mês.</p>
        ) : visiveis.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>Nenhuma linha com este status.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 12, textTransform: "uppercase" }}>
                <th style={{ paddingBottom: 10 }}>Data</th>
                <th style={{ paddingBottom: 10 }}>Descrição</th>
                <th style={{ paddingBottom: 10, textAlign: "right" }}>Valor</th>
                <th style={{ paddingBottom: 10 }}>Status</th>
                <th style={{ paddingBottom: 10 }}>Conferência</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l, i) => {
                const n = i + 1;
                const sug = sugestaoPara(l, candsLivres);
                const escolhido = escolhas[l.id] ?? sug?.ref ?? "";
                return (
                  <tr key={l.id} style={{ borderTop: "1px solid var(--ink-faint)" }}>
                    <td style={{ padding: "11px 0", color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                      {diaMes(l.data)}
                    </td>
                    <td style={{ padding: "11px 0", fontWeight: 600, color: "var(--ink)" }}>{l.descricao}</td>
                    <td
                      style={{
                        padding: "11px 0",
                        textAlign: "right",
                        fontWeight: 700,
                        color: l.valor >= 0 ? "#1F8A4C" : "#B42318",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {brl(l.valor)}
                    </td>
                    <td style={{ padding: "11px 0" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 999,
                          background:
                            l.status === "conciliada"
                              ? "var(--blue-100)"
                              : l.status === "ignorada"
                                ? "#F3F4F6"
                                : "#FEF3C7",
                          color:
                            l.status === "conciliada"
                              ? "var(--blue-600)"
                              : l.status === "ignorada"
                                ? "var(--ink-soft)"
                                : "#B45309",
                        }}
                      >
                        {l.status === "conciliada" ? "Conciliada" : l.status === "ignorada" ? "Ignorada" : "Pendente"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 0" }}>
                      {l.status === "pendente" ? (
                        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <select
                            aria-label={`Candidato ${n}`}
                            value={escolhido}
                            onChange={(e) => setEscolhas((x) => ({ ...x, [l.id]: e.target.value }))}
                            style={{ ...INPUT, width: "auto", maxWidth: 340, fontSize: 13 }}
                          >
                            <option value="">Escolha o que conciliar…</option>
                            {candsLivres.map((c) => (
                              <option key={c.ref} value={c.ref}>
                                {c.descricao} · {brl(c.valor)} · {diaMes(c.data)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            aria-label={`Conciliar linha ${n}`}
                            disabled={!escolhido || carregando}
                            onClick={() => agir(l.id, "conciliar", escolhido)}
                            style={{
                              ...BOTAO_PEQUENO,
                              background: "var(--navy)",
                              color: "#FFFFFF",
                              border: "none",
                              opacity: !escolhido || carregando ? 0.5 : 1,
                            }}
                          >
                            Conciliar
                          </button>
                          <button
                            type="button"
                            aria-label={`Ignorar linha ${n}`}
                            disabled={carregando}
                            onClick={() => agir(l.id, "ignorar")}
                            style={{ ...BOTAO_PEQUENO, opacity: carregando ? 0.5 : 1 }}
                          >
                            Ignorar
                          </button>
                        </span>
                      ) : l.status === "conciliada" ? (
                        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                            {candidatos.find((c) => c.ref === `${l.refTipo}:${l.refId}`)?.descricao ??
                              "vínculo registrado"}
                          </span>
                          <button
                            type="button"
                            aria-label={`Desconciliar linha ${n}`}
                            disabled={carregando}
                            onClick={() => agir(l.id, "desconciliar")}
                            style={{ ...BOTAO_PEQUENO, opacity: carregando ? 0.5 : 1 }}
                          >
                            Desconciliar
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Reabrir linha ${n}`}
                          disabled={carregando}
                          onClick={() => agir(l.id, "reabrir")}
                          style={{ ...BOTAO_PEQUENO, opacity: carregando ? 0.5 : 1 }}
                        >
                          Reabrir
                        </button>
                      )}
                    </td>
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
