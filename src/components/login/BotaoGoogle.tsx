"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Entrar com Google (20/11/2026). So aparece com NEXT_PUBLIC_LOGIN_GOOGLE=1:
// o provedor precisa estar ligado no painel do Supabase (Auth > Providers >
// Google) com o Client ID/Secret do Google Cloud. A volta passa por
// /auth/callback, que abre a sessao e manda para `destino`.
export const LOGIN_GOOGLE_LIGADO = process.env.NEXT_PUBLIC_LOGIN_GOOGLE === "1";

export function BotaoGoogle({ destino }: { destino: string }) {
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!LOGIN_GOOGLE_LIGADO) return null;

  async function entrar() {
    setIndo(true);
    setErro(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destino)}` },
    });
    if (error) {
      setErro("Não foi possível abrir o login do Google. Use e-mail e senha.");
      setIndo(false);
    }
  }

  return (
    <div className="botao-google-bloco">
      <button type="button" className="botao-google" onClick={entrar} disabled={indo}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
        </svg>
        {indo ? "Abrindo o Google..." : "Entrar com Google"}
      </button>
      <span className="botao-google-ou">ou</span>
      {erro && (
        <p className="conta-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
