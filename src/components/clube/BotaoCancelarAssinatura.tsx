"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelarAssinatura } from "@/app/clube/actions";

// Cancelamento direto do painel do assinante: confirma em janela do
// navegador (mesmo padrao das acoes destrutivas do admin) e revalida.
export function BotaoCancelarAssinatura() {
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();

  return (
    <div>
      <button
        type="button"
        disabled={carregando}
        onClick={async () => {
          if (!window.confirm("Cancelar sua assinatura do Clube? O desconto deixa de valer.")) {
            return;
          }
          setErro(null);
          setCarregando(true);
          const r = await cancelarAssinatura();
          setCarregando(false);
          if (r.ok) {
            router.refresh();
            return;
          }
          setErro(r.erro);
        }}
        style={{
          background: "transparent",
          color: "var(--red-600, #b3261e)",
          border: "1px solid var(--red-600, #b3261e)",
          padding: "12px 22px",
          borderRadius: "var(--radius-control, 10px)",
          fontWeight: 700,
          fontSize: 14,
          cursor: carregando ? "wait" : "pointer",
        }}
      >
        {carregando ? "Cancelando..." : "Cancelar assinatura"}
      </button>
      {erro && (
        <p role="alert" style={{ color: "var(--red-600, #b3261e)", fontSize: 13, margin: "8px 0 0" }}>
          {erro}
        </p>
      )}
    </div>
  );
}
