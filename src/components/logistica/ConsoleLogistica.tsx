"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  avancarExpedicao,
  cancelarPedidoNaoPago,
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

export function ConsoleLogistica({ fila, estoque }: { fila: PedidoFila[]; estoque: ItemEstoque[] }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [formItem, setFormItem] = useState(estoque[0]?.id ?? "");
  const [formTipo, setFormTipo] = useState("entrada");
  const [formQtd, setFormQtd] = useState(1);
  const [formNotas, setFormNotas] = useState("");

  function rodar(acao: () => Promise<{ ok: boolean; erro?: string; msg?: string }>) {
    startTransition(async () => {
      const r = await acao();
      setAviso(r.ok ? { tipo: "ok", texto: r.msg ?? "OK" } : { tipo: "erro", texto: r.erro ?? "Falha" });
      if (r.ok) router.refresh();
    });
  }

  const proximo: Record<string, { de: string; para: string; label: string; bg: string }> = {
    pago: { de: "pago", para: "processando", label: "Separar", bg: "var(--navy)" },
    processando: { de: "processando", para: "em_rota", label: "Enviar", bg: "var(--blue-600)" },
    em_rota: { de: "em_rota", para: "entregue", label: "Entregue", bg: "#16A34A" },
  };

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "26px 24px 60px" }}>
      <h1 className="display" style={{ fontSize: 26, color: "var(--navy)", margin: "0 0 4px" }}>
        Logística
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 18px" }}>
        Fila de expedição dos pedidos pagos e estoque da loja.
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

      <section
        style={{
          background: "var(--bg-cloud)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 18,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--navy)" }}>Fila de expedição</h2>
        {fila.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>
            Nenhum pedido aguardando separação.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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
                  const accao = proximo[p.status];
                  return (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
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
                      <td style={{ padding: "9px 8px" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          {accao && (
                            <button
                              disabled={pendente}
                              onClick={() => rodar(() => avancarExpedicao(p.id, accao.de, accao.para))}
                              style={{ ...BTN, background: accao.bg, color: "#FFF" }}
                            >
                              {accao.label}
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
                      </td>
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
