"use client";

import { useEffect, useState } from "react";
import type { VarejoProduct } from "@/lib/products";
import { useCart } from "@/components/carrinho/CartProvider";
import { useOrcamento } from "@/components/orcamento/OrcamentoProvider";

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
export function ProductActions({ produto, grande = false }: { produto: VarejoProduct; grande?: boolean }) {
  const { addItem: addCarrinho } = useCart();
  const { addItem: addOrcamento } = useOrcamento();
  const semEstoque = produto.estoque === 0;
  const [aviso, setAviso] = useState<string | null>(null);
  const [feitoOrcamento, setFeitoOrcamento] = useState(false);
  const [feitoCarrinho, setFeitoCarrinho] = useState(false);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 3000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  function marcarFeito(setter: (v: boolean) => void) {
    setter(true);
    window.setTimeout(() => setter(false), 1200);
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span className="display" style={{ fontSize: grande ? 22 : 16, whiteSpace: "nowrap" }}>
          {formatPrice(produto.price)}
        </span>
        {semEstoque && (
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
        <span style={{ flex: 1 }} />
        <button
          type="button"
          aria-label={`Adicionar ${produto.name} ao orçamento`}
          title="Orçamento"
          onClick={() => {
            addOrcamento({ id: produto.id, sku: produto.sku, name: produto.name });
            marcarFeito(setFeitoOrcamento);
          }}
          style={iconeStyle(feitoOrcamento, false)}
        >
          {feitoOrcamento ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="8" y="2" width="8" height="4" rx="1" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <path d="M9 12h6M9 16h4" />
            </svg>
          )}
        </button>
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
        <p role="status" style={{ fontSize: 12, fontWeight: 700, color: "var(--pink-600)", margin: "8px 0 0", lineHeight: 1.35 }}>
          {aviso}
        </p>
      )}
    </div>
  );
}
