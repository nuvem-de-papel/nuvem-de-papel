"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useOrcamento, type OrcamentoItem } from "@/components/orcamento/OrcamentoProvider";
import {
  enviarOrcamento,
  infoItensOrcamento,
  type EnviarOrcamentoResultado,
} from "@/app/orcamento/actions";
import { PRAZO_ENCOMENDA_DIAS_UTEIS, ORCAMENTO_QTD_MAX } from "@/lib/orcamentoConfig";
import { formatarReal, precoUnitario, type InfoItemOrcamento } from "@/lib/orcamentoPrecos";

type Usuario = { email: string; nome: string } | null;
type Sucesso = Extract<EnviarOrcamentoResultado, { ok: true }>;

const campo = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  background: "#FFFFFF",
  border: "1px solid var(--ink-faint)",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box" as const,
};
const cartaoForm = {
  background: "var(--bg-cloud)",
  border: "1px solid var(--ink-faint)",
  borderRadius: 14,
  padding: 20,
};
const cartao = {
  background: "#FFFFFF",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 2px 12px rgba(0, 107, 225,0.08)",
};

const ajuda = { fontSize: 12, color: "var(--ink-soft)", margin: "6px 0 0" } as const;
// campo com rotulo dentro da caixa: mais espaco em cima para o rotulo flutuante
const campoFlut = { ...campo, padding: "18px 12px 6px" };

// Campo de senha com botao Mostrar/Ocultar e rotulo dentro da caixa.
function CampoSenha({
  id,
  name,
  label,
  autoComplete,
  dica,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  dica?: string;
}) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="orc-cel">
      <div className="orc-flut">
        <input
          id={id}
          name={name}
          type={visivel ? "text" : "password"}
          required
          minLength={8}
          autoComplete={autoComplete}
          placeholder=" "
          style={{ ...campoFlut, paddingRight: 80 }}
        />
        <label htmlFor={id}>{label}</label>
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visivel}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            color: "var(--navy)",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
            padding: "4px 6px",
          }}
        >
          {visivel ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {dica && <p style={ajuda}>{dica}</p>}
    </div>
  );
}

export function OrcamentoForm({
  usuario,
  equipeEmail,
}: {
  usuario: Usuario;
  equipeEmail: string | null;
}) {
  const { itens, setQty, removeItem, clear } = useOrcamento();
  const [modo, setModo] = useState<"novo" | "entrar">("novo");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<Sucesso | null>(null);
  // undefined = conferindo; null = nao deu pra conferir; objeto = saldo CD e faixas de preco por item
  const [info, setInfo] = useState<Record<string, InfoItemOrcamento> | null | undefined>(undefined);
  const [pendente, startTransition] = useTransition();
  const [cep, setCep] = useState("");
  const [end, setEnd] = useState({ rua: "", bairro: "", cidade: "", uf: "" });
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [avisoCep, setAvisoCep] = useState<string | null>(null);
  const cepDigitos = cep.replace(/\D/g, "");

  // ViaCEP: preenche rua, bairro, cidade e UF quando o CEP tem 8 digitos
  useEffect(() => {
    if (cepDigitos.length !== 8) return;
    let cancelado = false;
    setBuscandoCep(true);
    setAvisoCep(null);
    fetch(`https://viacep.com.br/ws/${cepDigitos}/json/`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        if (d.erro) {
          setAvisoCep("CEP não encontrado. Confira ou preencha o endereço.");
          return;
        }
        setEnd({ rua: d.logradouro ?? "", bairro: d.bairro ?? "", cidade: d.localidade ?? "", uf: d.uf ?? "" });
      })
      .catch(() => {
        if (!cancelado) setAvisoCep("Não deu para buscar o CEP agora. Preencha o endereço.");
      })
      .finally(() => {
        if (!cancelado) setBuscandoCep(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cepDigitos]);

  const idsKey = itens.map((i) => i.id).join(",");
  useEffect(() => {
    if (!idsKey) return;
    let cancelado = false;
    infoItensOrcamento(idsKey.split(",")).then((r) => {
      if (!cancelado) setInfo(r);
    });
    return () => {
      cancelado = true;
    };
  }, [idsKey]);

  function enviar(form: HTMLFormElement) {
    if (equipeEmail) return;
    const fd = new FormData(form);
    if (!usuario && modo === "novo" && String(fd.get("senha") ?? "") !== String(fd.get("confirma") ?? "")) {
      setErro("As senhas não coincidem.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const r = await enviarOrcamento({
        itens: itens.map((i) => ({ id: i.id, qty: i.qty })),
        cep: String(fd.get("cep") ?? ""),
        mensagem: String(fd.get("mensagem") ?? ""),
        endereco: {
          rua: String(fd.get("rua") ?? ""),
          numero: String(fd.get("numero") ?? ""),
          complemento: String(fd.get("complemento") ?? ""),
          bairro: String(fd.get("bairro") ?? ""),
          cidade: String(fd.get("cidade") ?? ""),
          uf: String(fd.get("uf") ?? ""),
        },
        consentimento: fd.get("consentimento") === "on",
        modo: usuario ? undefined : modo,
        nome: String(fd.get("nome") ?? ""),
        email: String(fd.get("email") ?? ""),
        telefone: String(fd.get("telefone") ?? ""),
        senha: String(fd.get("senha") ?? ""),
      });
      if (r.ok) {
        clear();
        setSucesso(r);
      } else {
        setErro(r.erro);
      }
    });
  }

  // Valores de referencia: preco da faixa vigente para a quantidade pedida.
  function valores(i: OrcamentoItem) {
    const faixas = info?.[i.id]?.faixas ?? [];
    const unit = precoUnitario(faixas, i.qty);
    return { unit, sub: unit === null ? null : unit * i.qty };
  }

  function resumo(lista: OrcamentoItem[]) {
    let total = 0;
    let semPreco = 0;
    let unidades = 0;
    for (const i of lista) {
      unidades += i.qty;
      const { sub } = valores(i);
      if (sub === null) semPreco += 1;
      else total += sub;
    }
    return { total, semPreco, unidades, itens: lista.length };
  }

  function textoValor(r: ReturnType<typeof resumo>) {
    if (info === undefined) return "…";
    if (info === null || r.itens === 0 || r.semPreco === r.itens) return "a confirmar";
    return formatarReal(r.total) + (r.semPreco > 0 ? " (parcial)" : "");
  }

  function linha(i: OrcamentoItem) {
    const { unit, sub } = valores(i);
    const textoUnit = info === undefined ? "…" : unit === null ? "a confirmar" : formatarReal(unit);
    const textoSub = info === undefined ? "…" : sub === null ? "a confirmar" : formatarReal(sub);
    return (
      <div key={i.id} className="orc-linha">
        <div className="orc-nome" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{i.name}</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>SKU {i.sku}</div>
        </div>
        <div className="orc-qtd">
          <input
            type="number"
            aria-label={`Quantidade de ${i.name}`}
            min={1}
            max={ORCAMENTO_QTD_MAX}
            value={i.qty}
            onChange={(e) => setQty(i.id, Number(e.target.value))}
            style={{ ...campo, width: 84 }}
          />
        </div>
        <div className="orc-unit" style={{ fontSize: 13, color: "var(--ink-soft)", textAlign: "right" }}>
          <span className="orc-rotulo">Unitário </span>
          {textoUnit}
        </div>
        <div className="orc-sub" style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)", textAlign: "right" }}>
          <span className="orc-rotulo">Subtotal </span>
          {textoSub}
        </div>
        <div className="orc-remover">
          <button
            type="button"
            onClick={() => removeItem(i.id)}
            style={{ background: "transparent", border: "none", color: "var(--pink-600)", fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0 }}
          >
            Remover
          </button>
        </div>
      </div>
    );
  }

  function secao(titulo: string, subtitulo: string, lista: OrcamentoItem[]) {
    if (lista.length === 0) return null;
    return (
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h3 className="display" style={{ fontSize: 16, margin: "0 0 2px", color: "var(--navy)" }}>
            {titulo} ({lista.length})
          </h3>
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Subtotal: <strong style={{ color: "var(--navy)" }}>{textoValor(resumo(lista))}</strong>
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 4px" }}>{subtitulo}</p>
        {lista.map(linha)}
      </div>
    );
  }

  if (sucesso) {
    return (
      <div style={{ ...cartao, padding: 28 }}>
        <h2 className="display" style={{ fontSize: 24, margin: "0 0 8px", color: "var(--navy)" }}>
          Orçamento enviado
        </h2>
        <p style={{ fontSize: 15, color: "var(--ink-soft)", margin: "0 0 10px" }}>
          Protocolo <strong>#{sucesso.protocolo}</strong>. Entraremos em contato com o orçamento.
        </p>
        {sucesso.confirmarEmail && (
          <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 10px" }}>
            Enviamos um e-mail para confirmar seu cadastro. Confirme para acessar sua conta.
          </p>
        )}
        <Link href="/produtos" style={{ fontWeight: 700, color: "var(--pink-600)" }}>
          Voltar aos produtos
        </Link>
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <div style={{ ...cartao, padding: 28, textAlign: "center" }}>
        <p style={{ fontSize: 16, color: "var(--ink-soft)", margin: "0 0 14px" }}>
          Sua lista de orçamento está vazia.
        </p>
        <Link href="/produtos" style={{ fontWeight: 700, color: "var(--pink-600)" }}>
          Ver produtos
        </Link>
      </div>
    );
  }

  const emEstoque = info ? itens.filter((i) => (info[i.id]?.saldo ?? 0) >= i.qty) : [];
  const sobEncomenda = info ? itens.filter((i) => (info[i.id]?.saldo ?? 0) < i.qty) : [];
  const geral = resumo(itens);
  const semPrecoGeral = geral.semPreco;

  return (
    <div className="orcamento-layout">
      <section style={cartao} aria-label="Lista do orçamento">
        <h2 className="display" style={{ fontSize: 18, margin: "0 0 4px", color: "var(--navy)" }}>
          Produtos no orçamento
        </h2>
        {info === undefined && <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>Conferindo estoque e preços...</p>}
        {info === null && (
          <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Não deu para conferir estoque e preços agora. A equipe confirma o valor de cada item.
          </p>
        )}

        <div className="orc-cabecalho" aria-hidden="true">
          <span>Produto</span>
          <span>Qtd</span>
          <span style={{ textAlign: "right" }}>Unitário</span>
          <span style={{ textAlign: "right" }}>Subtotal</span>
          <span />
        </div>

        {info ? (
          <>
            {secao(
              "Em estoque",
              "Pronta entrega pelo CD. Prazo de entrega conforme o seu CEP, informado no orçamento.",
              emEstoque
            )}
            {secao(
              "Sob encomenda",
              `Prazo de compra e entrega: ${
                PRAZO_ENCOMENDA_DIAS_UTEIS ? `${PRAZO_ENCOMENDA_DIAS_UTEIS} dias úteis.` : "a confirmar pela equipe."
              }`,
              sobEncomenda
            )}
          </>
        ) : (
          itens.map(linha)
        )}

        <div className="orc-totais">
          {info && emEstoque.length > 0 && (
            <div className="orc-totais-linha">
              <span>Em estoque · {resumo(emEstoque).unidades} un.</span>
              <strong>{textoValor(resumo(emEstoque))}</strong>
            </div>
          )}
          {info && sobEncomenda.length > 0 && (
            <div className="orc-totais-linha">
              <span>Sob encomenda · {resumo(sobEncomenda).unidades} un.</span>
              <strong>{textoValor(resumo(sobEncomenda))}</strong>
            </div>
          )}
          <div className="orc-totais-linha orc-totais-final">
            <span className="display">Total estimado · {geral.unidades} un.</span>
            <strong>{textoValor(geral)}</strong>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "10px 0 0", lineHeight: 1.5 }}>
            Valores de referência pela tabela de varejo, na quantidade pedida. Frete e prazo de entrega são confirmados pela equipe.
            {info && semPrecoGeral > 0 && ` ${semPrecoGeral} ${semPrecoGeral === 1 ? "item sem preço cadastrado" : "itens sem preço cadastrado"}: total parcial.`}
          </p>
        </div>
      </section>

      <form
        className="orcamento-form"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(e.currentTarget);
        }}
        style={cartaoForm}
      >
        <h2 className="display" style={{ fontSize: 18, margin: "0 0 6px", color: "var(--navy)" }}>
          Dados do cliente
        </h2>

        {equipeEmail ? (
          <div role="alert" style={{ background: "var(--pink-100)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
            <strong style={{ fontSize: 14, color: "var(--navy)" }}>
              Você está logado como equipe ({equipeEmail}).
            </strong>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "6px 0 0", lineHeight: 1.5 }}>
              O orçamento precisa ser de um cliente. Saia da conta da equipe ou abra uma janela anônima para enviar como cliente.
            </p>
          </div>
        ) : usuario ? (
          <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 14px" }}>
            Orçamento para <strong>{usuario.email}</strong>.
          </p>
        ) : (
          <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 14px" }}>
            Crie seu cadastro ou entre com sua conta abaixo.
          </p>
        )}

        {!usuario && (
          <div style={{ display: "flex", gap: 8, margin: "0 0 14px" }}>
            {(["novo", "entrar"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                style={{
                  flex: 1,
                  padding: "9px 10px",
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  border: modo === m ? "none" : "1.5px solid var(--navy)",
                  background: modo === m ? "var(--navy)" : "transparent",
                  color: modo === m ? "#FFFFFF" : "var(--navy)",
                }}
              >
                {m === "novo" ? "Criar cadastro" : "Já tenho cadastro"}
              </button>
            ))}
          </div>
        )}

        <h3 className="display" style={{ fontSize: 16, margin: "18px 0 0", color: "var(--navy)" }}>
          Endereço de entrega
        </h3>

        <div className="orc-grade orc-g-cep">
          <div className="orc-cel">
            <div className="orc-flut">
              <input
                id="orc-cep"
                name="cep"
                required
                inputMode="numeric"
                maxLength={9}
                placeholder=" "
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                style={campoFlut}
              />
              <label htmlFor="orc-cep">CEP</label>
            </div>
            {buscandoCep && <p style={ajuda}>Buscando...</p>}
            {avisoCep && <p style={ajuda}>{avisoCep}</p>}
          </div>
          <div className="orc-cel">
            <div className="orc-flut">
              <input
                id="orc-rua"
                name="rua"
                required
                maxLength={160}
                placeholder=" "
                value={end.rua}
                onChange={(e) => setEnd({ ...end, rua: e.target.value })}
                style={campoFlut}
              />
              <label htmlFor="orc-rua">Endereço</label>
            </div>
          </div>
          <div className="orc-cel">
            <div className="orc-flut">
              <input id="orc-numero" name="numero" required maxLength={10} placeholder=" " style={campoFlut} />
              <label htmlFor="orc-numero">Número</label>
            </div>
          </div>
        </div>

        <div className="orc-grade orc-g-local">
          <div className="orc-cel">
            <div className="orc-flut">
              <input id="orc-compl" name="complemento" maxLength={120} placeholder=" " style={campoFlut} />
              <label htmlFor="orc-compl">Complemento</label>
            </div>
          </div>
          <div className="orc-cel">
            <div className="orc-flut">
              <input
                id="orc-bairro"
                name="bairro"
                required
                maxLength={100}
                placeholder=" "
                value={end.bairro}
                onChange={(e) => setEnd({ ...end, bairro: e.target.value })}
                style={campoFlut}
              />
              <label htmlFor="orc-bairro">Bairro</label>
            </div>
          </div>
          <div className="orc-cel">
            <div className="orc-flut">
              <input
                id="orc-cidade"
                name="cidade"
                required
                maxLength={100}
                placeholder=" "
                value={end.cidade}
                onChange={(e) => setEnd({ ...end, cidade: e.target.value })}
                style={campoFlut}
              />
              <label htmlFor="orc-cidade">Cidade</label>
            </div>
          </div>
          <div className="orc-cel">
            <div className="orc-flut">
              <input
                id="orc-uf"
                name="uf"
                required
                maxLength={2}
                placeholder=" "
                value={end.uf}
                onChange={(e) => setEnd({ ...end, uf: e.target.value.toUpperCase() })}
                style={campoFlut}
              />
              <label htmlFor="orc-uf">UF</label>
            </div>
          </div>
        </div>

        {!usuario && modo === "novo" && (
          <div className="orc-grade orc-g-nome-tel">
            <div className="orc-cel">
              <div className="orc-flut">
                <input id="orc-nome" name="nome" required minLength={2} maxLength={120} placeholder=" " style={campoFlut} />
                <label htmlFor="orc-nome">Nome completo</label>
              </div>
            </div>
            <div className="orc-cel">
              <div className="orc-flut">
                <input id="orc-tel" name="telefone" required inputMode="tel" maxLength={16} placeholder=" " style={campoFlut} />
                <label htmlFor="orc-tel">Telefone</label>
              </div>
            </div>
          </div>
        )}

        {!usuario && (
          <div className="orc-grade orc-g-1">
            <div className="orc-cel">
              <div className="orc-flut">
                <input id="orc-email" name="email" type="email" required maxLength={160} placeholder=" " style={campoFlut} />
                <label htmlFor="orc-email">E-mail</label>
              </div>
            </div>
          </div>
        )}

        {!usuario && modo === "novo" && (
          <div className="orc-grade orc-g-2">
            <CampoSenha
              id="orc-senha"
              name="senha"
              label="Crie uma senha"
              autoComplete="new-password"
              dica="Mínimo de 8 caracteres."
            />
            <CampoSenha id="orc-confirma" name="confirma" label="Confirme a senha" autoComplete="new-password" />
          </div>
        )}

        {!usuario && modo === "entrar" && (
          <div className="orc-grade orc-g-1">
            <CampoSenha id="orc-senha" name="senha" label="Sua senha" autoComplete="current-password" />
          </div>
        )}

        <div className="orc-grade orc-g-1">
          <div className="orc-cel">
            <div className="orc-flut">
              <textarea
                id="orc-msg"
                name="mensagem"
                maxLength={1000}
                rows={3}
                placeholder=" "
                style={{ ...campoFlut, resize: "vertical" }}
              />
              <label htmlFor="orc-msg">Mensagem (opcional)</label>
            </div>
          </div>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, marginTop: 16, color: "var(--ink)" }}>
          <input type="checkbox" name="consentimento" required style={{ marginTop: 3 }} />
          <span>Autorizo a Nuvem de Papel a entrar em contato sobre este orçamento.</span>
        </label>

        {erro && (
          <p role="alert" style={{ fontSize: 13, color: "var(--pink-600)", fontWeight: 700, margin: "14px 0 0" }}>
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={pendente || equipeEmail !== null}
          style={{
            background: "var(--navy)",
            color: "#FFFFFF",
            border: "none",
            padding: "12px 16px",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
            width: "100%",
            marginTop: 18,
            opacity: pendente ? 0.6 : 1,
          }}
        >
          {pendente ? "Enviando..." : "Enviar orçamento"}
        </button>
      </form>
    </div>
  );
}
