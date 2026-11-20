"use client";

import { useState, useTransition } from "react";
import { solicitarContaCorporativa } from "@/app/corporativo/actions";
import { cnpjValido } from "@/lib/documento";

// Pedido de conta corporativa (0059 - 20/11/2026). Logado: so dados da
// empresa (o login atual vira o admin). Visitante: empresa + acesso.

function mascaraCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

export function SolicitarCorporativoForm({ logado }: { logado: boolean }) {
  const [razaoSocial, setRazao] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contato, setContato] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const cnpjCompleto = cnpj.replace(/\D/g, "").length === 14;
  const cnpjRuim = cnpjCompleto && !cnpjValido(cnpj);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await solicitarContaCorporativa({ razaoSocial, cnpj, contato, email, telefone, senha });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      window.location.href = r.destino;
    });
  }

  return (
    <form className="conta-form" onSubmit={enviar} aria-label="Solicitar conta corporativa">
      <label className="conta-campo" style={{ gridColumn: "1 / -1" }}>
        Razão social
        <input value={razaoSocial} onChange={(e) => setRazao(e.target.value)} maxLength={160} required />
      </label>
      <label className="conta-campo">
        CNPJ
        <input
          value={cnpj}
          onChange={(e) => setCnpj(mascaraCnpj(e.target.value))}
          inputMode="numeric"
          required
          aria-invalid={cnpjRuim}
          style={cnpjRuim ? { borderColor: "#B3261E" } : undefined}
        />
      </label>
      <label className="conta-campo">
        Telefone da empresa
        <input value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} inputMode="tel" required />
      </label>
      {!logado && (
        <>
          <label className="conta-campo">
            Nome de quem compra
            <input value={contato} onChange={(e) => setContato(e.target.value)} maxLength={120} required />
          </label>
          <label className="conta-campo">
            E-mail de acesso
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="conta-campo">
            Senha
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
        </>
      )}
      <div className="conta-form-acoes">
        <button type="submit" className="conta-botao" disabled={pendente || cnpjRuim}>
          {pendente ? "Enviando..." : "Solicitar conta corporativa"}
        </button>
        {cnpjRuim && <span className="conta-erro">CNPJ inválido.</span>}
      </div>
      {erro && (
        <p className="conta-erro" role="alert" style={{ gridColumn: "1 / -1" }}>
          {erro}
        </p>
      )}
    </form>
  );
}
