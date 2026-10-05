"use client";

import type { CSSProperties } from "react";

// Botao de impressao compartilhado pelo Bloco 4 (DANFE e pedido de compra).
// window.print() entrega o dialogo do browser, onde o usuario escolhe
// "Salvar como PDF" - e o @media print de globals.css garante que so o
// documento (e nao a interface) vai para o papel. Sem dependencia nova.
export default function BotaoImprimir({
  rotulo = "Imprimir / PDF",
  ariaLabel,
  style,
}: {
  rotulo?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      data-no-print
      aria-label={ariaLabel ?? rotulo}
      onClick={() => window.print()}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--bg-cloud)",
        color: "var(--navy)",
        fontWeight: 800,
        fontSize: 13,
        padding: "8px 14px",
        cursor: "pointer",
        ...style,
      }}
    >
      {rotulo}
    </button>
  );
}
