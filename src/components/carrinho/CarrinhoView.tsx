"use client";

import Link from "next/link";
import { useCart } from "@/components/carrinho/CartProvider";

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  background: "var(--pink-600)",
  color: "#FFFFFF",
  padding: "13px 26px",
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 15,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};

export function CarrinhoView() {
  const { itens, totalValor, setQty, removeItem, totalItens } = useCart();

  if (itens.length === 0) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "64px 32px", textAlign: "center" }}>
        <h1 className="display" style={{ fontSize: 30, marginBottom: 12 }}>
          Seu carrinho está vazio
        </h1>
        <p style={{ color: "var(--ink-soft)", marginBottom: 28 }}>
          Que tal escolher alguma coisa bonita para organizar a rotina?
        </p>
        <Link href="/produtos" style={BTN}>
          Ver produtos
        </Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "48px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 32, marginBottom: 6 }}>
        Carrinho
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 28 }}>
        {totalItens} {totalItens === 1 ? "item" : "itens"}
      </p>

      <div
        style={{
          background: "var(--bg-cloud)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          padding: 8,
          boxShadow: "var(--shadow-card)",
          marginBottom: 24,
        }}
      >
        {itens.map((i) => (
          <div
            key={i.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "14px 16px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)", margin: 0 }}>{i.name}</p>
              <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "2px 0 0" }}>
                {i.sku} · {brl(i.price)} un.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                aria-label="Diminuir"
                onClick={() => setQty(i.id, i.qty - 1)}
                style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "#FFF", cursor: "pointer", fontWeight: 700 }}
              >
                −
              </button>
              <span style={{ minWidth: 24, textAlign: "center", fontWeight: 700, fontSize: 14 }}>{i.qty}</span>
              <button
                aria-label="Aumentar"
                onClick={() => setQty(i.id, i.qty + 1)}
                style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "#FFF", cursor: "pointer", fontWeight: 700 }}
              >
                +
              </button>
            </div>

            <span style={{ minWidth: 96, textAlign: "right", fontWeight: 700, fontSize: 15 }}>
              {brl(i.price * i.qty)}
            </span>

            <button
              aria-label={`Remover ${i.name}`}
              onClick={() => removeItem(i.id)}
              style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}
              title="Remover"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          background: "var(--bg-cloud)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          padding: "18px 22px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", margin: 0 }}>
            Total (preço exibido; validado no servidor)
          </p>
          <p className="display" style={{ fontSize: 26, margin: "4px 0 0" }}>
            {brl(totalValor)}
          </p>
        </div>
        <Link href="/checkout" style={BTN}>
          Finalizar compra →
        </Link>
      </div>
    </main>
  );
}
