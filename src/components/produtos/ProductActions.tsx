"use client";

import { useEffect, useState } from "react";
import type { VarejoProduct } from "@/lib/products";
import { useCart } from "@/components/carrinho/CartProvider";

function formatPrice(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const AVISO_SOB_CONSULTA = "Produto sob consulta. Faça somente o orçamento.";

function iconeStyle(feito: boolean, apagado: boolean) {
  return {
    width: 30,
    height: 30,
    borderRadius: 9,
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.15s",
    background: feito ? "var(--blue-600)" : apagado ? "var(--ink-faint)" : "var(--pink-100)",
    color: feito ? "#FFFFFF" : apagado ? "var(--ink-soft)" : "var(--pink-600)",
  } as const;
}

// Linha de acao do card. Igual na home e em /produtos:
// [valor] [consulta*] ........ [icone orcamento] [icone carrinho]
// *"consulta" so aparece com saldo zero. Os dois icones aparecem sempre.
// Carrinho com saldo zero nao adiciona: mostra o aviso de sob consulta.
export function ProductActions({
  produto,
  grande = false,
  somenteBotoes = false,
}: {
  produto: VarejoProduct;
  grande?: boolean;
  somenteBotoes?: boolean;
}) {
  const { addItem: addCarrinho } = useCart();
  const semEstoque = produto.estoque === 0;
  const [aviso, setAviso] = useState<string | null>(null);
  const [feitoCarrinho, setFeitoCarrinho] = useState(false);
  const [qtd, setQtd] = useState(1);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 3000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  function marcarFeito(setter: (v: boolean) => void) {
    setter(true);
    window.setTimeout(() => setter(false), 1200);
  }

  if (grande && !somenteBotoes) {
    const qtdBtn = {
      width: 38,
      height: 42,
      border: "none",
      background: "transparent",
      fontSize: 20,
      fontWeight: 700,
      cursor: "pointer",
      color: "var(--ink)",
    } as const;
    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          {semEstoque && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF", background: "var(--pink-600)", borderRadius: 999, padding: "3px 10px" }}>
              sob consulta
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
          <div style={{ display: "flex", alignItems: "center", border: "1.5px solid var(--ink-faint)", borderRadius: 999, background: "#FFFFFF", overflow: "hidden" }}>
            <button type="button" aria-label="Diminuir quantidade" onClick={() => setQtd(Math.max(1, qtd - 1))} style={qtdBtn}>−</button>
            <span style={{ minWidth: 36, textAlign: "center", fontWeight: 700 }}>{qtd}</span>
            <button type="button" aria-label="Aumentar quantidade" onClick={() => setQtd(Math.min(99, qtd + 1))} style={qtdBtn}>+</button>
          </div>
          <button
            type="button"
            onClick={() => {
              if (semEstoque) {
                setAviso(AVISO_SOB_CONSULTA);
                return;
              }
              addCarrinho({ id: produto.id, sku: produto.sku, name: produto.name, price: produto.price }, qtd);
              marcarFeito(setFeitoCarrinho);
            }}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 999,
              border: "1.5px solid var(--ink)",
              background: semEstoque ? "var(--ink-faint)" : "linear-gradient(90deg, #F7C6E3, #DCCDF5)",
              color: "var(--ink)",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            {semEstoque ? "Fazer orçamento" : feitoCarrinho ? "Adicionado" : "Adicionar ao carrinho"}
          </button>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>{formatPrice(produto.price)} por unidade</p>
        {aviso && (
          <p role="status" style={{ fontSize: 12, fontWeight: 700, color: "var(--pink-600)", margin: "8px 0 0", lineHeight: 1.35 }}>
            {aviso}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: somenteBotoes ? 0 : 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {!somenteBotoes && (
          <span className="display" style={{ fontSize: grande ? 22 : 16, whiteSpace: "nowrap" }}>
            {formatPrice(produto.price)}
          </span>
        )}
        {!somenteBotoes && semEstoque && (
          <span
            style={{
              fontSize: grande ? 12 : 10,
              fontWeight: 700,
              color: "#FFFFFF",
              background: "var(--pink-600)",
              borderRadius: 999,
              padding: "3px 8px",
              whiteSpace: "nowrap",
            }}
          >
            consulta
          </span>
        )}
        {!somenteBotoes && <span style={{ flex: 1 }} />}
        <span aria-hidden="true" style={{ ...iconeStyle(false, false), visibility: "hidden" }} />
        <button
          type="button"
          aria-label={semEstoque ? `${produto.name}: produto sob consulta` : `Adicionar ${produto.name} ao carrinho`}
          title={semEstoque ? "Sob consulta" : "Carrinho"}
          onClick={() => {
            if (semEstoque) {
              setAviso(AVISO_SOB_CONSULTA);
              return;
            }
            addCarrinho({ id: produto.id, sku: produto.sku, name: produto.name, price: produto.price });
            marcarFeito(setFeitoCarrinho);
          }}
          style={iconeStyle(feitoCarrinho, semEstoque)}
        >
          {feitoCarrinho ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1.4" />
              <circle cx="18" cy="21" r="1.4" />
              <path d="M2.5 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7.5H6" />
            </svg>
          )}
        </button>
      </div>
      {aviso && (
        <p
          role="status"
          style={
            somenteBotoes
              ? {
                  position: "absolute",
                  left: 16,
                  right: 16,
                  bottom: 72,
                  margin: 0,
                  padding: "8px 12px",
                  borderRadius: 12,
                  background: "#FFFFFF",
                  color: "#100D0D",
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: 1.35,
                  boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
                }
              : { fontSize: 12, fontWeight: 700, color: "var(--pink-600)", margin: "8px 0 0", lineHeight: 1.35 }
          }
        >
          {aviso}
        </p>
      )}
    </div>
  );
}
