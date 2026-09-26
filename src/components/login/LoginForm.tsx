"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PAPEIS_OPERACIONAIS } from "@/lib/rbac";

// Aceita apenas caminhos internos (evita open redirect via ?next=).
function destinoPadrao(): string {
  const raw = new URLSearchParams(window.location.search).get("next");
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/crm";
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .maybeSingle();
      if (
        profile &&
        profile.status === "ativo" &&
        PAPEIS_OPERACIONAIS.includes(profile.role)
      ) {
        window.location.replace(destinoPadrao());
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro("E-mail ou senha inválidos.");
      setCarregando(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .maybeSingle();

    if (!profile || profile.status !== "ativo" || !PAPEIS_OPERACIONAIS.includes(profile.role)) {
      await supabase.auth.signOut();
      setErro("Perfil sem acesso a esta área.");
      setCarregando(false);
      return;
    }

    window.location.replace(destinoPadrao());
  }

  return (
    <main
      style={{
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-cotton)",
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--bg-cloud)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "var(--shadow-soft)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "linear-gradient(180deg, #073B4C 0%, #0A4E63 100%)",
            padding: "28px 32px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <svg width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path
              d="M10 27c-4.4 0-8-3.6-8-8 0-4.1 3.1-7.5 7.1-7.9C10.4 7 14.6 4 19.5 4c5.6 0 10.3 3.9 11.4 9.1 4.3.6 7.6 4.3 7.6 8.7 0 4.9-3.9 8.8-8.8 8.8H10z"
              fill="#FFD166"
            />
          </svg>
          <div>
            <div className="display" style={{ color: "#FFFFFF", fontSize: 18 }}>
              Nuvem de Papel
            </div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
              Área restrita — acesso operacional
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "28px 32px 32px" }}>
          <label
            htmlFor="email"
            style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}
          >
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1.5px solid var(--border)",
              borderRadius: 10,
              fontSize: 15,
              fontFamily: "'Open Sans', sans-serif",
              marginBottom: 18,
              outline: "none",
            }}
          />

          <label
            htmlFor="senha"
            style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}
          >
            Senha
          </label>
          <input
            id="senha"
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1.5px solid var(--border)",
              borderRadius: 10,
              fontSize: 15,
              fontFamily: "'Open Sans', sans-serif",
              marginBottom: 18,
              outline: "none",
            }}
          />

          {erro && (
            <p
              style={{
                background: "#FDECEC",
                color: "#C62828",
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 14px",
                borderRadius: 8,
                margin: "0 0 16px",
              }}
            >
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando}
            style={{
              width: "100%",
              background: "var(--pink-600)",
              color: "#FFFFFF",
              padding: "14px",
              border: "none",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 15,
              cursor: carregando ? "wait" : "pointer",
              opacity: carregando ? 0.7 : 1,
            }}
          >
            {carregando ? "Entrando…" : "Entrar"}
          </button>

          <p style={{ fontSize: 12, color: "var(--ink-soft)", textAlign: "center", margin: "18px 0 0" }}>
            Acesso exclusivo da equipe Nuvem de Papel.
          </p>
        </form>
      </div>
    </main>
  );
}
