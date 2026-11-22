"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  avancarExpedicao,
  cancelarPedidoNaoPago,
  conferirPagamentoMP,
  registrarMovimentoEstoque,
} from "@/app/logistica/actions";

export type PedidoFila = {
  id: string;
  status: string;
  total_amount: number;
  created_at: string;
  payment_method: string | null;
  cliente: string;
  itens: number;
  /** so na coluna Entregue: quando a trilha `logistica.avancar` marcou entregue */
  entregue_em?: string | null;
};

export type ItemEstoque = {
  id: string;
  sku: string;
  name: string;
  min_stock: number;
  /** null = item sem controle de estoque (ilimitado até a primeira entrada). */
  disponivel: number | null;
  fisico: number | null;
};

const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  aguardando_pagamento: { label: "Aguardando pgto", bg: "#FFF4D6", fg: "#8A6400" },
  pago: { label: "Pago", bg: "#E0F2FE", fg: "#075985" },
  processando: { label: "Separando", bg: "#EDE9FE", fg: "#5B21B6" },
  em_rota: { label: "Em rota", bg: "#FCE7F3", fg: "#9D174D" },
  entregue: { label: "Entregue", bg: "#DCFCE7", fg: "#166534" },
  cancelado: { label: "Cancelado", bg: "#FEE2E2", fg: "#991B1B" },
};

// Kanban (22/11/2026): arrastar o cartao faz o MESMO que o botao da etapa —
// so aceita soltar na proxima coluna; o servidor confere a transicao de novo
// (`avancarExpedicao` com guarda `.in("status",[de])`).
const TRANSICAO: Record<string, string> = { pago: "processando", processando: "em_rota", em_rota: "entregue" };

const COLUNAS = (["aguardando_pagamento", "pago", "processando", "em_rota", "entregue"] as const).map((status) => ({
  status,
  label: status === "aguardando_pagamento" ? "Aguardando pagamento" : STATUS_BADGE[status].label,
  fg: STATUS_BADGE[status].fg,
}));

const VISTA_KEY = "np-logistica-vista";

const PAGAMENTO: Record<string, string> = {
  pix: "Pix",
  cartao: "Cartão",
  boleto: "Boleto",
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

function dataCurta(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function rotulo(status: string) {
  return COLUNAS.find((c) => c.status === status)?.label ?? STATUS_BADGE[status]?.label ?? status;
}

export function ConsoleLogistica({
  fila,
  entregues,
  estoque,
}: {
  fila: PedidoFila[];
  entregues: PedidoFila[];
  estoque: ItemEstoque[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [vista, setVista] = useState<"quadro" | "lista">("quadro");
  const [arrastando, setArrastando] = useState<{ id: string; de: string } | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  const [formItem, setFormItem] = useState(estoque[0]?.id ?? "");
  const [formTipo, setFormTipo] = useState("entrada");
  const [formQtd, setFormQtd] = useState(1);
  const [formNotas, setFormNotas] = useState("");

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VISTA_KEY);
      if (v === "lista" || v === "quadro") setVista(v);
    } catch {
      /* sem storage: fica no quadro */
    }
  }, []);

  function trocarVista(v: "quadro" | "lista") {
    setVista(v);
    try {
      window.localStorage.setItem(VISTA_KEY, v);
    } catch {
      /* ignora */
    }
  }

  function rodar(acao: () => Promise<{ ok: boolean; erro?: string; msg?: string }>) {
    startTransition(async () => {
      const r = await acao();
      setAviso(r.ok ? { tipo: "ok", texto: r.msg ?? "OK" } : { tipo: "erro", texto: r.erro ?? "Falha" });
      if (r.ok) router.refresh();
    });
  }

  function soltar(id: string, de: string, para: string) {
    setArrastando(null);
    setSobre(null);
    if (de === para) return;
    const certo = TRANSICAO[de];
    if (certo !== para) {
      setAviso({
        tipo: "erro",
        texto: certo
          ? `Não dá para mover de ${rotulo(de)} para ${rotulo(para)}. A próxima etapa é ${rotulo(certo)}.`
          : `Pedido em ${rotulo(de)} não avança pelo quadro.`,
      });
      return;
    }
    rodar(() => avancarExpedicao(id, de, para));
  }

  const proximo: Record<string, { de: string; para: string; label: string; bg: string }> = {
    pago: { de: "pago", para: "processando", label: "Separar", bg: "var(--navy)" },
    processando: { de: "processando", para: "em_rota", label: "Enviar", bg: "var(--blue-600)" },
    em_rota: { de: "em_rota", para: "entregue", label: "Entregue", bg: "#16A34A" },
  };

  function acoes(p: PedidoFila) {
    const accao = proximo[p.status];
    const temAlgo = accao || p.status === "aguardando_pagamento";
    if (!temAlgo) return null;
    return (
      <div className="logistica-acoes">
        {accao && (
          <button
            disabled={pendente}
            onClick={() => rodar(() => avancarExpedicao(p.id, accao.de, accao.para))}
            style={{ ...BTN, background: accao.bg, color: "#FFF" }}
          >
            {accao.label}
          </button>
        )}
        {p.status === "aguardando_pagamento" && p.payment_method && (
          <button
            disabled={pendente}
            aria-label={`Conferir pagamento ${p.id.slice(0, 8)}`}
            title="Consulta o Mercado Pago e marca como pago se houver pagamento aprovado"
            onClick={() => rodar(() => conferirPagamentoMP(p.id))}
            style={{ ...BTN, background: "#E0F2FE", color: "#075985" }}
          >
            Conferir pagamento
          </button>
        )}
        {p.status === "aguardando_pagamento" && (
          <button
            disabled={pendente}
            onClick={() => rodar(() => cancelarPedidoNaoPago(p.id))}
            style={{ ...BTN, background: "#FEE2E2", color: "#991B1B" }}
          >
            Cancelar
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "26px 24px 60px" }}>
      <PageHeader
        titulo="Logística"
        subtitulo="Fila de expedição dos pedidos pagos e estoque da loja."
        voltarPara="/crm"
      />

      <div style={{ marginBottom: 16 }}>
        <a
          href="/vendas/recuperacao"
          aria-label="Recuperação de carrinho"
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: "var(--navy)",
            textDecoration: "none",
            border: "1px solid var(--ink-faint)",
            borderRadius: 999,
            padding: "5px 14px",
            background: "#FFFFFF",
          }}
        >
          Recuperar carrinhos abandonados
        </a>
      </div>

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

      <section
        style={{
          background: "var(--bg-cloud)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 18,
          marginBottom: 20,
        }}
      >
        <div className="logistica-topo">
          <h2 style={{ fontSize: 16, margin: 0, color: "var(--navy)" }}>Fila de expedição</h2>
          <div className="logistica-vista" role="group" aria-label="Modo de exibição">
            <button type="button" aria-pressed={vista === "quadro"} onClick={() => trocarVista("quadro")}>
              Quadro
            </button>
            <button type="button" aria-pressed={vista === "lista"} onClick={() => trocarVista("lista")}>
              Ver em lista
            </button>
          </div>
        </div>

        {vista === "quadro" ? (
          <>
            <p className="kanban-dica">
              Arraste o cartão para a próxima coluna ou use o botão do cartão. Só a próxima etapa aceita o pedido.
            </p>
            <div className="kanban" aria-label="Quadro de expedição">
              {COLUNAS.map((col) => {
                const lista = col.status === "entregue" ? entregues : fila.filter((p) => p.status === col.status);
                const total = lista.reduce((s, p) => s + p.total_amount, 0);
                const alvo =
                  arrastando && sobre === col.status && arrastando.de !== col.status
                    ? TRANSICAO[arrastando.de] === col.status
                      ? " alvo-ok"
                      : " alvo-nao"
                    : "";
                return (
                  <section
                    key={col.status}
                    className={`kanban-col${alvo}`}
                    aria-label={`Coluna ${col.label}`}
                    data-coluna={col.status}
                    onDragOver={(e) => {
                      if (!arrastando) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = TRANSICAO[arrastando.de] === col.status ? "move" : "none";
                      if (sobre !== col.status) setSobre(col.status);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (arrastando) soltar(arrastando.id, arrastando.de, col.status);
                    }}
                  >
                    <header className="kanban-col-head" style={{ borderTopColor: col.fg }}>
                      <h3 style={{ color: col.fg }}>
                        {col.label} <span className="kanban-contagem">{lista.length}</span>
                      </h3>
                      <small>
                        {brl(total)}
                        {col.status === "entregue" ? " · 7 dias" : ""}
                      </small>
                    </header>
                    <div className="kanban-cards">
                      {lista.length === 0 ? (
                        <p className="kanban-vazio">Nenhum pedido.</p>
                      ) : (
                        lista.map((p) => {
                          const arrastavel = Boolean(TRANSICAO[p.status]) && !pendente;
                          return (
                            <article
                              key={p.id}
                              className={`kanban-card${arrastando?.id === p.id ? " arrastando" : ""}`}
                              data-pedido={p.id}
                              data-status={p.status}
                              aria-label={`Pedido ${p.id.slice(0, 8).toUpperCase()} de ${p.cliente}`}
                              draggable={arrastavel}
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", p.id);
                                setArrastando({ id: p.id, de: p.status });
                              }}
                              onDragEnd={() => {
                                setArrastando(null);
                                setSobre(null);
                              }}
                            >
                              <div className="kanban-card-linha">
                                <strong>{p.cliente}</strong>
                                <span className="kanban-codigo">#{p.id.slice(0, 8).toUpperCase()}</span>
                              </div>
                              <div className="kanban-card-linha kanban-card-info">
                                <span>
                                  {p.itens} {p.itens === 1 ? "item" : "itens"} ·{" "}
                                  {p.payment_method ? PAGAMENTO[p.payment_method] ?? p.payment_method : "—"}
                                </span>
                                <strong>{brl(p.total_amount)}</strong>
                              </div>
                              <div className="kanban-card-data">
                                {p.status === "entregue" && p.entregue_em
                                  ? `Entregue ${dataCurta(p.entregue_em)}`
                                  : `Criado ${dataCurta(p.created_at)}`}
                              </div>
                              {acoes(p)}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        ) : fila.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>Nenhum pedido aguardando separação.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table aria-label="Lista de expedição" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 11.5, textTransform: "uppercase" }}>
                  <th style={{ padding: "6px 8px" }}>Cliente</th>
                  <th style={{ padding: "6px 8px" }}>Itens</th>
                  <th style={{ padding: "6px 8px" }}>Total</th>
                  <th style={{ padding: "6px 8px" }}>Pagamento</th>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                  <th style={{ padding: "6px 8px" }}>Criado</th>
                  <th style={{ padding: "6px 8px" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {fila.map((p) => {
                  const badge = STATUS_BADGE[p.status] ?? { label: p.status, bg: "#EEE", fg: "#333" };
                  return (
                    <tr key={p.id} data-pedido={p.id} data-status={p.status} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "9px 8px", fontWeight: 600 }}>{p.cliente}</td>
                      <td style={{ padding: "9px 8px" }}>{p.itens}</td>
                      <td style={{ padding: "9px 8px" }}>{brl(p.total_amount)}</td>
                      <td style={{ padding: "9px 8px" }}>{p.payment_method ? PAGAMENTO[p.payment_method] ?? p.payment_method : "—"}</td>
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
                      <td style={{ padding: "9px 8px", color: "var(--ink-soft)" }}>{dataCurta(p.created_at)}</td>
                      <td style={{ padding: "9px 8px" }}>{acoes(p)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>


      <section
        style={{
          background: "var(--bg-cloud)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 18,
        }}
      >
        <h2 style={{ fontSize: 16, margin: "0 0 4px", color: "var(--navy)" }}>Estoque</h2>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 12px" }}>
          Item &ldquo;sem controle&rdquo; é ilimitado até a primeira entrada. O saldo nunca fica negativo:
          reservas do checkout disputam o mesmo saldo.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "flex-end",
            background: "var(--pink-100)",
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 14,
          }}
        >
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>
            Item
            <select
              value={formItem}
              onChange={(e) => setFormItem(e.target.value)}
              style={{ display: "block", marginTop: 4, minWidth: 240, padding: 8, borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}
            >
              {estoque.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.sku} — {i.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>
            Tipo
            <select
              value={formTipo}
              onChange={(e) => setFormTipo(e.target.value)}
              style={{ display: "block", marginTop: 4, padding: 8, borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}
            >
              <option value="entrada">Entrada (+)</option>
              <option value="devolucao">Devolução (+)</option>
              <option value="ajuste">Ajuste (±)</option>
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>
            Quantidade
            <input
              type="number"
              value={formQtd}
              onChange={(e) => setFormQtd(Number(e.target.value))}
              style={{ display: "block", marginTop: 4, width: 110, padding: 8, borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}
            />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", flex: 1, minWidth: 180 }}>
            Notas (opcional)
            <input
              value={formNotas}
              onChange={(e) => setFormNotas(e.target.value)}
              placeholder="NF, fornecedor, motivo…"
              style={{ display: "block", marginTop: 4, width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}
            />
          </label>
          <button
            disabled={pendente || !formItem}
            onClick={() =>
              rodar(() => registrarMovimentoEstoque(formItem, formTipo, formQtd, formNotas))
            }
            style={{ ...BTN, background: "var(--pink-600)", color: "#FFF", padding: "9px 18px" }}
          >
            Registrar
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 11.5, textTransform: "uppercase" }}>
                <th style={{ padding: "6px 8px" }}>SKU</th>
                <th style={{ padding: "6px 8px" }}>Produto</th>
                <th style={{ padding: "6px 8px" }}>Mínimo</th>
                <th style={{ padding: "6px 8px" }}>Físico</th>
                <th style={{ padding: "6px 8px" }}>Disponível</th>
              </tr>
            </thead>
            <tbody>
              {estoque.map((i) => {
                const semControle = i.disponivel === null;
                const disp = i.disponivel ?? -1;
                const baixo = !semControle && disp <= i.min_stock;
                return (
                  <tr key={i.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "9px 8px", fontWeight: 600 }}>{i.sku}</td>
                    <td style={{ padding: "9px 8px" }}>{i.name}</td>
                    <td style={{ padding: "9px 8px" }}>{i.min_stock}</td>
                    <td style={{ padding: "9px 8px" }}>{semControle ? "—" : i.fisico}</td>
                    <td style={{ padding: "9px 8px" }}>
                      {semControle ? (
                        <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>sem controle (ilimitado)</span>
                      ) : (
                        <span
                          style={{
                            fontWeight: 700,
                            color: disp === 0 ? "#991B1B" : baixo ? "#8A6400" : "#166534",
                          }}
                        >
                          {disp}
                          {baixo && disp > 0 ? " (baixo)" : ""}
                          {disp === 0 ? " (esgotado)" : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
