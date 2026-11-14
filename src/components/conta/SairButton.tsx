"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Saida do cliente da loja (a equipe sai pelo AdminShell). Recarrega a
// pagina inteira para o header e o carrinho lerem a sessao ja encerrada.
export function SairButton() {
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await createClient().auth.signOut();
    window.location.href = "/";
  }

  return (
    <button
      type="button"
      onClick={sair}
      disabled={saindo}
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        color: "var(--ink-soft)",
        padding: "8px 18px",
        borderRadius: 999,
        fontWeight: 600,
        fontSize: 14,
        cursor: saindo ? "default" : "pointer",
      }}
    >
      {saindo ? "Saindo..." : "Sair"}
    </button>
  );
}
