"use client";

import { useState, useTransition } from "react";
import { entrarCorporativo, solicitarContaCorporativa } from "@/app/corporativo/actions";
import { cnpjValido } from "@/lib/documento";
import { CampoSenha } from "@/components/forms/CampoSenha";
import { SairButton } from "@/components/conta/SairButton";

// Entrada do /corporativo (0059; refeita em 20/11/2026 apos o teste de
// producao). O login e o MESMO da loja (e-mail + senha); aqui tambem aceita
// o CNPJ. Visitante escolhe "Ja tenho conta" (entrar) ou "Cadastrar minha
// empresa". Logado: a tela diz com qual cadastro esta logado e exige
// confirmacao antes de ligar o CNPJ a ele (a empresa caiu no cadastro de
// outra pessoa no teste de producao).

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

// Login aceita e-mail ou CNPJ: so aplica a mascara quando nao parece e-mail.
function mascaraLogin(v: string) {
  if (/[a-z@]/i.test(v)) return v;
  return mascaraCnpj(v);
}

type Modo = "entrar" | "cadastrar";

export function SolicitarCorporativoForm({ logadoComo }: { logadoComo: { nome: string; email: string } | null }) {
  const logado = !!logadoComo;
  const [modo, setModo] = useState<Modo>("entrar");
  const [razaoSocial, setRazao] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contato, setContato] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [login, setLogin] = useState("");
  const [senhaLogin, setSenhaLogin] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const cnpjCompleto = cnpj.replace(/\D/g, "").length === 14;
  const cnpjRuim = cnpjCompleto && !cnpjValido(cnpj);

  function trocar(m: Modo) {
    setModo(m);
    setErro(null);
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await solicitarContaCorporativa({
        razaoSocial,
        cnpj,
        contato,
        email,
        telefone,
        senha,
        confirmoLogado: confirmo,
      });
      if (!r.ok) {
        setErro(r.erro);
        // CNPJ ou e-mail ja cadastrados: leva para "Ja tenho conta".
        if (r.jaCadastrado && !logado) {
          setModo("entrar");
          setLogin(email || cnpj);
        }
        return;
      }
      window.location.href = r.destino;
    });
  }

  function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await entrarCorporativo(login, senhaLogin);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      window.location.href = r.destino;
    });
  }

  const avisoErro = erro && (
    <p className="conta-erro" role="alert" style={{ gridColumn: "1 / -1" }}>
      {erro}
    </p>
  );

  return (
    <div>
      {logado ? (
        <div className="corp-logado" aria-label="Cadastro logado">
          <span>
            Você está logado como <b>{logadoComo.nome || logadoComo.email}</b>
            {logadoComo.nome ? ` (${logadoComo.email})` : ""}. Não é você?
          </span>
          <SairButton destino="/corporativo" />
        </div>
      ) : (
        <div className="corp-escolha" role="tablist" aria-label="Acesso corporativo">
          <button type="button" role="tab" aria-selected={modo === "entrar"} onClick={() => trocar("entrar")}>
            Já tenho conta corporativa
          </button>
          <button type="button" role="tab" aria-selected={modo === "cadastrar"} onClick={() => trocar("cadastrar")}>
            Cadastrar minha empresa
          </button>
        </div>
      )}

      {!logado && modo === "entrar" ? (
        <form className="conta-form" onSubmit={entrar} aria-label="Entrar na conta corporativa">
          <label className="conta-campo">
            E-mail ou CNPJ
            <input
              value={login}
              onChange={(e) => setLogin(mascaraLogin(e.target.value))}
              autoComplete="username"
              required
            />
          </label>
          <CampoSenha value={senhaLogin} onChange={setSenhaLogin} autoComplete="current-password" />
          <div className="conta-form-acoes">
            <button type="submit" className="conta-botao" disabled={pendente}>
              {pendente ? "Entrando..." : "Entrar"}
            </button>
            <span className="inicio-sub">Mesmo login da loja. Esqueceu a senha? Fale com o atendimento.</span>
          </div>
          {avisoErro}
        </form>
      ) : (
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
              <CampoSenha value={senha} onChange={setSenha} autoComplete="new-password" minLength={6} />
            </>
          )}
          {logado && (
            <label className="corp-confirmo" style={{ gridColumn: "1 / -1" }}>
              <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} /> Confirmo que
              a empresa fica ligada ao meu cadastro ({logadoComo.email}), que passa a ser o acesso de administrador dela.
            </label>
          )}
          <div className="conta-form-acoes">
            <button type="submit" className="conta-botao" disabled={pendente || cnpjRuim || (logado && !confirmo)}>
              {pendente ? "Enviando..." : "Solicitar conta corporativa"}
            </button>
            {cnpjRuim && <span className="conta-erro">CNPJ inválido.</span>}
          </div>
          {avisoErro}
        </form>
      )}
    </div>
  );
}
