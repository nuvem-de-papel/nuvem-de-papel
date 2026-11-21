"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PAPEIS } from "@/lib/rbac";
import { BotaoGoogle } from "@/components/login/BotaoGoogle";

// Aceita apenas caminhos internos (evita open redirect via ?next=).
function destinoPadrao(): string {
  const raw = new URLSearchParams(window.location.search).get("next");
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/crm";
}

// Revenda compra no /produtos; fornecedor vai ao proprio portal. Areas
// privadas seguem o ?next= do middleware.
function destinoParaPapel(role: string): string {
  if (role === "revenda") return "/produtos";
  if (role === "fornecedor") return "/portal/fornecedor";
  return destinoPadrao();
}

// Cliente da loja (conta criada no checkout) nao tem linha em profiles. Antes
// este form o deslogava com "Perfil sem acesso" e ele nunca mais entrava
// (14/11/2026). Agora vai para a area dele; o ?next= so vale se for da loja —
// as areas da equipe seguem barradas pelo middleware (exige profile ativo).
function destinoCliente(): string {
  const raw = new URLSearchParams(window.location.search).get("next");
  if (raw && (raw.startsWith("/conta") || raw.startsWith("/checkout") || raw.startsWith("/corporativo"))) return raw;
  return "/conta/pedidos";
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  // destino do Google: calculado no cliente (window) para nao divergir na hidratacao
  const [destinoGoogle, setDestinoGoogle] = useState("/conta");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("erro") === "google") setErro("Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.");
    const raw = q.get("next");
    if (raw && (raw.startsWith("/conta") || raw.startsWith("/checkout") || raw.startsWith("/corporativo"))) setDestinoGoogle(raw);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile) {
        window.location.replace(destinoCliente());
        return;
      }
      if (
        profile.status === "ativo" &&
        PAPEIS.includes(profile.role)
      ) {
        window.location.replace(destinoParaPapel(profile.role));
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

    if (profile && profile.status === "pendente") {
      await supabase.auth.signOut();
      setErro("Cadastro em análise — aguarde aprovação.");
      setCarregando(false);
      return;
    }

    if (!profile) {
      window.location.replace(destinoCliente());
      return;
    }

    if (profile.status !== "ativo" || !PAPEIS.includes(profile.role)) {
      await supabase.auth.signOut();
      setErro("Perfil sem acesso a esta área.");
      setCarregando(false);
      return;
    }

    window.location.replace(destinoParaPapel(profile.role));
  }

  return (
    <main
      style={{
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        padding: "40px 24px",
      }}
    >
      <div className="login-vidro">
        <a href="/" aria-label="Nuvem de Papel - início" className="login-vidro-topo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/nuvem-de-papel.png" alt="Nuvem de Papel" style={{ height: 64, width: "auto" }} />
          <div style={{ color: "#000", fontSize: 13, fontWeight: 600 }}>Clientes e equipe</div>
        </a>

        <form onSubmit={handleSubmit} style={{ padding: "28px 32px 32px" }}>
          <BotaoGoogle destino={destinoGoogle} />
          <label
            htmlFor="email"
            style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#000", marginBottom: 6 }}
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
              border: "1.5px solid #FC99D3", background: "rgba(255,255,255,0.75)",
              borderRadius: 10,
              fontSize: 15,
              fontFamily: "'Open Sans', sans-serif",
              marginBottom: 18,
              outline: "none",
            }}
          />

          <label
            htmlFor="senha"
            style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#000", marginBottom: 6 }}
          >
            Senha
          </label>
          <div style={{ position: "relative", marginBottom: 18 }}>
            <input
              id="senha"
              type={mostrarSenha ? "text" : "password"}
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 64px 12px 14px",
                border: "1.5px solid #FC99D3", background: "rgba(255,255,255,0.75)",
                borderRadius: 10,
                fontSize: 15,
                fontFamily: "'Open Sans', sans-serif",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((v) => !v)}
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={mostrarSenha}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                padding: "6px 8px",
                cursor: "pointer",
                color: "#000",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {mostrarSenha ? "Ocultar" : "Mostrar"}
            </button>
          </div>

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
            className="login-vidro-botao"
            style={{
              width: "100%",
              color: "#000",
              padding: "14px",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 15,
              cursor: carregando ? "wait" : "pointer",
              opacity: carregando ? 0.7 : 1,
            }}
          >
            {carregando ? "Entrando…" : "Entrar"}
          </button>

          <p style={{ fontSize: 12, color: "#000", textAlign: "center", margin: "18px 0 0" }}>
            Ainda não tem conta? Ela é criada ao finalizar sua primeira compra.
          </p>
        </form>
      </div>
    </main>
  );
}
