"use client";

import { useState } from "react";
import type { VarejoProduct } from "@/lib/products";
import { useOrcamento } from "@/components/orcamento/OrcamentoProvider";

// "Adicionar ao orcamento": so coloca o produto na lista, sem formulario.
// Vale para produto com estoque e sob encomenda; o prazo sai no envio.
export function QuoteButton({
  produto,
  largura = "auto",
  variante = "primario",
}: {
  produto: VarejoProduct;
  largura?: "auto" | "100%";
  variante?: "primario" | "secundario";
}) {
  const { addItem } = useOrcamento();
  const [adicionado, setAdicionado] = useState(false);
  const primario = variante === "primario";

  return (
    <button
      type="button"
      aria-label={`Adicionar ${produto.name} ao orçamento`}
      onClick={() => {
        addItem({ id: produto.id, sku: produto.sku, name: produto.name });
        setAdicionado(true);
        window.setTimeout(() => setAdicionado(false), 1200);
      }}
      style={{
        background: adicionado ? "var(--blue-600)" : primario ? "var(--pink-600)" : "transparent",
        color: adicionado || primario ? "#FFFFFF" : "var(--pink-600)",
        border: primario ? "none" : "1.5px solid var(--pink-600)",
        padding: primario ? "9px 14px" : "8px 14px",
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        width: largura,
        transition: "background 0.15s",
      }}
    >
      {adicionado ? "Adicionado ✓" : "Adicionar ao orçamento"}
    </button>
  );
}
