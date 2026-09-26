"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abrirCaixa, fecharCaixa, movimentoCaixa, registrarVendaPdv } from "@/app/pdv/actions";

export type SessaoCaixa = { id: string; abertura: number; aberta_em: string };

export type ItemPdv = {
  id: string;
  sku: string;
  name: string;
  precoVarejo: number;
  precoAtacado: number | null;
  /** null = item sem controle de estoque (ilimitado). */
  estoque: number | null;
};

export type MovimentoCaixa = {
  id: string;
  tipo: string;
  direcao: "in" | "out";
  valor: number;
  motivo: string | null;
  criado_em: string;
};

type LinhaCarrinho = { item_id: string; sku: string; name: string; qty: number };

type VendaFeita = {
  pedido: string;
  total: number;
  metodo: string;
  parcelas: number;
  titulo: string | null;
  itens: { name: string; qty: number; preco: number }[];
};

const METODOS: { valor: string; label: string }[] = [
  { valor: "dinheiro", label: "Dinheiro" },
  { valor: "pix", label: "Pix" },
  { valor: "debito", label: "Débito" },
  { valor: "cartao", label: "Crédito" },
];

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
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const INPUT: React.CSSProperties = {
  padding: 8,
  borderRadius: 8,
  border: "1px solid var(--border)",
  fontSize: 13,
};

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--navy)" };

const CARD: React.CSSProperties = {
  background: "var(--bg-cloud)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 18,
  marginBottom: 20,
};

export function ConsolePdv({
  sessao,
  itens,
  movimentos,
}: {
  sessao: SessaoCaixa | null;
  itens: ItemPdv[];
  movimentos: MovimentoCaixa[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [abertura, setAbertura] = useState(100);
  const [contagem, setContagem] = useState("");
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<LinhaCarrinho[]>([]);
  const [canal, setCanal] = useState("varejo");
  const [metodo, setMetodo] = useState("dinheiro");
  const [parcelas, setParcelas] = useState(1);
  const [venda, setVenda] = useState<VendaFeita | null>(null);
  const [scTipo, setScTipo] = useState("suprimento");
  const [scValor, setScValor] = useState("");
  const [scMotivo, setScMotivo] = useState("");

  function rodar(acao: () => Promise<{ ok: boolean; erro?: string; msg?: string }>, aoOk?: () => void) {
    startTransition(async () => {
      const r = await acao();
      setAviso(r.ok ? { tipo: "ok", texto: r.msg ?? "OK" } : { tipo: "erro", texto: r.erro ?? "Falha" });
      if (r.ok) {
        aoOk?.();
        router.refresh();
      }
    });
  }

  function precoDe(item: ItemPdv): number {
    return canal === "atacado" ? (item.precoAtacado ?? item.precoVarejo) : item.precoVarejo;
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = q
      ? itens.filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
      : itens;
    return base.slice(0, 8);
  }, [busca, itens]);

  const total = useMemo(() => {
    return carrinho.reduce((acc, l) => {
      const item = itens.find((i) => i.id === l.item_id);
      return acc + (item ? precoDe(item) * l.qty : 0);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrinho, itens, canal]);

  function addItem(item: ItemPdv) {
    setVenda(null);
    setCarrinho((prev) => {
      const existe = prev.find((l) => l.item_id === item.id);
      if (existe) {
        return prev.map((l) => (l.item_id === item.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { item_id: item.id, sku: item.sku, name: item.name, qty: 1 }];
    });
    setBusca("");
  }

  function mudarQtd(itemId: string, delta: number) {
    setCarrinho((prev) =>
      prev
        .map((l) => (l.item_id === itemId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }

  function registrarVenda() {
    if (carrinho.length === 0) return;
    const snapshot = carrinho.map((l) => {
      const item = itens.find((i) => i.id === l.item_id)!;
      return { name: l.name, qty: l.qty, preco: precoDe(item) };
    });
    startTransition(async () => {
      const r = await registrarVendaPdv(
        carrinho.map((l) => ({ item_id: l.item_id, quantity: l.qty })),
        metodo,
        metodo === "cartao" ? parcelas : 1,
        canal
      );
      setAviso(r.ok ? { tipo: "ok", texto: r.msg } : { tipo: "erro", texto: r.erro });
      if (r.ok && r.venda) {
        setVenda({
          pedido: r.venda.pedido,
          total: r.venda.total,
          metodo,
          parcelas: metodo === "cartao" ? parcelas : 1,
          titulo: r.venda.titulo,
          itens: snapshot,
        });
        setCarrinho([]);
        setParcelas(1);
        router.refresh();
      }
    });
  }

  // ------------------------------------------------------------- sem caixa --
  if (!sessao) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "26px 24px 60px" }}>
        <h1 className="display" style={{ fontSize: 26, color: "var(--navy)", margin: "0 0 4px" }}>
          PDV
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 18px" }}>
          Frente de caixa. Abra o caixa para começar a vender.
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

        <section style={CARD}>
          <h2 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--navy)" }}>Abrir caixa</h2>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={LABEL}>
              Fundo de troco (R$)
              <input
                type="number"
                min={0}
                step="0.01"
                aria-label="Valor de abertura"
                value={abertura}
                onChange={(e) => setAbertura(Number(e.target.value))}
                style={{ ...INPUT, display: "block", marginTop: 4, width: 160 }}
              />
            </label>
            <button
              disabled={pendente}
              onClick={() => rodar(() => abrirCaixa(abertura))}
              style={{ ...BTN, background: "var(--pink-600)", color: "#FFF", padding: "9px 18px" }}
            >
              Abrir caixa
            </button>
          </div>
        </section>
      </div>
    );
  }

  // -------------------------------------------------------------- com caixa --
  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "26px 24px 60px" }}>
      <h1 className="display" style={{ fontSize: 26, color: "var(--navy)", margin: "0 0 4px" }}>
        PDV
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 18px" }}>
        Caixa aberto {dataCurta(sessao.aberta_em)} · fundo {brl(sessao.abertura)}.
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
        <div>
          <section style={CARD}>
            <h2 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--navy)" }}>Venda</h2>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <label style={{ ...LABEL, flex: 1, minWidth: 220 }}>
                Buscar produto
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="nome ou SKU…"
                  aria-label="Buscar produto"
                  style={{ ...INPUT, display: "block", marginTop: 4, width: "100%" }}
                />
              </label>
              <label style={LABEL}>
                Canal
                <select
                  value={canal}
                  onChange={(e) => setCanal(e.target.value)}
                  aria-label="Canal"
                  style={{ ...INPUT, display: "block", marginTop: 4 }}
                >
                  <option value="varejo">Varejo</option>
                  <option value="atacado">Atacado</option>
                </select>
              </label>
            </div>

            {filtrados.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {filtrados.map((i) => (
                  <div
                    key={i.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 13,
                      background: "var(--pink-100)",
                      borderRadius: 10,
                      padding: "7px 12px",
                    }}
                  >
                    <span style={{ fontWeight: 600, flex: 1 }}>
                      {i.sku} — {i.name}
                    </span>
                    <span style={{ color: "var(--ink-soft)" }}>{brl(precoDe(i))}</span>
                    <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      {i.estoque === null ? "sem controle" : `${i.estoque} un.`}
                    </span>
                    <button
                      onClick={() => addItem(i)}
                      aria-label={`Adicionar ${i.name}`}
                      style={{ ...BTN, background: "var(--navy)", color: "#FFF" }}
                    >
                      Adicionar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {carrinho.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 11.5, textTransform: "uppercase" }}>
                    <th style={{ padding: "6px 8px" }}>Item</th>
                    <th style={{ padding: "6px 8px" }}>Qtd</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Subtotal</th>
                    <th style={{ padding: "6px 8px" }} />
                  </tr>
                </thead>
                <tbody>
                  {carrinho.map((l) => {
                    const item = itens.find((i) => i.id === l.item_id);
                    const sub = item ? precoDe(item) * l.qty : 0;
                    return (
                      <tr key={l.item_id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px" }}>
                          {l.sku} — {l.name}
                        </td>
                        <td style={{ padding: "8px" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button
                              onClick={() => mudarQtd(l.item_id, -1)}
                              aria-label={`Remover ${l.name}`}
                              style={{ ...BTN, background: "#FEE2E2", color: "#991B1B", padding: "3px 10px" }}
                            >
                              −
                            </button>
                            <span style={{ fontWeight: 700, minWidth: 20, textAlign: "center" }}>{l.qty}</span>
                            <button
                              onClick={() => mudarQtd(l.item_id, 1)}
                              aria-label={`Somar ${l.name}`}
                              style={{ ...BTN, background: "#DCFCE7", color: "#166534", padding: "3px 10px" }}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: 700 }}>{brl(sub)}</td>
                        <td style={{ padding: "8px" }}>
                          <button
                            onClick={() => setCarrinho((p) => p.filter((x) => x.item_id !== l.item_id))}
                            aria-label={`Excluir ${l.name}`}
                            style={{ ...BTN, background: "transparent", color: "#991B1B", border: "1px solid #FECACA" }}
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={LABEL}>
                Forma de pagamento
                <select
                  value={metodo}
                  onChange={(e) => {
                    setMetodo(e.target.value);
                    if (e.target.value !== "cartao") setParcelas(1);
                  }}
                  aria-label="Forma de pagamento"
                  style={{ ...INPUT, display: "block", marginTop: 4 }}
                >
                  {METODOS.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              {metodo === "cartao" && (
                <label style={LABEL}>
                  Parcelas
                  <select
                    value={parcelas}
                    onChange={(e) => setParcelas(Number(e.target.value))}
                    aria-label="Parcelas"
                    style={{ ...INPUT, display: "block", marginTop: 4 }}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}x
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 700 }}>TOTAL</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--navy)" }} aria-label="Total da venda">
                  {brl(total)}
                </div>
              </div>
              <button
                disabled={pendente || carrinho.length === 0}
                onClick={registrarVenda}
                aria-label="Registrar venda"
                style={{ ...BTN, background: "#16A34A", color: "#FFF", padding: "11px 22px", fontSize: 14 }}
              >
                Registrar venda
              </button>
            </div>
          </section>

          {venda && (
            <section
              aria-label="Comprovante"
              style={{ ...CARD, background: "#F0FDF4", border: "1px solid #BBF7D0" }}
            >
              <h2 style={{ fontSize: 16, margin: "0 0 8px", color: "#166534" }}>
                Comprovante não fiscal — venda registrada
              </h2>
              <p style={{ fontSize: 13, margin: "0 0 4px", color: "#166534", fontWeight: 700 }}>
                Pedido {venda.pedido.slice(0, 8)} · {brl(venda.total)} ·{" "}
                {METODOS.find((m) => m.valor === venda.metodo)?.label}
                {venda.parcelas > 1 ? ` em ${venda.parcelas}x` : ""}
                {venda.titulo ? " · título gerado no financeiro" : ""}
              </p>
              <ul style={{ fontSize: 13, margin: "6px 0 10px", paddingLeft: 18, color: "#374151" }}>
                {venda.itens.map((l, idx) => (
                  <li key={idx}>
                    {l.qty}× {l.name} — {brl(l.preco)} un.
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setVenda(null)}
                style={{ ...BTN, background: "var(--navy)", color: "#FFF" }}
              >
                Nova venda
              </button>
            </section>
          )}
        </div>

        <div>
          <section style={CARD}>
            <h2 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--navy)" }}>Movimentos de caixa</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <label style={LABEL}>
                Tipo
                <select
                  value={scTipo}
                  onChange={(e) => setScTipo(e.target.value)}
                  aria-label="Tipo de movimento"
                  style={{ ...INPUT, display: "block", marginTop: 4 }}
                >
                  <option value="suprimento">Suprimento (+)</option>
                  <option value="sangria">Sangria (−)</option>
                </select>
              </label>
              <label style={LABEL}>
                Valor (R$)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={scValor}
                  onChange={(e) => setScValor(e.target.value)}
                  aria-label="Valor do movimento"
                  style={{ ...INPUT, display: "block", marginTop: 4, width: 110 }}
                />
              </label>
              <label style={{ ...LABEL, flex: 1, minWidth: 120 }}>
                Motivo
                <input
                  value={scMotivo}
                  onChange={(e) => setScMotivo(e.target.value)}
                  placeholder="troco, depósito…"
                  aria-label="Motivo do movimento"
                  style={{ ...INPUT, display: "block", marginTop: 4, width: "100%" }}
                />
              </label>
              <button
                disabled={pendente || !scValor}
                onClick={() =>
                  rodar(() => movimentoCaixa(scTipo, Number(scValor), scMotivo), () => {
                    setScValor("");
                    setScMotivo("");
                  })
                }
                aria-label="Registrar movimento"
                style={{ ...BTN, background: "var(--blue-600)", color: "#FFF", padding: "9px 16px" }}
              >
                Registrar movimento
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {movimentos.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>
                  Nenhum movimento nesta sessão.
                </p>
              )}
              {movimentos.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "baseline",
                    fontSize: 12.5,
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: 5,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 800,
                      color: m.direcao === "in" ? "#166534" : "#991B1B",
                      minWidth: 74,
                    }}
                  >
                    {m.tipo}
                  </span>
                  <span style={{ flex: 1, color: "var(--ink-soft)" }}>{m.motivo ?? dataCurta(m.criado_em)}</span>
                  <span style={{ fontWeight: 700 }}>
                    {m.direcao === "in" ? "+" : "−"} {brl(m.valor)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section style={CARD}>
            <h2 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--navy)" }}>Fechar caixa</h2>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 10px" }}>
              Conte o dinheiro da gaveta e informe o total. O bate-vale é conferido no fechamento.
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <label style={LABEL}>
                Contagem (R$)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={contagem}
                  onChange={(e) => setContagem(e.target.value)}
                  aria-label="Valor da contagem"
                  style={{ ...INPUT, display: "block", marginTop: 4, width: 140 }}
                />
              </label>
              <button
                disabled={pendente || contagem === ""}
                onClick={() => rodar(() => fecharCaixa(Number(contagem)), () => setContagem(""))}
                aria-label="Fechar caixa"
                style={{ ...BTN, background: "#991B1B", color: "#FFF", padding: "9px 18px" }}
              >
                Fechar caixa
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
