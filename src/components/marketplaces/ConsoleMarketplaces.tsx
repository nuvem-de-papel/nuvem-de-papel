"use client";

import { useState, useTransition } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  adicionarConta,
  enfileirarPing,
  enfileirarPublicacao,
  enfileirarValidacao,
  processarFila,
  reprocessarJob,
  removerConta,
  type ResultadoFila,
} from "@/app/configuracoes/marketplaces/actions";
import type {
  CanalTela,
  ContaTela,
  JobTela,
  ListingTela,
  ProdutoTela,
} from "@/app/configuracoes/marketplaces/page";

// Console de Marketplaces - Modulo 1 (kernel): canais semeados, contas,
// anuncios na fila, fila de jobs e o endpoint de webhook. Nenhuma chamada de
// API externa acontece aqui: com o registro de adaptadores vazio (M2 liga o
// Mercado Livre), o job de publicacao/webhook falha com "adaptador pendente"
// de proposito - e a tela mostra isso em vez de fingir sucesso.

type Feedback = { tipo: "erro" | "sucesso"; texto: string } | null;

const CARD: React.CSSProperties = {
  background: "var(--bg-cloud, #fff)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
};

const INPUT: React.CSSProperties = {
  padding: "10px 12px",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "'Open Sans', sans-serif",
  background: "#FFFFFF",
  outline: "none",
  flex: 1,
  minWidth: 0,
};

const BTN: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 999,
  border: "none",
  background: "var(--pink-600)",
  color: "#FFFFFF",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const BTN_SEC: React.CSSProperties = {
  ...BTN,
  background: "transparent",
  color: "var(--ink-soft, #5b5563)",
  border: "1.5px solid var(--border)",
};

const TH: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--ink-soft)",
  padding: "10px 10px",
  borderBottom: "1px solid var(--border)",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const TD: React.CSSProperties = {
  fontSize: 13.5,
  padding: "11px 10px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
  color: "var(--ink)",
};

function chip(texto: string, bg: string, fg: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 700,
    background: bg,
    color: fg,
    whiteSpace: "nowrap",
  };
}

const STATUS_JOB: Record<string, { rotulo: string; bg: string; fg: string }> = {
  pendente: { rotulo: "Pendente", bg: "#FEF3C7", fg: "#92400E" },
  processando: { rotulo: "Processando", bg: "#DBEAFE", fg: "#1E40AF" },
  concluido: { rotulo: "Concluído", bg: "#DCFCE7", fg: "#166534" },
  falhou: { rotulo: "Falhou", bg: "#FDECEA", fg: "#B3261E" },
};

const STATUS_LISTING: Record<string, { rotulo: string; bg: string; fg: string }> = {
  pendente: { rotulo: "Pendente", bg: "#FEF3C7", fg: "#92400E" },
  publicado: { rotulo: "Publicado", bg: "#DCFCE7", fg: "#166534" },
  erro: { rotulo: "Erro", bg: "#FDECEA", fg: "#B3261E" },
  removido: { rotulo: "Removido", bg: "#E5E7EB", fg: "#374151" },
};

function dataHoraBR(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" });
}

export function ConsoleMarketplaces({
  canais,
  contas,
  jobs,
  produtos,
  listings,
  totalContas,
  pendentes,
  falhas,
}: {
  canais: CanalTela[];
  contas: ContaTela[];
  jobs: JobTela[];
  produtos: ProdutoTela[];
  listings: ListingTela[];
  totalContas: number;
  pendentes: number;
  falhas: number;
}) {
  const [, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [canalAberto, setCanalAberto] = useState<string | null>(null);
  const [labelPorCanal, setLabelPorCanal] = useState<Record<string, string>>({});
  const [selConta, setSelConta] = useState("");
  const [selItem, setSelItem] = useState("");

  const generalistas = canais.filter((c) => c.segmento === "generalista").length;
  const nichados = canais.filter((c) => c.segmento === "nicho").length;

  // a selecao cai no primeiro da lista quando a conta/produto sai de cena
  const contaEfetiva = contas.some((c) => c.id === selConta)
    ? selConta
    : contas[0]?.id ?? "";
  const itemEfetiva = produtos.some((p) => p.id === selItem)
    ? selItem
    : produtos[0]?.id ?? "";

  function executar(acao: () => Promise<unknown>, sucesso?: string) {
    startTransition(async () => {
      const r = (await acao()) as { ok: boolean; erro?: string; mensagem?: string };
      if (!r?.ok) {
        setFeedback({ tipo: "erro", texto: r?.erro ?? "Falha inesperada." });
        return;
      }
      const texto = sucesso ?? r.mensagem ?? "Pronto.";
      setFeedback({ tipo: "sucesso", texto });
    });
  }

  function processar() {
    startTransition(async () => {
      const r: ResultadoFila = await processarFila();
      if (!r.ok) {
        setFeedback({ tipo: "erro", texto: r.erro });
        return;
      }
      setFeedback({
        tipo: "sucesso",
        texto: `Processados: ${r.processados} · Concluídos: ${r.concluidos} · Retentativas: ${r.retentativas} · Falhas: ${r.falhas}`,
      });
    });
  }

  function salvarConta(slug: string) {
    const label = (labelPorCanal[slug] ?? "").trim();
    executar(() => adicionarConta({ canal: slug, label }), "Conta criada.");
    if (label.length >= 2) setCanalAberto(null);
  }

  return (
    <div>
      <PageHeader
        titulo="Marketplaces"
        subtitulo={`${canais.length} canais · ${totalContas} contas · fila ${pendentes} pendente(s)`}
      />

      {feedback && (
        <p
          role="status"
          style={{
            background: feedback.tipo === "erro" ? "#FDECEA" : "var(--blue-100, #e3f0ff)",
            color: feedback.tipo === "erro" ? "var(--red-600, #b3261e)" : "var(--blue-600, #2456a6)",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13.5,
            margin: "0 0 16px",
          }}
        >
          {feedback.texto}
        </p>
      )}

      {/* ------------------------------------------------ resumo --------- */}
      <section style={{ ...CARD, marginBottom: 22, display: "flex", gap: 26, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Canais</div>
          <div style={{ fontSize: 20, fontWeight: 800 }} aria-label="Total de canais">
            {canais.length}
            <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8 }}>
              {generalistas} generalistas · {nichados} nichados
            </span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Contas</div>
          <div style={{ fontSize: 20, fontWeight: 800 }} aria-label="Total de contas">
            {totalContas}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Fila pendente</div>
          <div style={{ fontSize: 20, fontWeight: 800 }} aria-label="Fila pendente">
            {pendentes}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Jobs com falha</div>
          <div style={{ fontSize: 20, fontWeight: 800 }} aria-label="Jobs com falha">
            {falhas}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ canais --------- */}
      <section style={{ ...CARD, marginBottom: 22 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 14px" }}>Canais disponíveis</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: 12,
          }}
        >
          {canais.map((c) => {
            const contaDoCanal = contas.find((k) => k.channel_id === c.id);
            const aberto = canalAberto === c.id;
            return (
              <div
                key={c.id}
                aria-label={`Canal ${c.name}`}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 14,
                  display: "grid",
                  gap: 8,
                  alignContent: "start",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{c.name}</strong>
                  <span
                    style={chip(
                      c.segmento === "generalista" ? "Generalista" : "Nicho",
                      c.segmento === "generalista" ? "#DBEAFE" : "#F5E6FE",
                      c.segmento === "generalista" ? "#1E40AF" : "#6B21A8"
                    )}
                  >
                    {c.segmento === "generalista" ? "Generalista" : "Nicho"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {c.api_docs ? (
                    <a href={c.api_docs} target="_blank" rel="noreferrer">
                      docs da API
                    </a>
                  ) : (
                    "docs da API: a confirmar"
                  )}
                </div>
                <div style={{ fontSize: 12.5 }}>
                  conta: <strong>{contaDoCanal ? contaDoCanal.label : "nenhuma"}</strong>
                </div>
                {!contaDoCanal &&
                  (aberto ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <input
                        value={labelPorCanal[c.slug] ?? ""}
                        aria-label={`Nome da conta ${c.name}`}
                        placeholder="ex.: Loja principal"
                        onChange={(e) =>
                          setLabelPorCanal((s) => ({ ...s, [c.slug]: e.target.value }))
                        }
                        style={INPUT}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          aria-label={`Salvar conta ${c.name}`}
                          onClick={() => salvarConta(c.slug)}
                          style={BTN}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          aria-label={`Cancelar conta ${c.name}`}
                          onClick={() => setCanalAberto(null)}
                          style={BTN_SEC}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Adicionar conta ${c.name}`}
                      onClick={() => setCanalAberto(c.id)}
                      style={{ ...BTN, justifySelf: "start" }}
                    >
                      Adicionar conta
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------ contas --------- */}
      <section style={{ ...CARD, marginBottom: 22 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 14px" }}>Contas conectadas</h2>
        {contas.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>
            Nenhuma conta cadastrada - adicione em um canal acima.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>Canal</th>
                <th style={TH}>Conta</th>
                <th style={TH}>Status</th>
                <th style={TH}>Último ping</th>
                <th style={TH}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((k) => (
                <tr key={k.id}>
                  <td style={TD}>{k.canal?.name ?? "—"}</td>
                  <td style={TD}>{k.label}</td>
                  <td style={TD}>
                    <span
                      style={chip(
                        k.status === "conectado"
                          ? "Conectada"
                          : k.status === "erro"
                            ? "Erro"
                            : "Desconectada",
                        k.status === "conectado"
                          ? "#DCFCE7"
                          : k.status === "erro"
                            ? "#FDECEA"
                            : "#E5E7EB",
                        k.status === "conectado"
                          ? "#166534"
                          : k.status === "erro"
                            ? "#B3261E"
                            : "#374151"
                      )}
                    >
                      {k.status === "conectado"
                        ? "Conectada"
                        : k.status === "erro"
                          ? "Erro"
                          : "Desconectada"}
                    </span>
                  </td>
                  <td style={TD} aria-label={`Ultimo ping ${k.label}`}>
                    {dataHoraBR(k.last_ping_at) ?? "nunca"}
                  </td>
                  <td style={TD}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        aria-label={`Ping ${k.label}`}
                        onClick={() => executar(() => enfileirarPing(k.id), "Ping na fila.")}
                        style={BTN_SEC}
                      >
                        Ping
                      </button>
                      <button
                        type="button"
                        aria-label={`Remover conta ${k.label}`}
                        onClick={() => {
                          if (window.confirm(`Remover a conta "${k.label}"?`)) {
                            executar(() => removerConta(k.id), "Conta removida.");
                          }
                        }}
                        style={BTN_SEC}
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "10px 0 0" }}>
          Status OAuth: a conta nasce &quot;Desconectada&quot;; a conexão real entra no Modulo 2
          (Mercado Livre) com o ciclo de token completo.
        </p>
      </section>

      {/* --------------------------------------------- anuncios ---------- */}
      <section style={{ ...CARD, marginBottom: 22 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 14px" }}>Anúncios</h2>
        {contas.length === 0 || produtos.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>
            {contas.length === 0
              ? "Cadastre uma conta para montar anúncios."
              : "Cadastre produtos para montar anúncios."}
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <select
                aria-label="Conta do anuncio"
                value={contaEfetiva}
                onChange={(e) => setSelConta(e.target.value)}
                style={{ ...INPUT, width: "auto", minWidth: 220 }}
              >
                {contas.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.canal?.name ?? "—"} · {k.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Produto para anuncio"
                value={itemEfetiva}
                onChange={(e) => setSelItem(e.target.value)}
                style={{ ...INPUT, width: "auto", minWidth: 260 }}
              >
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} - {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Validar produto"
                onClick={() => executar(() => enfileirarValidacao(contaEfetiva, itemEfetiva), "Validação na fila.")}
                style={BTN_SEC}
              >
                Validar dados do produto
              </button>
              <button
                type="button"
                aria-label="Enfileirar publicacao"
                onClick={() => executar(() => enfileirarPublicacao(contaEfetiva, itemEfetiva))}
                style={BTN}
              >
                Publicar na fila
              </button>
            </div>

            {listings.length === 0 ? (
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>
                Nenhum anúncio ainda.
              </p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>Produto</th>
                    <th style={TH}>Conta</th>
                    <th style={TH}>Status</th>
                    <th style={TH}>Última mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => {
                    const st = STATUS_LISTING[l.status] ?? STATUS_LISTING.pendente;
                    return (
                      <tr key={l.id} aria-label={`Anuncio ${l.item?.sku ?? l.id}`}>
                        <td style={TD}>
                          {l.item ? `${l.item.sku} - ${l.item.name}` : "—"}
                        </td>
                        <td style={TD}>{l.conta?.label ?? "—"}</td>
                        <td style={TD}>
                          <span style={chip(st.rotulo, st.bg, st.fg)}>{st.rotulo}</span>
                        </td>
                        <td style={TD}>{l.last_error ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* ------------------------------------------------ fila ---------- */}
      <section style={{ ...CARD, marginBottom: 22 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0 }}>Fila de sincronização</h2>
          <button type="button" aria-label="Processar fila" onClick={processar} style={BTN}>
            Processar fila
          </button>
        </div>
        {jobs.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>
            Fila vazia - use Ping, Validação ou Publicação para enfileirar.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>Tipo</th>
                <th style={TH}>Canal</th>
                <th style={TH}>Conta</th>
                <th style={TH}>Status</th>
                <th style={TH}>Tentativas</th>
                <th style={TH}>Próxima</th>
                <th style={TH}>Resultado / erro</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const st = STATUS_JOB[j.status] ?? STATUS_JOB.pendente;
                const msg = j.status === "concluido" ? j.result : j.last_error;
                return (
                  <tr key={j.id}>
                    <td style={TD}>{j.tipo}</td>
                    <td style={TD}>{j.canal?.slug ?? "—"}</td>
                    <td style={TD}>{j.conta?.label ?? "—"}</td>
                    <td style={TD}>
                      <span style={chip(st.rotulo, st.bg, st.fg)}>{st.rotulo}</span>
                    </td>
                    <td style={TD}>
                      {j.attempts}/{j.max_attempts}
                    </td>
                    <td style={TD}>{dataHoraBR(j.next_run_at) ?? "—"}</td>
                    <td style={TD}>{msg ?? "—"}</td>
                    <td style={TD}>
                      {j.status === "falhou" && (
                        <button
                          type="button"
                          aria-label={`Reprocessar job ${j.id}`}
                          onClick={() => executar(() => reprocessarJob(j.id), "Job devolvido à fila.")}
                          style={BTN_SEC}
                        >
                          Reprocessar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "10px 0 0" }}>
          Retentativas usam backoff exponencial (2^n segundos, teto de 5 min); job que estoura as
          tentativas fica em &quot;Falhou&quot; até alguém reprocessar.
        </p>
      </section>

      {/* ---------------------------------------------- webhooks -------- */}
      <section style={CARD}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Webhooks dos canais</h2>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0, lineHeight: 1.6 }}>
          Endpoint único: <code>POST /api/webhooks/marketplace</code> com o header{" "}
          <code>x-marketplace-secret</code> (= variável <code>MARKETPLACE_WEBHOOK_SECRET</code>).
          Sem segredo configurado o endpoint responde 503; sem o header, 401. O corpo pede{" "}
          <code>channel_slug</code>, <code>event_id</code> e <code>topic</code> - evento repetido é
          ignorado (idempotente) e o processamento roda na fila, nunca dentro da requisição.
        </p>
      </section>
    </div>
  );
}
