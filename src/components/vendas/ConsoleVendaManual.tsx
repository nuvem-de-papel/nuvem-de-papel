"use client";

// Venda manual de telefone/balcao (0040): venda COMPLETA sem caixa aberto.
// Layout "console de balcao" em tela unica — grade de itens e o heroi, o
// resumo/TOTAL fica fixo a direita, cadastro de cliente abre no miolo e a
// entrega e uma faixa no rodape. Logica IDENTICA a versao original: mesma
// server action `registrarVendaManual` (chama a RPC `manual_register_sale`,
// que baixa estoque, gera titulo + parcelas e abre a linha de Expedicao quando
// ha entrega). Mesmo idioma visual do PDV/Vendas.
// Extras: verificador de CPF/CNPJ (DV) no cadastro, com aviso imediato e
// trava no botao; CEP busca automatica (ViaCEP) ao sair do campo.
// Contrato E2E preservado: todos os aria-label e a section "Resumo da venda".

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { registrarVendaManual } from "@/app/vendas/actions";
import { documentoValido } from "@/lib/documento";

export type ItemLista = {
  id: string;
  sku: string;
  name: string;
  precoVarejo: number;
  precoAtacado: number | null;
  estoque: number | null;
};

export type ClienteLista = {
  id: string;
  nome: string;
  documento: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
};

type LinhaCarrinho = { item_id: string; sku: string; name: string; qty: number };

const METODOS: { valor: string; label: string; parcela: boolean; hint: string }[] = [
  { valor: "dinheiro", label: "Dinheiro", parcela: false, hint: "recebido na hora" },
  { valor: "pix", label: "PIX", parcela: false, hint: "recebido na hora" },
  { valor: "debito", label: "Débito", parcela: false, hint: "recebido na hora" },
  { valor: "cartao", label: "Cartão de crédito", parcela: true, hint: "parcelas viram título a receber" },
  { valor: "boleto", label: "Boleto", parcela: true, hint: "1º vence em 3 dias" },
  { valor: "fiado", label: "Fiado (a prazo)", parcela: true, hint: "1º vence em 30 dias — régua cobra sozinha" },
];

const INPUT: React.CSSProperties = {
  padding: 8,
  borderRadius: 8,
  border: "1px solid var(--border)",
  fontSize: 13,
  background: "#FFF",
};

const CARD: React.CSSProperties = {
  background: "var(--bg-cloud)",
  border: "1.5px solid var(--border)",
  borderRadius: 14,
  padding: 16,
};

const LEGENDA: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase" as const,
  letterSpacing: 0.6,
  color: "var(--ink-soft)",
  marginBottom: 10,
};

const BTN_PRIMARIO = {
  border: "none",
  borderRadius: 999,
  padding: "10px 22px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  background: "var(--pink-600)",
  color: "#FFF",
};

const COLUNAS = "repeat(auto-fit, minmax(200px, 1fr))";

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function somenteDigitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** mascara simples: CPF 000.000.000-00 / CNPJ 00.000.000/0000-00 */
function mascaraDocumento(doc: string, juridica: boolean): string {
  const d = somenteDigitos(doc).slice(0, juridica ? 14 : 11);
  if (!juridica) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function mascaraTelefone(tel: string): string {
  const d = somenteDigitos(tel).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

function mascaraCep(cep: string): string {
  const d = somenteDigitos(cep).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

export function ConsoleVendaManual({
  itens,
  clientes,
}: {
  itens: ItemLista[];
  clientes: ClienteLista[];
}) {
  const router = useRouter();

  // cliente: busca de existente OU cadastro novo PF/PJ
  const [modoNovo, setModoNovo] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [tipoDoc, setTipoDoc] = useState<"fisica" | "juridica">("fisica");
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [cepBuscando, setCepBuscando] = useState(false);

  // itens
  const [buscaItem, setBuscaItem] = useState("");
  const [canal, setCanal] = useState<"varejo" | "atacado">("varejo");
  const [carrinho, setCarrinho] = useState<LinhaCarrinho[]>([]);

  // pagamento
  const [metodo, setMetodo] = useState("pix");
  const [parcelas, setParcelas] = useState(1);
  const [desconto, setDesconto] = useState("");

  // entrega: null = retira
  const [modoEntrega, setModoEntrega] = useState<"retira" | "entrega">("retira");
  const [eCep, setECep] = useState("");
  const [eLogradouro, setELogradouro] = useState("");
  const [eNumero, setENumero] = useState("");
  const [eComplemento, setEComplemento] = useState("");
  const [eBairro, setEBairro] = useState("");
  const [eCidade, setECidade] = useState("");
  const [eUf, setEUf] = useState("");
  const [eTransportadora, setETransportadora] = useState("");
  const [ePrazo, setEPrazo] = useState("");
  const [eObservacao, setEObservacao] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const refBuscaItem = useRef<HTMLInputElement>(null);
  const refBuscaCliente = useRef<HTMLInputElement>(null);
  const refNome = useRef<HTMLInputElement>(null);

  const clientesFiltrados = useMemo(() => {
    const t = buscaCliente.trim().toLowerCase();
    const base = clientes.slice(0, 8);
    if (!t) return base;
    return clientes
      .filter((c) =>
        [c.nome, c.documento ?? "", c.telefone ?? ""].some((v) =>
          String(v).toLowerCase().includes(t)
        )
      )
      .slice(0, 8);
  }, [buscaCliente, clientes]);

  const itensFiltrados = useMemo(() => {
    const t = buscaItem.trim().toLowerCase();
    const base = itens.slice(0, 10);
    if (!t) return base;
    return itens
      .filter((i) => i.sku.toLowerCase().includes(t) || i.name.toLowerCase().includes(t))
      .slice(0, 10);
  }, [buscaItem, itens]);

  const precoDe = (i: ItemLista) =>
    canal === "atacado" ? (i.precoAtacado ?? i.precoVarejo) : i.precoVarejo;

  const subtotal = carrinho.reduce((a, l) => {
    const it = itens.find((i) => i.id === l.item_id);
    return a + (it ? precoDe(it) * l.qty : 0);
  }, 0);
  const descValor = Math.max(0, Number(somenteDigitos(desconto) ? desconto.replace(",", ".") : "0") || 0);
  const total = Math.max(0, subtotal - descValor);
  const aceitaParcela = METODOS.find((m) => m.valor === metodo)?.parcela ?? false;
  const totalUnidades = carrinho.reduce((a, l) => a + l.qty, 0);

  // verificador de CPF/CNPJ: avisa na hora e trava o envio
  const docDigitos = somenteDigitos(documento);
  const docDvOk =
    docDigitos.length === 0 || documentoValido(tipoDoc, documento);

  function addItem(i: ItemLista) {
    setCarrinho((c) => {
      const achada = c.find((l) => l.item_id === i.id);
      if (achada) {
        return c.map((l) => (l.item_id === i.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...c, { item_id: i.id, sku: i.sku, name: i.name, qty: 1 }];
    });
  }

  function mudarQtd(item_id: string, delta: number) {
    setCarrinho((c) =>
      c
        .map((l) => (l.item_id === item_id ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0)
    );
  }

  function preencherEntregaDoCliente() {
    const c = clientes.find((x) => x.id === clienteId);
    if (!c) return;
    // so cidade/uf do cadastro; rua/numero o operador digita na hora
    setECidade(c.cidade ?? "");
    setEUf(c.uf ?? "");
    setAviso(null);
  }

  // CEP automatico (ViaCEP) do cadastro de cliente — ao sair do campo.
  async function buscarCepCliente() {
    const d = somenteDigitos(cep);
    if (d.length !== 8) return;
    setCepBuscando(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (!j.erro) {
        setLogradouro(j.logradouro || "");
        setBairro(j.bairro || "");
        setCidade(j.cidade || "");
        setUf((j.uf || "").toUpperCase());
      }
    } catch {
      // offline ou CEP ruim: operador digita na mao — nao trava nada.
    } finally {
      setCepBuscando(false);
    }
  }

  async function enviar() {
    setEnviando(true);
    setAviso(null);
    try {
      const resultado = await registrarVendaManual({
        canal,
        metodo,
        parcelas: aceitaParcela ? parcelas : 1,
        desconto: descValor,
        itens: carrinho.map((l) => ({ item_id: l.item_id, quantity: l.qty })),
        clienteExistenteId: modoNovo ? null : clienteId,
        clienteNovo: modoNovo
          ? { tipo: tipoDoc, nome, documento, telefone, whatsapp, cep, logradouro, numero, complemento, bairro, cidade, uf }
          : null,
        entrega:
          modoEntrega === "entrega"
            ? {
                cep: eCep,
                logradouro: eLogradouro,
                numero: eNumero,
                complemento: eComplemento,
                bairro: eBairro,
                cidade: eCidade,
                uf: eUf,
                transportadora: eTransportadora,
                prazo: ePrazo,
                observacao: eObservacao,
              }
            : null,
      });
      if (!resultado.ok) {
        setAviso({ tipo: "erro", texto: resultado.erro });
        return;
      }
      setAviso({ tipo: "ok", texto: resultado.msg });
      setTimeout(() => router.push("/vendas"), 1200);
    } finally {
      setEnviando(false);
    }
  }

  const prontoParaEnviar =
    carrinho.length > 0 &&
    !enviando &&
    (modoNovo
      ? nome.trim() && docDvOk && somenteDigitos(telefone).length >= 10
      : !!clienteId) &&
    (modoEntrega === "retira" || eLogradouro.trim());

  // atalhos de teclado do balcao (mesmo espirito das teclas de funcao)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F4") {
        e.preventDefault();
        refBuscaItem.current?.focus();
      } else if (e.key === "F2") {
        e.preventDefault();
        setModoNovo(false);
        refBuscaCliente.current?.focus();
      } else if (e.key === "F8") {
        e.preventDefault();
        setCarrinho((c) => (c.length ? c.slice(0, -1) : c));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (prontoParaEnviar) void enviar();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prontoParaEnviar, carrinho, metodo, parcelas, desconto, canal, modoNovo, nome, documento, telefone, whatsapp, cep, logradouro, numero, complemento, bairro, cidade, uf, modoEntrega, eCep, eLogradouro, eNumero, eComplemento, eBairro, eCidade, eUf, eTransportadora, ePrazo, eObservacao]);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 24px 40px" }}>
      {/* console em 2 colunas no balcao; abaixo de 1000px colapsa em pilha
          unica (mesma ordem logica) — sem rolagem horizontal no celular. */}
      <style>{`
        .vman-grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
        .vman-lado { position: sticky; top: 16px; display: grid; gap: 16px; }
        @media (max-width: 1000px) {
          .vman-grid { grid-template-columns: minmax(0, 1fr); }
          .vman-lado { position: static; }
        }
      `}</style>
      <PageHeader
        titulo="Nova venda"
        subtitulo="Telefone ou balcão — sem caixa aberto. Entrega ou retirada, todas as formas de pagamento."
        voltarPara="/vendas"
      />

      {aviso && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: aviso.tipo === "ok" ? "#DCFCE7" : "#FEE2E2",
            color: aviso.tipo === "ok" ? "#166534" : "#991B1B",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13.5,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {aviso.texto}
        </div>
      )}

      {/* ================================================= esquerda ======== */}
      <div className="vman-grid">
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {/* ------------------------------------------------ 1. itens ---- */}
          <section style={CARD}>
            <div style={{ ...LEGENDA, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Itens da venda</span>
              <span style={{ display: "flex", gap: 6 }}>
                {(["varejo", "atacado"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Canal ${c}`}
                    onClick={() => setCanal(c)}
                    style={{
                      ...BTN_PRIMARIO,
                      padding: "4px 12px",
                      fontSize: 12,
                      background: canal === c ? "var(--navy)" : "#FFF",
                      color: canal === c ? "#FFF" : "var(--ink-soft)",
                      border: canal === c ? "none" : "1.5px solid var(--border)",
                    }}
                  >
                    {c === "varejo" ? "Varejo" : "Atacado"}
                  </button>
                ))}
              </span>
            </div>

            <input
              ref={refBuscaItem}
              aria-label="Buscar produto"
              placeholder="SKU ou nome do produto…  (F4 volta o foco pra cá)"
              value={buscaItem}
              onChange={(e) => setBuscaItem(e.target.value)}
              style={{ ...INPUT, width: "100%", marginBottom: 10 }}
            />

            <div style={{ display: "grid", gap: 6, marginBottom: carrinho.length ? 14 : 0 }}>
              {itensFiltrados.map((i) => (
                <div
                  key={i.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 10,
                    background: "#FFF",
                    border: "1.5px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: 13, minWidth: 0 }}>
                    <strong>{i.name}</strong>
                    <span style={{ color: "var(--ink-soft)", marginLeft: 8 }}>{i.sku}</span>
                    {i.estoque !== null && i.estoque <= 0 && (
                      <span style={{ color: "#991B1B", marginLeft: 8, fontWeight: 700 }}>sem estoque</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
                    <strong style={{ fontSize: 13 }}>{brl(precoDe(i))}</strong>
                    <button
                      type="button"
                      aria-label={`Adicionar ${i.name}`}
                      disabled={(i.estoque ?? 1) <= 0}
                      onClick={() => addItem(i)}
                      style={{
                        ...BTN_PRIMARIO,
                        padding: "4px 12px",
                        opacity: (i.estoque ?? 1) <= 0 ? 0.5 : 1,
                      }}
                    >
                      + Item
                    </button>
                  </div>
                </div>
              ))}
              {itensFiltrados.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                  Nenhum produto encontrado para “{buscaItem}”.
                </div>
              )}
            </div>

            {/* grade de itens — o herói da tela */}
            <div
              style={{
                border: "1.5px solid var(--border)",
                borderRadius: 12,
                background: "#FFF",
                overflow: "hidden",
              }}
              aria-label="Carrinho"
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 10,
                  padding: "8px 12px",
                  background: "var(--bg-cloud)",
                  borderBottom: "1.5px solid var(--border)",
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "var(--ink-soft)",
                }}
              >
                <span>Produto</span>
                <span style={{ textAlign: "center" }}>Qtd</span>
                <span style={{ textAlign: "right" }}>Total</span>
              </div>
              {carrinho.length === 0 ? (
                <div style={{ padding: "18px 12px", fontSize: 13, color: "var(--ink-soft)" }}>
                  Grade vazia — busque um produto acima e clique em “+ Item”.
                </div>
              ) : (
                carrinho.map((l, idx) => {
                  const it = itens.find((i) => i.id === l.item_id);
                  return (
                    <div
                      key={l.item_id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto",
                        gap: 10,
                        alignItems: "center",
                        padding: "7px 12px",
                        fontSize: 13,
                        background: idx % 2 ? "var(--bg-cloud)" : "#FFF",
                        borderBottom: idx === carrinho.length - 1 ? "none" : "1px solid var(--border)",
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <strong>{l.name}</strong>
                        <span style={{ color: "var(--ink-soft)", marginLeft: 8 }}>{l.sku}</span>
                        {it && (
                          <span style={{ color: "var(--ink-soft)", marginLeft: 8 }}>
                            {brl(precoDe(it))} un.
                          </span>
                        )}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, justifySelf: "center" }}>
                        <button
                          type="button"
                          aria-label={`Diminuir ${l.name}`}
                          onClick={() => mudarQtd(l.item_id, -1)}
                          style={{ ...BTN_PRIMARIO, background: "var(--navy)", padding: "2px 10px" }}
                        >
                          −
                        </button>
                        <strong aria-label={`Quantidade ${l.name}`}>{l.qty}</strong>
                        <button
                          type="button"
                          aria-label={`Aumentar ${l.name}`}
                          onClick={() => mudarQtd(l.item_id, 1)}
                          style={{ ...BTN_PRIMARIO, background: "var(--navy)", padding: "2px 10px" }}
                        >
                          +
                        </button>
                      </span>
                      <span style={{ justifySelf: "end", fontWeight: 800 }}>
                        {brl((it ? precoDe(it) : 0) * l.qty)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* ------------------------------------------------ 2. cliente -- */}
          <section style={CARD}>
            <div style={LEGENDA}>Cliente</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                aria-label="Cliente já cadastrado"
                onClick={() => setModoNovo(false)}
                style={{
                  ...BTN_PRIMARIO,
                  background: modoNovo ? "#FFF" : "var(--pink-600)",
                  color: modoNovo ? "var(--ink-soft)" : "#FFF",
                  border: modoNovo ? "1.5px solid var(--border)" : "none",
                }}
              >
                Já é cliente
              </button>
              <button
                type="button"
                aria-label="Novo cliente na hora"
                onClick={() => {
                  setModoNovo(true);
                  setTimeout(() => refNome.current?.focus(), 0);
                }}
                style={{
                  ...BTN_PRIMARIO,
                  background: modoNovo ? "var(--pink-600)" : "#FFF",
                  color: modoNovo ? "#FFF" : "var(--ink-soft)",
                  border: modoNovo ? "none" : "1.5px solid var(--border)",
                }}
              >
                Novo cadastro (na hora)
              </button>
            </div>

            {!modoNovo ? (
              <div>
                <input
                  ref={refBuscaCliente}
                  aria-label="Buscar cliente"
                  placeholder="Nome, CPF/CNPJ ou telefone…  (F2 volta o foco pra cá)"
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                  style={{ ...INPUT, width: "100%", marginBottom: 10 }}
                />
                <div style={{ display: "grid", gap: 6 }}>
                  {clientesFiltrados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={`Selecionar cliente ${c.nome}`}
                      onClick={() => setClienteId(c.id)}
                      style={{
                        textAlign: "left",
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: `1.5px solid ${clienteId === c.id ? "var(--pink-600)" : "var(--border)"}`,
                        background: clienteId === c.id ? "#FCE7F3" : "#FFF",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      <strong>{c.nome}</strong>
                      {c.documento && (
                        <span style={{ color: "var(--ink-soft)", marginLeft: 8 }}>
                          {c.documento.length === 14 ? "CNPJ " : "CPF "}
                          {c.documento}
                        </span>
                      )}
                      {c.telefone && <span style={{ color: "var(--ink-soft)", marginLeft: 8 }}>☎ {c.telefone}</span>}
                    </button>
                  ))}
                  {clientesFiltrados.length === 0 && (
                    <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                      Nenhum cliente encontrado — use “Novo cadastro (na hora)”.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    aria-label="Pessoa física"
                    onClick={() => setTipoDoc("fisica")}
                    style={{
                      ...BTN_PRIMARIO,
                      background: tipoDoc === "fisica" ? "var(--pink-600)" : "#FFF",
                      color: tipoDoc === "fisica" ? "#FFF" : "var(--ink-soft)",
                      border: tipoDoc === "fisica" ? "none" : "1.5px solid var(--border)",
                    }}
                  >
                    Pessoa física
                  </button>
                  <button
                    type="button"
                    aria-label="Pessoa jurídica"
                    onClick={() => setTipoDoc("juridica")}
                    style={{
                      ...BTN_PRIMARIO,
                      background: tipoDoc === "juridica" ? "var(--pink-600)" : "#FFF",
                      color: tipoDoc === "juridica" ? "#FFF" : "var(--ink-soft)",
                      border: tipoDoc === "juridica" ? "none" : "1.5px solid var(--border)",
                    }}
                  >
                    Pessoa jurídica
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: COLUNAS, gap: 10 }}>
                  <input
                    ref={refNome}
                    aria-label={tipoDoc === "fisica" ? "Nome completo" : "Razão social"}
                    placeholder={tipoDoc === "fisica" ? "Nome completo*" : "Razão social*"}
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    style={INPUT}
                  />
                  <input
                    aria-label={tipoDoc === "fisica" ? "CPF" : "CNPJ"}
                    placeholder={tipoDoc === "fisica" ? "CPF*" : "CNPJ*"}
                    value={documento}
                    onChange={(e) => setDocumento(mascaraDocumento(e.target.value, tipoDoc === "juridica"))}
                    style={{
                      ...INPUT,
                      borderColor: docDigitos.length > 0 && !docDvOk ? "#DC2626" : "var(--border)",
                    }}
                  />
                  <input
                    aria-label="Telefone"
                    placeholder="Telefone* (com DDD)"
                    value={telefone}
                    onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                    style={INPUT}
                  />
                  <input
                    aria-label="WhatsApp"
                    placeholder="WhatsApp (opcional)"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(mascaraTelefone(e.target.value))}
                    style={INPUT}
                  />
                  <input
                    aria-label="CEP do cliente"
                    placeholder="CEP (opcional — busca o endereço)"
                    value={cep}
                    onChange={(e) => setCep(mascaraCep(e.target.value))}
                    onBlur={buscarCepCliente}
                    style={INPUT}
                  />
                  <input
                    aria-label="Logradouro do cliente"
                    placeholder="Rua, avenida… (preenchido pelo CEP)"
                    value={logradouro}
                    onChange={(e) => setLogradouro(e.target.value)}
                    style={INPUT}
                  />
                  <input
                    aria-label="Número do cliente"
                    placeholder="Número (opcional)"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    style={INPUT}
                  />
                  <input
                    aria-label="Complemento do cliente"
                    placeholder="Complemento (opcional)"
                    value={complemento}
                    onChange={(e) => setComplemento(e.target.value)}
                    style={INPUT}
                  />
                  <input
                    aria-label="Bairro do cliente"
                    placeholder="Bairro (preenchido pelo CEP)"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    style={INPUT}
                  />
                  <input
                    aria-label="Cidade do cliente"
                    placeholder="Cidade (preenchido pelo CEP)"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    style={INPUT}
                  />
                  <input
                    aria-label="UF do cliente"
                    placeholder="UF (preenchido pelo CEP)"
                    maxLength={2}
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                    style={INPUT}
                  />
                </div>
                {docDigitos.length > 0 && !docDvOk && (
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#DC2626" }}>
                    {tipoDoc === "fisica" ? "CPF" : "CNPJ"} com dígito verificador inválido — confira os números.
                  </div>
                )}
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {cepBuscando
                    ? "Buscando endereço pelo CEP…"
                    : "Dígito verificador conferido na hora. Mesmo CPF/CNPJ já cadastrado reutiliza o cadastro existente (não duplica cliente)."}
                </div>
              </div>
            )}
          </section>

          {/* -------------------------------------------- 3. entrega ------ */}
          <section style={CARD}>
            <div style={LEGENDA}>Entrega ou retirada</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                aria-label="Cliente retira no balcão"
                onClick={() => setModoEntrega("retira")}
                style={{
                  ...BTN_PRIMARIO,
                  background: modoEntrega === "retira" ? "var(--pink-600)" : "#FFF",
                  color: modoEntrega === "retira" ? "#FFF" : "var(--ink-soft)",
                  border: modoEntrega === "retira" ? "none" : "1.5px solid var(--border)",
                }}
              >
                Retira no balcão
              </button>
              <button
                type="button"
                aria-label="Entregar no endereço"
                onClick={() => setModoEntrega("entrega")}
                style={{
                  ...BTN_PRIMARIO,
                  background: modoEntrega === "entrega" ? "var(--pink-600)" : "#FFF",
                  color: modoEntrega === "entrega" ? "#FFF" : "var(--ink-soft)",
                  border: modoEntrega === "entrega" ? "none" : "1.5px solid var(--border)",
                }}
              >
                Entregar
              </button>
              {modoEntrega === "entrega" && !modoNovo && clienteId && (
                <button
                  type="button"
                  aria-label="Preencher cidade e UF do cadastro"
                  onClick={preencherEntregaDoCliente}
                  style={{
                    ...BTN_PRIMARIO,
                    background: "#FFF",
                    color: "var(--ink-soft)",
                    border: "1.5px solid var(--border)",
                  }}
                >
                  Usar cidade/UF do cadastro
                </button>
              )}
            </div>
            {modoEntrega === "entrega" && (
              <div style={{ display: "grid", gridTemplateColumns: COLUNAS, gap: 10 }}>
                <input
                  aria-label="CEP da entrega"
                  placeholder="CEP"
                  value={eCep}
                  onChange={(e) => setECep(mascaraCep(e.target.value))}
                  style={INPUT}
                />
                <input
                  aria-label="Logradouro da entrega"
                  placeholder="Rua, avenida*"
                  value={eLogradouro}
                  onChange={(e) => setELogradouro(e.target.value)}
                  style={{ gridColumn: "1 / -2", ...INPUT }}
                />
                <input
                  aria-label="Número da entrega"
                  placeholder="Número*"
                  value={eNumero}
                  onChange={(e) => setENumero(e.target.value)}
                  style={INPUT}
                />
                <input
                  aria-label="Complemento da entrega"
                  placeholder="Complemento"
                  value={eComplemento}
                  onChange={(e) => setEComplemento(e.target.value)}
                  style={INPUT}
                />
                <input
                  aria-label="Bairro da entrega"
                  placeholder="Bairro"
                  value={eBairro}
                  onChange={(e) => setEBairro(e.target.value)}
                  style={INPUT}
                />
                <input
                  aria-label="Cidade da entrega"
                  placeholder="Cidade"
                  value={eCidade}
                  onChange={(e) => setECidade(e.target.value)}
                  style={INPUT}
                />
                <input
                  aria-label="UF da entrega"
                  placeholder="UF"
                  maxLength={2}
                  value={eUf}
                  onChange={(e) => setEUf(e.target.value.toUpperCase())}
                  style={INPUT}
                />
                <input
                  aria-label="Transportadora"
                  placeholder="Transportadora (opcional)"
                  value={eTransportadora}
                  onChange={(e) => setETransportadora(e.target.value)}
                  style={INPUT}
                />
                <input
                  aria-label="Prazo da entrega"
                  type="date"
                  value={ePrazo}
                  onChange={(e) => setEPrazo(e.target.value)}
                  style={INPUT}
                />
                <input
                  aria-label="Observação da entrega"
                  placeholder="Observação (portal, ponto de referência…)"
                  value={eObservacao}
                  onChange={(e) => setEObservacao(e.target.value)}
                  style={{ gridColumn: "1 / -1", ...INPUT }}
                />
              </div>
            )}
          </section>
        </div>

        {/* --------------------------------------------- direita (fixa) -- */}
        <div className="vman-lado">
          {/* pagamento */}
          <section style={CARD}>
            <div style={LEGENDA}>Pagamento</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 12 }}>
              {METODOS.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  aria-label={`Pagamento ${m.label}`}
                  onClick={() => {
                    setMetodo(m.valor);
                    if (!m.parcela) setParcelas(1);
                  }}
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: `1.5px solid ${metodo === m.valor ? "var(--pink-600)" : "var(--border)"}`,
                    background: metodo === m.valor ? "#FCE7F3" : "#FFF",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: metodo === m.valor ? 800 : 600,
                  }}
                >
                  {m.label}
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-soft)" }}>{m.hint}</div>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              {aceitaParcela && (
                <label style={{ fontSize: 13 }}>
                  Parcelas{" "}
                  <select
                    aria-label="Parcelas"
                    value={parcelas}
                    onChange={(e) => setParcelas(Number(e.target.value))}
                    style={INPUT}
                  >
                    {Array.from({ length: 12 }, (_, k) => k + 1).map((p) => (
                      <option key={p} value={p}>
                        {p}x
                      </option>
                    ))}
                  </select>
                  {parcelas > 1 && total > 0 && (
                    <span style={{ color: "var(--ink-soft)", marginLeft: 8 }}>
                      de {brl(total / parcelas)}
                    </span>
                  )}
                </label>
              )}
              <label style={{ fontSize: 13 }}>
                Desconto R${" "}
                <input
                  aria-label="Desconto em reais"
                  placeholder="0,00"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  style={{ ...INPUT, width: 110 }}
                />
              </label>
            </div>
          </section>

          {/* resumo + total + ação (fica sempre à vista) */}
          <section
            style={{ ...CARD, border: "2px solid var(--navy)" }}
            aria-label="Resumo da venda"
          >
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 6 }}>
              {carrinho.length} {carrinho.length === 1 ? "item" : "itens"} · {totalUnidades}{" "}
              {totalUnidades === 1 ? "unidade" : "unidades"} · {canal === "varejo" ? "varejo" : "atacado"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>Subtotal</span>
              <strong>{brl(subtotal)}</strong>
            </div>
            {descValor > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#166534" }}>
                <span>Desconto</span>
                <strong>−{brl(descValor)}</strong>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginTop: 8,
                paddingTop: 8,
                borderTop: "1.5px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Total
              </span>
              <span style={{ fontSize: 30, fontWeight: 900, color: "var(--navy)" }}>{brl(total)}</span>
            </div>
            <button
              type="button"
              aria-label="Registrar venda"
              disabled={!prontoParaEnviar}
              onClick={enviar}
              style={{
                ...BTN_PRIMARIO,
                width: "100%",
                marginTop: 12,
                fontSize: 15,
                padding: "13px 22px",
                opacity: prontoParaEnviar ? 1 : 0.5,
              }}
            >
              {enviando ? "Registrando…" : "Registrar venda"}
            </button>
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 8, textAlign: "center" }}>
              Ctrl+Enter grava · F4 busca produto · F2 busca cliente · F8 remove o último item
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
