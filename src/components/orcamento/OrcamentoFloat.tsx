"use client";

import Link from "next/link";
import { useOrcamento } from "@/components/orcamento/OrcamentoProvider";

// Contador flutuante da lista de orcamento. Aparece em todas as paginas
// quando ha produtos na lista e leva para /orcamento.
export function OrcamentoFloat() {
  const { totalItens } = useOrcamento();
  if (totalItens === 0) return null;
  return (
    <Link
      href="/orcamento"
      aria-label={`Abrir orçamento com ${totalItens} produtos`}
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 900,
        background: "var(--navy)",
        color: "#FFFFFF",
        padding: "12px 18px",
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 14,
        textDecoration: "none",
        boxShadow: "0 8px 24px rgba(0, 107, 225,0.3)",
      }}
    >
      Orçamento ({totalItens})
    </Link>
  );
}
