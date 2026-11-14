"use client";

import { useState, useTransition } from "react";
import { cadastrarBasicoParaCompra } from "@/app/checkout/cadastro-actions";

/**
 * Form de cadastro básico para compra (visitante vira cliente).
 * Aparece no /checkout quando não há sessão ativa.
 */
export function CadastroBasicoForm() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    startTransition(async () => {
      const resultado = await cadastrarBasicoParaCompra({ nome, email, telefone, senha });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      window.location.href = resultado.destino;
    });
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 18px",
    borderRadius: 12,
    border: "1px solid var(--ink-faint)",
    fontSize: 15,
    fontFamily: "inherit",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "var(--ink-soft)",
    marginBottom: 8,
  };

  const formGroupStyle: React.CSSProperties = {
    marginBottom: 20,
  };

  const submitDisabled = isPending || !nome || !email || !telefone || !senha;

  return (
    <main
      className="fundo-animado"
      style={{
        maxWidth: 520,
        margin: "0 auto",
        padding: "48px 32px 72px",
      }}
    >
      <div
        style={{
          background: "#FFF",
          borderRadius: 18,
          padding: "32px 28px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}
      >
        <h1 className="display" style={{ fontSize: 26, marginBottom: 8 }}>
          Finalize sua compra
        </h1>
        <p style={{ color: "var(--ink-soft)", marginBottom: 28, fontSize: 15 }}>
          Crie uma conta rápida para continuar. Você poderá acompanhar seu pedido e comprar mais vezes.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={formGroupStyle}>
            <label htmlFor="nome" style={labelStyle}>
              Nome completo
            </label>
            <input
              type="text"
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
              disabled={isPending}
              style={inputStyle}
              autoComplete="name"
              required
            />
          </div>

          <div style={formGroupStyle}>
            <label htmlFor="email" style={labelStyle}>
              E-mail
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              disabled={isPending}
              style={inputStyle}
              autoComplete="email"
              required
            />
          </div>

          <div style={formGroupStyle}>
            <label htmlFor="telefone" style={labelStyle}>
              Telefone
            </label>
            <input
              type="tel"
              id="telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(00) 00000-0000"
              disabled={isPending}
              style={inputStyle}
              autoComplete="tel"
              required
            />
          </div>

          <div style={formGroupStyle}>
            <label htmlFor="senha" style={labelStyle}>
              Senha
            </label>
            <input
              type="password"
              id="senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              disabled={isPending}
              style={inputStyle}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
              Você usará esta senha para acessar sua conta depois.
            </div>
          </div>

          {erro && (
            <div
              style={{
                background: "#FEE",
                color: "#C00",
                padding: "12px 16px",
                borderRadius: 10,
                fontSize: 14,
                marginBottom: 20,
              }}
            >
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={submitDisabled}
            style={{
              width: "100%",
              padding: "16px",
              background: submitDisabled ? "var(--ink-faint)" : "var(--pink-600)",
              color: submitDisabled ? "var(--ink-soft)" : "#FFF",
              border: "none",
              borderRadius: 999,
              fontSize: 16,
              fontWeight: 700,
              cursor: submitDisabled ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {isPending ? "Criando conta..." : "Criar conta e continuar"}
          </button>

          <div
            style={{
              marginTop: 20,
              padding: "16px",
              background: "var(--blue-50)",
              borderRadius: 10,
              fontSize: 13,
              color: "var(--ink)",
            }}
          >
            <strong>Já tem cadastro?</strong>{" "}
            <a
              href="/login?next=/checkout"
              style={{
                color: "var(--blue-600)",
                textDecoration: "underline",
                fontWeight: 700,
              }}
            >
              Faça login aqui
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}
