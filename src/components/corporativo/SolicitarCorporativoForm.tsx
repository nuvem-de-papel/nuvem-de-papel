"use client";

import { useState, useTransition } from "react";
import { entrarCorporativo, solicitarContaCorporativa } from "@/app/corporativo/actions";
import { cnpjValido } from "@/lib/documento";
import { CampoSenha } from "@/components/forms/CampoSenha";
import { SairButton } from "@/components/conta/SairButton";
import { BotaoGoogle } from "@/components/login/BotaoGoogle";

// Entrada do /corporativo (0059; refeita em 20/11/2026 duas vezes). O login
// e o MESMO da loja (e-mail + senha, ou Google quando ligado); aqui tambem
// aceita o CNPJ. Visitante escolhe "Ja tenho conta" ou "Cadastrar". Sem fila
// de aprovacao: a empresa nasce ativa e o comprador cai direto no painel.
// O quadro "Atendimento corporativo" fica ao lado do login e some no
// cadastro (o formulario precisa da largura toda). Logado: a tela diz com
// qual cadastro esta logado e exige confirmacao antes de ligar o CNPJ a ele.

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

function mascaraCep(v: string) {
  return v.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

// Login aceita e-mail ou CNPJ: so aplica a mascara quando nao parece e-mail.
function mascaraLogin(v: string) {
  if (/[a-z@]/i.test(v)) return v;
  return mascaraCnpj(v);
}

type Modo = "entrar" | "cadastrar";

function QuadroInfo() {
  return (
    <aside className="corp-info" aria-label="Atendimento corporativo">
      <h1 className="display">Atendimento corporativo</h1>
      <p>
        Empresas com compras recorrentes contam com condições comerciais próprias: prazos de pagamento, faturamento por
        CNPJ, acompanhamento de pedidos em aberto e promoções exclusivas.
      </p>
      <ul>
        <li>Preço de atacado</li>
        <li>Faturamento no prazo da empresa</li>
        <li>Pedidos e vencimentos num lugar só</li>
      </ul>
    </aside>
  );
}

export function SolicitarCorporativoForm({ logadoComo }: { logadoComo: { nome: string; email: string } | null }) {
  const logado = !!logadoComo;
  const [modo, setModo] = useState<Modo>(logado ? "cadastrar" : "entrar");
  const [razaoSocial, setRazao] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [complemento, setComplemento] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [contato, setContato] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [login, setLogin] = useState("");
  const [senhaLogin, setSenhaLogin] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoCep, setAvisoCep] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const cnpjCompleto = cnpj.replace(/\D/g, "").length === 14;
  const cnpjRuim = cnpjCompleto && !cnpjValido(cnpj);
  const senhaDiferente = !logado && confirmarSenha.length > 0 && senha !== confirmarSenha;

  function trocar(m: Modo) {
    setModo(m);
    setErro(null);
  }

  // ViaCEP no blur. A cidade vem em `localidade` (nao em `cidade`).
  async function buscarCep() {
    const d = cep.replace(/\D/g, "");
    setAvisoCep(null);
    if (d.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j.erro) {
        setAvisoCep("CEP não encontrado. Preencha o endereço à mão.");
        return;
      }
      setLogradouro((v) => j.logradouro || v);
      setBairro((v) => j.bairro || v);
      setCidade((v) => j.localidade || v);
      setUf((v) => j.uf || v);
      if (j.complemento) setComplemento((v) => v || j.complemento);
    } catch {
      setAvisoCep("Não foi possível buscar o CEP agora. Preencha o endereço à mão.");
    }
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
        confirmarSenha,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
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

  const botaoCadastrar = (
    <button
      type="submit"
      className="conta-botao corp-botao-cadastrar"
      disabled={pendente || cnpjRuim || senhaDiferente || (logado && !confirmo)}
    >
      {pendente ? "Cadastrando..." : "Cadastrar"}
    </button>
  );

  const formCadastro = (
    <form className="corp-form-cadastro" onSubmit={enviar} aria-label="Cadastrar empresa">
      <div className="corp-linha corp-linha-1">
        <label className="conta-campo">
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
      </div>

      <div className="corp-linha corp-linha-2">
        <label className="conta-campo">
          CEP
          <input
            value={cep}
            onChange={(e) => setCep(mascaraCep(e.target.value))}
            onBlur={buscarCep}
            inputMode="numeric"
            autoComplete="postal-code"
            required
          />
        </label>
        <label className="conta-campo">
          Logradouro
          <input value={logradouro} onChange={(e) => setLogradouro(e.target.value)} maxLength={160} autoComplete="address-line1" />
        </label>
        <label className="conta-campo">
          Número
          <input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={20} required />
        </label>
        <label className="conta-campo">
          Bairro
          <input value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={80} />
        </label>
        <label className="conta-campo">
          Complemento
          <input value={complemento} onChange={(e) => setComplemento(e.target.value)} maxLength={80} />
        </label>
        <label className="conta-campo">
          Cidade
          <input value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={80} required />
        </label>
        <label className="conta-campo">
          Estado
          <input
            value={uf}
            onChange={(e) => setUf(e.target.value.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase())}
            maxLength={2}
            required
          />
        </label>
        {avisoCep && <p className="inicio-sub corp-linha-cheia">{avisoCep}</p>}
      </div>

      <div className={`corp-linha ${logado ? "corp-linha-1" : "corp-linha-3"}`}>
        {!logado && (
          <label className="conta-campo">
            Comprador
            <input value={contato} onChange={(e) => setContato(e.target.value)} maxLength={120} autoComplete="name" required />
          </label>
        )}
        {!logado && (
          <label className="conta-campo">
            E-mail de acesso
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
        )}
        <label className="conta-campo">
          Telefone
          <input value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} inputMode="tel" required />
        </label>
      </div>

      {/* Senha e Confirmar com a largura do Telefone (1fr de 4) e o botao
          Cadastrar na mesma linha (pedido do Joaquim, 21/11/2026). */}
      {!logado && (
        <div className="corp-linha corp-linha-senha">
          <CampoSenha value={senha} onChange={setSenha} autoComplete="new-password" minLength={6} />
          <CampoSenha
            rotulo="Confirmar senha"
            value={confirmarSenha}
            onChange={setConfirmarSenha}
            autoComplete="new-password"
            minLength={6}
            inputStyle={senhaDiferente ? { borderColor: "#B3261E" } : undefined}
          />
          <div className="conta-form-acoes corp-acoes-senha">
            {botaoCadastrar}
            {cnpjRuim && <span className="conta-erro">CNPJ inválido.</span>}
            {senhaDiferente && <span className="conta-erro">A confirmação não bate com a senha.</span>}
          </div>
        </div>
      )}

      {logado && (
        <label className="corp-confirmo">
          <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} /> Confirmo que a
          empresa fica ligada ao meu cadastro ({logadoComo.email}), que passa a ser o acesso de administrador dela.
        </label>
      )}

      {logado && (
        <div className="conta-form-acoes">
          {botaoCadastrar}
          {cnpjRuim && <span className="conta-erro">CNPJ inválido.</span>}
        </div>
      )}
      {avisoErro}
    </form>
  );

  if (logado) {
    return (
      <div className="corp-acesso corp-acesso-cheio">
        <div className="corp-caixa">
          <h1 className="corp-titulo">Cadastrar empresa</h1>
          <div className="corp-logado" aria-label="Cadastro logado">
            <span>
              Você está logado como <b>{logadoComo.nome || logadoComo.email}</b>
              {logadoComo.nome ? ` (${logadoComo.email})` : ""}. Não é você?
            </span>
            <SairButton destino="/corporativo" />
          </div>
          {formCadastro}
        </div>
      </div>
    );
  }

  return (
    <div className={`corp-acesso${modo === "cadastrar" ? " corp-acesso-cheio" : " corp-acesso-entrar"}`}>
      {modo === "entrar" && <QuadroInfo />}
      <div className="corp-caixa">
        <div className="corp-escolha" role="tablist" aria-label="Acesso corporativo">
          <button type="button" role="tab" aria-selected={modo === "entrar"} onClick={() => trocar("entrar")}>
            Já tenho conta
          </button>
          <button type="button" role="tab" aria-selected={modo === "cadastrar"} onClick={() => trocar("cadastrar")}>
            Cadastrar
          </button>
        </div>

        {modo === "entrar" ? (
          <>
            <BotaoGoogle destino="/corporativo" />
            <form className="corp-form-entrar" onSubmit={entrar} aria-label="Entrar na conta corporativa">
              <label className="conta-campo">
                E-mail ou CNPJ
                <input value={login} onChange={(e) => setLogin(mascaraLogin(e.target.value))} autoComplete="username" required />
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
          </>
        ) : (
          formCadastro
        )}
      </div>
    </div>
  );
}
