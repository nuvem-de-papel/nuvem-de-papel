"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useCart } from "@/components/carrinho/CartProvider";
import { cotarFrete, finalizarCheckout, type EnderecoInput, type OpcaoFrete } from "@/app/checkout/actions";

type EnderecoSalvo = {
  id: string;
  recipient_name: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  fontSize: 14.5,
  fontFamily: "'Open Sans', sans-serif",
  background: "#FFFFFF",
  outline: "none",
  boxSizing: "border-box",
};

const CARD: React.CSSProperties = {
  background: "var(--bg-cloud)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-card)",
  padding: 24,
  boxShadow: "var(--shadow-card)",
};

function soDigitos(v: string) {
  return v.replace(/\D/g, "");
}

function mascaraCep(v: string) {
  const d = soDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function CheckoutForm({
  enderecos,
  nomePadrao,
  email,
}: {
  enderecos: EnderecoSalvo[];
  nomePadrao: string;
  email: string;
}) {
  const { itens, totalValor, clear } = useCart();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [pagamento, setPagamento] = useState<"pix" | "cartao" | "boleto">("pix");
  const [usarSalvo, setUsarSalvo] = useState(enderecos.length > 0);
  const [addressId, setAddressId] = useState(enderecos[0]?.id ?? "");
  const [cep, setCep] = useState("");
  const [cepBuscando, setCepBuscando] = useState(false);
  const [nome, setNome] = useState(nomePadrao);
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [salvar, setSalvar] = useState(true);

  // frete (0028): cotação automática quando o CEP fica completo; o valor é
  // sempre do servidor — aqui só escolhemos a modalidade.
  const [freteOpcoes, setFreteOpcoes] = useState<OpcaoFrete[]>([]);
  const [freteAviso, setFreteAviso] = useState<string | null>(null);
  const [freteErro, setFreteErro] = useState<string | null>(null);
  const [fretePendente, setFretePendente] = useState(false);
  // null = cliente ainda NAO escolheu. Default silencioso "retirada" faria
  // pedido de entrega nascer como retirada concluida no backoffice (EN-01).
  const [freteEscolha, setFreteEscolha] = useState<"pac" | "sedex" | "retirada" | null>(null);

  const cepSalvo = usarSalvo ? enderecos.find((e) => e.id === addressId)?.cep ?? "" : "";
  const cepEfetivo = (usarSalvo ? cepSalvo : cep).replace(/\D/g, "");

  useEffect(() => {
    if (cepEfetivo.length !== 8 || itens.length === 0) {
      setFreteOpcoes([]);
      setFreteAviso(null);
      setFreteErro(null);
      setFreteEscolha(null);
      return;
    }
    let vivo = true;
    setFretePendente(true);
    setFreteErro(null);
    cotarFrete({ cep: cepEfetivo, itens: itens.map((i) => ({ item_id: i.id, qty: i.qty })) })
      .then((r) => {
        if (!vivo) return;
        if (!r.ok) {
          setFreteOpcoes([]);
          setFreteAviso(null);
          setFreteErro(r.erro);
          // retirada não depende de cotação: escolha explícita é preservada
          setFreteEscolha((atual) => (atual === "retirada" ? "retirada" : null));
          return;
        }
        setFreteOpcoes(r.opcoes);
        setFreteAviso(r.aviso);
        setFreteEscolha((atual) => {
          if (atual === "retirada") return "retirada";
          if (atual && r.opcoes.some((o) => o.servico === atual)) return atual;
          return null;
        });
      })
      .catch(() => {
        if (!vivo) return;
        setFreteErro("Não foi possível calcular o frete agora. Tente novamente.");
        setFreteEscolha((atual) => (atual === "retirada" ? "retirada" : null));
      })
      .finally(() => vivo && setFretePendente(false));
    return () => {
      vivo = false;
    };
    // itens muda com o carrinho (peso), cepEfetivo com o endereco
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cepEfetivo, itens]);

  async function buscarCep() {
    const d = soDigitos(cep);
    if (d.length !== 8) return;
    setCepBuscando(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (!j.erro) {
        setLogradouro(j.logradouro ?? "");
        setBairro(j.bairro ?? "");
        setCidade(j.localidade ?? "");
        setUf(j.uf ?? "");
      }
    } catch {
      // offline — campos seguem editáveis
    } finally {
      setCepBuscando(false);
    }
  }

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    // escolha do frete obrigatoria quando ja da para cotar: sem escolha, o
    // servidor recusa (e um default silencioso seria pior que um aviso aqui)
    if (cepEfetivo.length === 8 && !freteEscolha) {
      setErro("Escolha a modalidade de entrega: retirar na loja ou frete.");
      return;
    }

    const enderecoNovo: EnderecoInput = {
      recipientName: nome,
      cep: soDigitos(cep),
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
    };

    startTransition(async () => {
      const r = await finalizarCheckout({
        itens: itens.map((i) => ({ item_id: i.id, qty: i.qty })),
        pagamento,
        addressId: usarSalvo && addressId ? addressId : null,
        endereco: !usarSalvo || !addressId ? enderecoNovo : null,
        salvarEndereco: salvar,
        frete: freteEscolha,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      clear();
      if (r.initPoint) {
        window.location.href = r.initPoint;
      } else {
        window.location.href = `/conta/pedidos?novo=${r.pedidoId}&mp=0`;
      }
    });
  }

  if (itens.length === 0) {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 32px", textAlign: "center" }}>
        <h1 className="display" style={{ fontSize: 30, marginBottom: 12 }}>
          Carrinho vazio
        </h1>
        <p style={{ color: "var(--ink-soft)", marginBottom: 24 }}>
          Adicione produtos antes de finalizar.
        </p>
        <Link
          href="/produtos"
          style={{ background: "var(--pink-600)", color: "#FFF", padding: "13px 26px", borderRadius: 999, fontWeight: 700, textDecoration: "none" }}
        >
          Ver produtos
        </Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 32, marginBottom: 28 }}>
        Checkout
      </h1>

      <form onSubmit={confirmar} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section style={CARD}>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Endereço de entrega</h2>

            {enderecos.length > 0 && (
              <div style={{ marginBottom: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
                  <input type="radio" checked={usarSalvo} onChange={() => setUsarSalvo(true)} style={{ marginTop: 3 }} />
                  <span>
                    Usar endereço salvo
                    {enderecos.map((e) => (
                      <label
                        key={e.id}
                        style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 13.5, cursor: "pointer", color: "var(--ink-soft)" }}
                      >
                        <input
                          type="radio"
                          name="endereco-salvo"
                          checked={addressId === e.id}
                          onChange={() => setAddressId(e.id)}
                          disabled={!usarSalvo}
                        />
                        <span>
                          {e.logradouro}, {e.numero} — {e.bairro}, {e.cidade}/{e.uf} · CEP {e.cep}
                        </span>
                      </label>
                    ))}
                  </span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
                  <input type="radio" checked={!usarSalvo} onChange={() => setUsarSalvo(false)} />
                  Entregar em outro endereço
                </label>
              </div>
            )}

            {!usarSalvo && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ gridColumn: "1 / -1", fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>
                  Quem recebe
                  <input style={INPUT} value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Nome completo" />
                </label>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>
                  CEP
                  <input
                    style={INPUT}
                    value={cep}
                    onChange={(e) => setCep(mascaraCep(e.target.value))}
                    onBlur={buscarCep}
                    required
                    inputMode="numeric"
                    placeholder="00000-000"
                  />
                </label>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>
                  Número
                  <input style={INPUT} value={numero} onChange={(e) => setNumero(e.target.value)} required placeholder="123" />
                </label>
                <label style={{ gridColumn: "1 / -1", fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>
                  Rua {cepBuscando && <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>buscando CEP…</span>}
                  <input style={INPUT} value={logradouro} onChange={(e) => setLogradouro(e.target.value)} required placeholder="Rua, avenida…" />
                </label>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>
                  Bairro
                  <input style={INPUT} value={bairro} onChange={(e) => setBairro(e.target.value)} required />
                </label>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>
                  Complemento
                  <input style={INPUT} value={complemento} onChange={(e) => setComplemento(e.target.value)} placeholder="opcional" />
                </label>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>
                  Cidade
                  <input style={INPUT} value={cidade} onChange={(e) => setCidade(e.target.value)} required />
                </label>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>
                  UF
                  <input style={{ ...INPUT, textTransform: "uppercase" }} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} required maxLength={2} />
                </label>
                <label style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, cursor: "pointer", fontWeight: 400 }}>
                  <input type="checkbox" checked={salvar} onChange={(e) => setSalvar(e.target.checked)} />
                  Salvar este endereço para as próximas compras
                </label>
              </div>
            )}
          </section>

          <section style={CARD} data-testid="entrega-frete">
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Entrega</h2>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 14px" }}>
              Prazo e valor calculados pela tabela dos Correios para o CEP informado.
            </p>

            {cepEfetivo.length !== 8 && (
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
                Informe um CEP completo para ver as opções de entrega.
              </p>
            )}

            {cepEfetivo.length === 8 && fretePendente && (
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>Calculando o frete…</p>
            )}

            {freteErro && (
              <p style={{ background: "#FDECEC", color: "#C62828", fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 8 }}>
                {freteErro}
              </p>
            )}

            {freteAviso && (
              <p style={{ background: "#FFF6E5", color: "#8A6100", fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 8, marginBottom: 12 }}>
                {freteAviso}
              </p>
            )}

            {/* opcoes ficam visiveis tambem com erro de cotacao: retirada nao
                depende da tabela e e sempre uma saida valida */}
            {cepEfetivo.length === 8 && !fretePendente && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: "12px 14px",
                    border: `1.5px solid ${freteEscolha === "retirada" ? "var(--pink-600)" : "var(--border)"}`,
                    borderRadius: 12,
                    cursor: "pointer",
                    background: freteEscolha === "retirada" ? "var(--pink-100)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="frete"
                    checked={freteEscolha === "retirada"}
                    onChange={() => setFreteEscolha("retirada")}
                  />
                  <span>
                    <strong style={{ fontSize: 14.5 }}>Retirar na loja</strong>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-soft)" }}>Sem custo de frete</span>
                  </span>
                </label>

                {freteOpcoes.map((op) => (
                  <label
                    key={op.servico}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "12px 14px",
                      border: `1.5px solid ${freteEscolha === op.servico ? "var(--pink-600)" : "var(--border)"}`,
                      borderRadius: 12,
                      cursor: "pointer",
                      background: freteEscolha === op.servico ? "var(--pink-100)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="frete"
                      checked={freteEscolha === op.servico}
                      onChange={() => setFreteEscolha(op.servico)}
                    />
                    <span style={{ flex: 1 }}>
                      <strong style={{ fontSize: 14.5 }}>{op.servico === "pac" ? "PAC" : "SEDEX"}</strong>
                      <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-soft)" }}>
                        até {op.prazo} {op.prazo === 1 ? "dia útil" : "dias úteis"}
                      </span>
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{brl(op.valor)}</span>
                  </label>
                ))}

                {freteOpcoes.length === 0 && !freteAviso && !freteErro && (
                  <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
                    Nenhuma modalidade disponível para este destino — retire na loja ou fale conosco.
                  </p>
                )}
              </div>
            )}
          </section>

          <section style={CARD}>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Pagamento</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { id: "pix", label: "Pix", desc: "Aprovação imediata" },
                { id: "cartao", label: "Cartão de crédito", desc: "Parcelamento conforme regra da operadora" },
                { id: "boleto", label: "Boleto", desc: "Compensação em até 2 dias úteis" },
              ].map((op) => (
                <label
                  key={op.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: "12px 14px",
                    border: `1.5px solid ${pagamento === op.id ? "var(--pink-600)" : "var(--border)"}`,
                    borderRadius: 12,
                    cursor: "pointer",
                    background: pagamento === op.id ? "var(--pink-100)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="pagamento"
                    checked={pagamento === op.id}
                    onChange={() => setPagamento(op.id as "pix" | "cartao" | "boleto")}
                  />
                  <span>
                    <strong style={{ fontSize: 14.5 }}>{op.label}</strong>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-soft)" }}>{op.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside style={{ ...CARD, position: "sticky", top: 88 }}>
          <h2 style={{ fontSize: 18, marginBottom: 14 }}>Resumo</h2>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "-6px 0 12px" }}>
            Comprador: <strong>{email}</strong>
          </p>
          {itens.map((i) => (
            <div key={i.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--ink)" }}>
                {i.qty}× {i.name}
              </span>
              <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{brl(i.price * i.qty)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--ink)" }}>
              Frete{" "}
              {freteEscolha
                ? freteEscolha === "retirada"
                  ? "(retirada)"
                  : `(${freteEscolha.toUpperCase()})`
                : "(a escolher)"}
            </span>
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
              {freteEscolha === null
                ? "—"
                : freteEscolha === "retirada"
                  ? "Grátis"
                  : brl(freteOpcoes.find((o) => o.servico === freteEscolha)?.valor ?? 0)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, alignItems: "baseline" }}>
            <span style={{ fontWeight: 700 }}>Total</span>
            <span className="display" style={{ fontSize: 24 }}>
              {brl(
                totalValor +
                  (freteEscolha && freteEscolha !== "retirada"
                    ? freteOpcoes.find((o) => o.servico === freteEscolha)?.valor ?? 0
                    : 0)
              )}
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "6px 0 16px" }}>
            Preço final recalculado no servidor antes de cobrar.
          </p>

          {erro && (
            <p style={{ background: "#FDECEC", color: "#C62828", fontSize: 13.5, fontWeight: 600, padding: "10px 14px", borderRadius: 8, marginBottom: 14 }}>
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={pendente}
            style={{
              width: "100%",
              background: "var(--pink-600)",
              color: "#FFF",
              padding: "14px",
              border: "none",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 15.5,
              cursor: pendente ? "wait" : "pointer",
              opacity: pendente ? 0.7 : 1,
            }}
          >
            {pendente ? "Processando…" : "Confirmar pedido"}
          </button>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", textAlign: "center", marginTop: 10 }}>
            Compra segura · dados protegidos
          </p>
        </aside>
      </form>
    </main>
  );
}
