"use client";

import { useState } from "react";
import { useCart } from "@/components/carrinho/CartProvider";
import type { VarejoProduct } from "@/lib/products";

// Botão do card (server component) — só exibe o preço do catálogo;
// o servidor recalcula tudo no checkout.
export function AddToCartButton({ produto }: { produto: VarejoProduct }) {
  const { addItem } = useCart();
  const [adicionado, setAdicionado] = useState(false);

  return (
    <button
      aria-label={`Adicionar ${produto.name} ao carrinho`}
      onClick={() => {
        addItem({ id: produto.id, sku: produto.sku, name: produto.name, price: produto.price });
        setAdicionado(true);
        window.setTimeout(() => setAdicionado(false), 1200);
      }}
      style={{
        background: adicionado ? "var(--blue-600)" : "var(--pink-100)",
        color: adicionado ? "#FFFFFF" : "var(--pink-600)",
        width: 38,
        height: 38,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
    >
      {adicionado ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1.4" />
          <circle cx="18" cy="21" r="1.4" />
          <path d="M2.5 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7.5H6" />
        </svg>
      )}
    </button>
  );
}
