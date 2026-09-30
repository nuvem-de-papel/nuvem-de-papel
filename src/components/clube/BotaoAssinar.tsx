"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { assinarPlano } from "@/app/clube/actions";

// Botao "Assinar" do /clube: entra com a assinatura e leva o cliente ao
// painel dela (/conta/assinatura) para acompanhar a ativacao.
export function BotaoAssinar({ planId, logado }: { planId: string; logado: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();

  if (!logado) {
    return (
      <Link
        href="/login?next=/clube"
        style={{
          display: "block",
          textAlign: "center",
          background: "var(--pink-600, #e084ac)",
          color: "var(--on-accent, #fff)",
          padding: "13px 20px",
          borderRadius: "var(--radius-control, 10px)",
          fontWeight: 700,
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        Entrar e assinar
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={carregando}
        onClick={async () => {
          setErro(null);
          setCarregando(true);
          const r = await assinarPlano(planId);
          setCarregando(false);
          if (r.ok) {
            router.push("/conta/assinatura?novo=1");
            router.refresh();
            return;
          }
          setErro(r.erro);
        }}
        style={{
          width: "100%",
          background: "var(--pink-600, #e084ac)",
          color: "var(--on-accent, #fff)",
          padding: "13px 20px",
          border: "none",
          borderRadius: "var(--radius-control, 10px)",
          fontWeight: 700,
          fontSize: 14,
          cursor: carregando ? "wait" : "pointer",
        }}
      >
        {carregando ? "Assinando..." : "Assinar agora"}
      </button>
      {erro && (
        <p role="alert" style={{ color: "var(--red-600, #b3261e)", fontSize: 13, margin: "8px 0 0" }}>
          {erro}
        </p>
      )}
    </div>
  );
}
