"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarRecebimento } from "@/app/portal/fornecedor/actions";

export type ItemFornecedor = {
  id: string;
  sku: string;
  nome: string;
  quantidade: number;
  recebido: number;
  custo: number;
};

export type PedidoFornecedor = {
  id: string;
  codigo: string;
  status: string;
  total: number;
  notas: string | null;
  criadoEm: string;
  itens: ItemFornecedor[];
};

type Feedback = { tipo: "erro" | "aviso"; texto: string } | null;

const INPUT: React.CSSProperties = {
  padding: "9px 12px",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "'Open Sans', sans-serif",
  background: "#FFFFFF",
  outline: "none",
  width: 110,
};

const BTN: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 999,
  border: "none",
  background: "var(--pink-600)",
  color: "#FFFFFF",
  fontWeight: 700,
  fontSize: 13.5,
  cursor: "pointer",
};

const CHIP: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 10px",
  borderRadius: "var(--radius-chip)",
  display: "inline-block",
};

const STATUS_STYLE: Record<string, { fundo: string; cor: string; rotulo: string }> = {
  aberto: { fundo: "var(--blue-100)", cor: "var(--blue-600)", rotulo: "Aberto" },
  parcial: { fundo: "#FEF3C7", cor: "#B45309", rotulo: "Parcial" },
  recebido: { fundo: "#DCFCE7", cor: "#166534", rotulo: "Recebido" },
  cancelado: { fundo: "var(--bg-cotton)", cor: "var(--ink-soft)", rotulo: "Cancelado" },
};

function brl(v: number): string {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ConsoleFornecedor({
  fornecedor,
  pedidos,
}: {
  fornecedor: string;
  pedidos: PedidoFornecedor[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});

  function registrar(pedido: PedidoFornecedor) {
    setFeedback(null);
    const itens = pedido.itens
      .filter((i) => i.recebido < i.quantidade)
      .map((i) => ({
        poiId: i.id,
        qty: Number(quantidades[`${pedido.id}:${i.id}`] ?? 0),
      }))
      .filter((i) => i.qty > 0);
    if (itens.length === 0) {
      setFeedback({ tipo: "erro", texto: "Informe a quantidade recebida de ao menos um item." });
      return;
    }
    startTransition(async () => {
      const r = await registrarRecebimento({ poId: pedido.id, itens });
      if (r.ok) {
        setFeedback({
          tipo: "aviso",
          texto: `Recebimento registrado — ${brl(r.total)} (nota gerada).`,
        });
        setQuantidades((q) => {
          const novo = { ...q };
          for (const k of Object.keys(novo)) {
            if (k.startsWith(pedido.id + ":")) delete novo[k];
          }
          return novo;
        });
        router.refresh();
      } else {
        setFeedback({ tipo: "erro", texto: r.erro });
      }
    });
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 32, marginBottom: 8, color: "var(--ink)" }}>
        Portal do Fornecedor
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        <strong>{fornecedor}</strong> · registre o recebimento dos pedidos — dá entrada
        no estoque da loja e gera o título a pagar.
      </p>

      {feedback && (
        <p
          style={{
            background: feedback.tipo === "erro" ? "#FDECEC" : "#DCFCE7",
            color: feedback.tipo === "erro" ? "#C62828" : "#166534",
            fontSize: 13.5,
            fontWeight: 600,
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          {feedback.texto}
        </p>
      )}

      {pedidos.length === 0 ? (
        <p style={{ color: "var(--ink-soft)", fontSize: 15 }}>
          Nenhum pedido de compra recebido ainda.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {pedidos.map((p) => {
            const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.aberto;
            const pendentes = p.itens.filter((i) => i.recebido < i.quantidade);
            const fechado = p.status === "recebido" || p.status === "cancelado";
            return (
              <div
                key={p.id}
                style={{
                  background: "var(--bg-cloud)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-card)",
                  padding: 24,
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 16 }}>
                      {p.codigo}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--ink-soft)", marginLeft: 10 }}>
                      {brl(p.total)}
                    </span>
                  </div>
                  <span style={{ ...CHIP, background: st.fundo, color: st.cor }}>{st.rotulo}</span>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        color: "var(--ink-soft)",
                        fontSize: 12,
                        textTransform: "uppercase",
                      }}
                    >
                      <th style={{ paddingBottom: 8 }}>Item</th>
                      <th style={{ paddingBottom: 8, textAlign: "right" }}>Pedido</th>
                      <th style={{ paddingBottom: 8, textAlign: "right" }}>Recebido</th>
                      <th style={{ paddingBottom: 8, textAlign: "right" }}>Receber agora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.itens.map((i) => {
                      const falta = i.quantidade - i.recebido;
                      return (
                        <tr key={i.id} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 0" }}>
                            <span style={{ color: "var(--ink)" }}>{i.nome}</span>
                            <span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)" }}>
                              {i.sku} · {brl(i.custo)}/un
                            </span>
                          </td>
                          <td style={{ padding: "10px 0", textAlign: "right" }}>
                            {i.quantidade}
                          </td>
                          <td style={{ padding: "10px 0", textAlign: "right" }}>
                            {i.recebido}
                            {falta > 0 && (
                              <span style={{ fontSize: 12, color: "#B45309", marginLeft: 6 }}>
                                (falta {falta})
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "10px 0", textAlign: "right" }}>
                            {falta > 0 && !fechado && (
                              <input
                                type="number"
                                min={1}
                                max={falta}
                                placeholder="0"
                                value={quantidades[`${p.id}:${i.id}`] ?? ""}
                                onChange={(e) =>
                                  setQuantidades((q) => ({
                                    ...q,
                                    [`${p.id}:${i.id}`]: e.target.value,
                                  }))
                                }
                                style={{ ...INPUT, display: "inline-block" }}
                                aria-label={`Recebido agora ${i.sku}`}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {!fechado && pendentes.length > 0 && (
                  <div style={{ marginTop: 16, textAlign: "right" }}>
                    <button
                      disabled={pendente}
                      onClick={() => registrar(p)}
                      style={{ ...BTN, opacity: pendente ? 0.7 : 1 }}
                    >
                      {pendente ? "Registrando…" : "Registrar recebimento"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
