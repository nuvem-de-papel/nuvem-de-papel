"use client";

import { useState, useTransition } from "react";
import { cadastrarBasicoParaCompra, entrarParaCompra } from "@/app/checkout/cadastro-actions";
import { useCart } from "@/components/carrinho/CartProvider";
import { SelosConfianca } from "@/components/loja/SelosConfianca";

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

/**
 * Form de cadastro básico para compra (visitante vira cliente).
 * Aparece no /checkout quando não há sessão ativa. O modo "entrar" existe
 * porque o /login é da equipe e recusa cliente sem profile.
 */
export function CadastroBasicoForm() {
  const { itens, totalValor } = useCart();
  const [modo, setModo] = useState<"criar" | "entrar">("criar");
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
      const resultado =
        modo === "entrar"
          ? await entrarParaCompra({ email, senha })
          : await cadastrarBasicoParaCompra({ nome, email, telefone, senha });
      if (!resultado.ok) {
        if (resultado.jaCadastrado) {
          setModo("entrar");
          setSenha("");
        }
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

  const entrando = modo === "entrar";
  const submitDisabled = isPending || !email || !senha || (!entrando && (!nome || !telefone));

  const trocarModo = () => {
    setErro(null);
    setModo(entrando ? "criar" : "entrar");
  };

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 30, marginBottom: 18 }}>
        Finalize sua compra
      </h1>
      <SelosConfianca variante="faixa" />
      <div className="checkout-grade" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24, alignItems: "start" }}>
      <div
        style={{
          background: "#FFF",
          borderRadius: 18,
          padding: "32px 28px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>1 - Dados cadastrais</h2>
        <p style={{ color: "var(--ink-soft)", marginBottom: 28, fontSize: 15 }}>
          {entrando
            ? "Entre com o e-mail e a senha do seu cadastro para continuar."
            : "Crie uma conta rápida para continuar. Você poderá acompanhar seu pedido e comprar mais vezes."}
        </p>

        <form onSubmit={handleSubmit}>
          {!entrando && (
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
          )}

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

          {!entrando && (
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
          )}

          <div style={formGroupStyle}>
            <label htmlFor="senha" style={labelStyle}>
              Senha
            </label>
            <input
              type="password"
              id="senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={entrando ? "Sua senha" : "Mínimo 6 caracteres"}
              disabled={isPending}
              style={inputStyle}
              autoComplete={entrando ? "current-password" : "new-password"}
              minLength={entrando ? undefined : 6}
              required
            />
            {!entrando && (
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
                Você usará esta senha para acessar sua conta depois.
              </div>
            )}
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
            {isPending
              ? entrando
                ? "Entrando..."
                : "Criando conta..."
              : entrando
                ? "Entrar e continuar"
                : "Criar conta e continuar"}
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
            <strong>{entrando ? "Ainda não tem cadastro?" : "Já tem cadastro?"}</strong>{" "}
            <button
              type="button"
              onClick={trocarModo}
              disabled={isPending}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "var(--blue-600)",
                textDecoration: "underline",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {entrando ? "Criar conta" : "Entrar aqui"}
            </button>
          </div>
        </form>
      </div>
      <aside
        className="checkout-col2"
        style={{ background: "#FFF", borderRadius: 18, padding: "28px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", position: "sticky", top: 88 }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>2 - Pagamento</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 14 }}>
          Assim que você se identificar, a entrega e o pagamento (Pix, cartão ou boleto) abrem nesta mesma tela.
        </p>
        {itens.map((i) => (
          <div key={i.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
            <span>
              {i.qty}× {i.name}
            </span>
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{brl(i.price * i.qty)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, alignItems: "baseline" }}>
          <span style={{ fontWeight: 700 }}>Subtotal</span>
          <span className="display" style={{ fontSize: 22 }}>{brl(totalValor)}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>Frete calculado pelo CEP na próxima etapa.</p>
      </aside>
      </div>
    </main>
  );
}
