"use client";

import { useState } from "react";
import { pedirRevenda } from "./actions";

export default function SejaRevendaPage() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const r = await pedirRevenda({ nome, email, senha });
    setCarregando(false);
    if (r.ok) {
      setSucesso(true);
      return;
    }
    setErro(r.erro);
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
          maxWidth: 460,
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
          }}
        >
          <div className="display" style={{ color: "#FFFFFF", fontSize: 18 }}>
            Seja uma Revenda
          </div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 4 }}>
            Compre no atacado com preço de revenda no mesmo catálogo
          </div>
        </div>

        {sucesso ? (
          <div style={{ padding: "28px 32px 32px" }}>
            <p
              style={{
                background: "var(--blue-100)",
                color: "var(--blue-600)",
                fontSize: 14,
                fontWeight: 600,
                padding: "14px 16px",
                borderRadius: 10,
                margin: 0,
              }}
            >
              Pedido enviado! Sua conta será analisada pela nossa equipe e você
              recebe o acesso após a aprovação.
            </p>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 18, marginBottom: 0 }}>
              Já tem conta?{" "}
              <a href="/login" style={{ color: "var(--pink-600)", fontWeight: 700 }}>
                Entrar
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: "28px 32px 32px" }}>
            <label
              htmlFor="nome"
              style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}
            >
              Nome / Razão social
            </label>
            <input
              id="nome"
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
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
              minLength={8}
              autoComplete="new-password"
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
              {carregando ? "Enviando…" : "Pedir para ser revenda"}
            </button>

            <p style={{ fontSize: 12, color: "var(--ink-soft)", textAlign: "center", margin: "18px 0 0" }}>
              Sua conta fica pendente até a aprovação da equipe.{" "}
              <a href="/login" style={{ color: "var(--pink-600)", fontWeight: 700 }}>
                Já tenho conta
              </a>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
