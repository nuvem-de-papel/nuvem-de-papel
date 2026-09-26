"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarFornecedor, criarPedidoCompra } from "@/app/compras/actions";

export type Fornecedor = {
  id: string;
  nome: string;
  contato: string | null;
  cnpj: string | null;
  vinculado: boolean;
  ativo: boolean;
};

export type ItemPedido = {
  id: string;
  sku: string;
  nome: string;
  quantidade: number;
  custo: number;
  total: number;
};

export type PedidoCompra = {
  id: string;
  codigo: string;
  status: string;
  total: number;
  notas: string | null;
  criadoEm: string;
  fornecedor: string;
  itens: ItemPedido[];
};

export type ItemCatalogo = { id: string; sku: string; nome: string };

type Feedback = { tipo: "erro" | "aviso"; texto: string } | null;

const INPUT: React.CSSProperties = {
  padding: "10px 12px",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "'Open Sans', sans-serif",
  background: "#FFFFFF",
  outline: "none",
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

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type LinhaItem = { itemId: string; qty: string; custo: string };

export function ConsoleCompras({
  fornecedores,
  pedidos,
  catalogo,
}: {
  fornecedores: Fornecedor[];
  pedidos: PedidoCompra[];
  catalogo: ItemCatalogo[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [emailUsuario, setEmailUsuario] = useState("");

  const [supplierId, setSupplierId] = useState("");
  const [notas, setNotas] = useState("");
  const [linhas, setLinhas] = useState<LinhaItem[]>([{ itemId: "", qty: "1", custo: "" }]);

  function executar(
    acao: () => Promise<{ ok: boolean; erro?: string; aviso?: string }>
  ): Promise<boolean> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const r = await acao();
        if (r.ok) {
          setFeedback(r.aviso ? { tipo: "aviso", texto: r.aviso } : null);
          router.refresh();
        } else {
          setFeedback({ tipo: "erro", texto: r.erro ?? "Falha na ação." });
        }
        resolve(r.ok);
      });
    });
  }

  async function handleFornecedor(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const ok = await executar(() =>
      criarFornecedor({ nome, emailContato: contato, cnpj, emailUsuario })
    );
    if (ok) {
      setNome("");
      setContato("");
      setCnpj("");
      setEmailUsuario("");
    }
  }

  async function handlePedido(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const itens = linhas
      .filter((l) => l.itemId)
      .map((l) => ({ itemId: l.itemId, qty: Number(l.qty), custo: Number(l.custo) }));
    if (!supplierId) {
      setFeedback({ tipo: "erro", texto: "Selecione o fornecedor." });
      return;
    }
    if (itens.length === 0) {
      setFeedback({ tipo: "erro", texto: "Adicione ao menos um item ao pedido." });
      return;
    }
    const ok = await executar(() => criarPedidoCompra({ supplierId, itens, notes: notas }));
    if (ok) {
      setSupplierId("");
      setNotas("");
      setLinhas([{ itemId: "", qty: "1", custo: "" }]);
    }
  }

  const card: React.CSSProperties = {
    background: "var(--bg-cloud)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-card)",
    padding: 24,
    boxShadow: "var(--shadow-card)",
    marginBottom: 28,
  };

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 32, marginBottom: 8, color: "var(--ink)" }}>
        Compras
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Pedidos de compra ao fornecedor. O recebimento é registrado pelo fornecedor
        no portal dele — dá entrada no estoque e gera o título a pagar.
      </p>

      {feedback && (
        <p
          style={{
            background: feedback.tipo === "erro" ? "#FDECEC" : "var(--blue-100)",
            color: feedback.tipo === "erro" ? "#C62828" : "var(--blue-600)",
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
        <div style={card}>
          <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>Novo fornecedor</h2>
          <form onSubmit={handleFornecedor} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <input
              type="text"
              required
              placeholder="Nome do fornecedor"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={{ ...INPUT, flex: "1 1 100%" }}
            />
            <input
              type="email"
              placeholder="E-mail de contato"
              value={contato}
              onChange={(e) => setContato(e.target.value)}
              style={{ ...INPUT, flex: "1 1 180px" }}
            />
            <input
              type="text"
              placeholder="CNPJ"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              style={{ ...INPUT, flex: "1 1 140px" }}
            />
            <input
              type="email"
              placeholder="E-mail do usuário fornecedor (opcional)"
              value={emailUsuario}
              onChange={(e) => setEmailUsuario(e.target.value)}
              style={{ ...INPUT, flex: "1 1 100%" }}
            />
            <button type="submit" disabled={pendente} style={{ ...BTN, opacity: pendente ? 0.7 : 1 }}>
              {pendente ? "Salvando…" : "Criar fornecedor"}
            </button>
          </form>
        </div>

        <div style={card}>
          <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>Novo pedido de compra</h2>
          <form onSubmit={handlePedido} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <select
              required
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              style={INPUT}
              aria-label="Fornecedor do pedido"
            >
              <option value="">Fornecedor…</option>
              {fornecedores
                .filter((f) => f.ativo)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                    {f.vinculado ? "" : " (sem usuário)"}
                  </option>
                ))}
            </select>

            {linhas.map((linha, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select
                  value={linha.itemId}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((l, i) => (i === idx ? { ...l, itemId: e.target.value } : l))
                    )
                  }
                  style={{ ...INPUT, flex: "2 1 200px" }}
                  aria-label={`Item ${idx + 1}`}
                >
                  <option value="">Item…</option>
                  {catalogo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.sku} — {c.nome}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  placeholder="Qtd"
                  value={linha.qty}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l))
                    )
                  }
                  style={{ ...INPUT, flex: "0 1 90px" }}
                  aria-label={`Quantidade ${idx + 1}`}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Custo unit."
                  value={linha.custo}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((l, i) => (i === idx ? { ...l, custo: e.target.value } : l))
                    )
                  }
                  style={{ ...INPUT, flex: "1 1 120px" }}
                  aria-label={`Custo unitário ${idx + 1}`}
                />
                {linhas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLinhas((ls) => ls.filter((_, i) => i !== idx))}
                    style={{ ...BTN, background: "var(--ink-soft)", padding: "10px 14px" }}
                    aria-label={`Remover item ${idx + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => setLinhas((ls) => [...ls, { itemId: "", qty: "1", custo: "" }])}
                style={{ ...BTN, background: "var(--blue-600)" }}
              >
                + Item
              </button>
            </div>

            <input
              type="text"
              placeholder="Observações (opcional)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              style={INPUT}
            />

            <button type="submit" disabled={pendente} style={{ ...BTN, opacity: pendente ? 0.7 : 1 }}>
              {pendente ? "Criando…" : "Criar pedido de compra"}
            </button>
          </form>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>
          Pedidos ({pedidos.length})
        </h2>
        {pedidos.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Nenhum pedido de compra ainda.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {pedidos.map((p) => {
              const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.aberto;
              return (
                <div
                  key={p.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 16,
                    background: "#FFFFFF",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700, color: "var(--ink)" }}>{p.codigo}</span>
                      <span style={{ fontSize: 13, color: "var(--ink-soft)", marginLeft: 10 }}>
                        {p.fornecedor} · {dataCurta(p.criadoEm)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ ...CHIP, background: st.fundo, color: st.cor }}>{st.rotulo}</span>
                      <span style={{ fontWeight: 700, color: "var(--ink)" }}>{brl(p.total)}</span>
                    </div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <tbody>
                      {p.itens.map((i) => (
                        <tr key={i.id} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "6px 0", color: "var(--ink-soft)" }}>{i.sku}</td>
                          <td style={{ padding: "6px 0", color: "var(--ink)" }}>{i.nome}</td>
                          <td style={{ padding: "6px 0", textAlign: "right" }}>
                            {i.quantidade} un.
                          </td>
                          <td style={{ padding: "6px 0", textAlign: "right", whiteSpace: "nowrap" }}>
                            {brl(i.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {p.notas && (
                    <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "8px 0 0" }}>
                      {p.notas}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
