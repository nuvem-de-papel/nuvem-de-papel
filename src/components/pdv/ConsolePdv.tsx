"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  abrirCaixa,
  fecharCaixa,
  movimentoCaixa,
  registrarVendaPdv,
  emitirNfcePdv,
} from "@/app/pdv/actions";

export type SessaoCaixa = { id: string; abertura: number; aberta_em: string; operador?: string };

export type ItemPdv = {
  id: string;
  sku: string;
  name: string;
  precoVarejo: number;
  precoAtacado: number | null;
  /** null = item sem controle de estoque (ilimitado). */
  estoque: number | null;
};

export type MovimentoCaixa = {
  id: string;
  tipo: string;
  direcao: "in" | "out";
  valor: number;
  motivo: string | null;
  criado_em: string;
};

/** CX-06/CX-10: resumo do caixa aberto (dinheiro da gaveta e totais). */
export type ResumoCaixa = {
  abertura: number;
  vendasQtd: number;
  vendasTotal: number;
  suprimentos: number;
  sangrias: number;
  gaveta: number;
  porPagamento: { metodo: string; total: number }[];
};

/** CX-09: resumo do último turno fechado (exibido no estado fechado). */
export type UltimoTurno = {
  fechada_em: string;
  esperado: number;
  contado: number;
  diferenca: number;
  vendasQtd: number;
  vendasTotal: number;
};

type LinhaCarrinho = { item_id: string; sku: string; name: string; qty: number };

type VendaFeita = {
  pedido: string;
  numero: string | null;
  total: number;
  metodo: string;
  parcelas: number;
  titulo: string | null;
  itens: { name: string; qty: number; preco: number }[];
};

const METODOS: { valor: string; label: string }[] = [
  { valor: "dinheiro", label: "Dinheiro" },
  { valor: "pix", label: "Pix" },
  { valor: "debito", label: "Débito" },
  { valor: "cartao", label: "Crédito" },
];

const ROTULO_METODO: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Débito",
  cartao: "Cartão",
};

const BTN = {
  border: "none",
  borderRadius: 999,
  padding: "7px 14px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** PDV-04: "3*7891002" ou "3x caneta" → 3 unidades do termo que sobrar. */
function parseMultiplicador(termo: string): { qtd: number; termo: string } {
  const m = /^\s*(\d{1,3})\s*[*xX]\s*(.*)$/.exec(termo);
  if (!m) return { qtd: 1, termo };
  const qtd = Math.min(999, Math.max(1, parseInt(m[1], 10) || 1));
  return { qtd, termo: m[2] };
}

const INPUT: React.CSSProperties = {
  padding: 8,
  borderRadius: 8,
  border: "1px solid var(--border)",
  fontSize: 13,
};

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--navy)" };

const CARD: React.CSSProperties = {
  background: "var(--bg-cloud)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 18,
  marginBottom: 20,
};

const TITULO: React.CSSProperties = {
  fontSize: 16,
  margin: "0 0 12px",
  color: "var(--navy)",
  fontWeight: 800,
};

function Aviso({ aviso }: { aviso: { tipo: "ok" | "erro"; texto: string } | null }) {
  if (!aviso) return null;
  return (
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
  );
}

export function ConsolePdv({
  sessao,
  itens,
  movimentos,
  papel,
  resumo,
  ultimo,
}: {
  sessao: SessaoCaixa | null;
  itens: ItemPdv[];
  movimentos: MovimentoCaixa[];
  papel: string;
  resumo: ResumoCaixa | null;
  ultimo: UltimoTurno | null;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [abertura, setAbertura] = useState(100);
  const [contagem, setContagem] = useState("");
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<LinhaCarrinho[]>([]);
  const [canal, setCanal] = useState("varejo");
  const [metodo, setMetodo] = useState("dinheiro"); // desvio da FV-02 (default PIX) documentado
  const [parcelas, setParcelas] = useState(1);
  const [desconto, setDesconto] = useState("");
  const [venda, setVenda] = useState<VendaFeita | null>(null);
  const [scTipo, setScTipo] = useState("suprimento");
  const [scValor, setScValor] = useState("");
  const [scMotivo, setScMotivo] = useState("");
  const [destaque, setDestaque] = useState(0);
  const [ultimoItem, setUltimoItem] = useState<string | null>(null);
  const [drawerAberto, setDrawerAberto] = useState(false);

  const buscaRef = useRef<HTMLInputElement>(null);
  const aberturaRef = useRef<HTMLInputElement>(null);
  const caixaRef = useRef<HTMLElement>(null);

  function rodar(acao: () => Promise<{ ok: boolean; erro?: string; msg?: string }>, aoOk?: () => void) {
    startTransition(async () => {
      const r = await acao();
      setAviso(r.ok ? { tipo: "ok", texto: r.msg ?? "OK" } : { tipo: "erro", texto: r.erro ?? "Falha" });
      if (r.ok) {
        aoOk?.();
        router.refresh();
      }
    });
  }

  function precoDe(item: ItemPdv): number {
    return canal === "atacado" ? (item.precoAtacado ?? item.precoVarejo) : item.precoVarejo;
  }

  // PDV-01/PDV-02: nada antes de 2 caracteres; casa nome ou código, com o
  // código exato em primeiro, no máximo 8 resultados.
  const mult = useMemo(() => parseMultiplicador(busca), [busca]);
  const termo = mult.termo.trim().toLowerCase();

  const filtrados = useMemo(() => {
    if (termo.length < 2) return [];
    const achados = itens.filter(
      (i) => i.name.toLowerCase().includes(termo) || i.sku.toLowerCase().includes(termo)
    );
    achados.sort(
      (a, b) => Number(b.sku.toLowerCase() === termo) - Number(a.sku.toLowerCase() === termo)
    );
    return achados.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, itens]);

  const subtotal = useMemo(() => {
    return carrinho.reduce((acc, l) => {
      const item = itens.find((i) => i.id === l.item_id);
      return acc + (item ? precoDe(item) * l.qty : 0);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrinho, itens, canal]);

  const descNum = Math.max(0, Math.round((Number(desconto) || 0) * 100) / 100);
  const totalFinal = Math.max(0, Math.round((subtotal - descNum) * 100) / 100);
  const tetoDesconto =
    papel === "operador" || papel === "vendedor"
      ? Math.floor(Math.round(subtotal * 100) / 10) / 100
      : null;
  const qtdCarrinho = carrinho.reduce((a, l) => a + l.qty, 0);

  function addItem(item: ItemPdv, qtd = 1) {
    setVenda(null);
    setCarrinho((prev) => {
      const existe = prev.find((l) => l.item_id === item.id);
      if (existe) {
        return prev.map((l) => (l.item_id === item.id ? { ...l, qty: l.qty + qtd } : l));
      }
      return [...prev, { item_id: item.id, sku: item.sku, name: item.name, qty: qtd }];
    });
    setUltimoItem(item.id); // PDV-07
    setBusca(""); // PDV-06
    setDestaque(0);
    buscaRef.current?.focus();
  }

  function mudarQtd(itemId: string, delta: number) {
    // PDV-08: mínimo 1 — para tirar o item, use a lixeira (Excluir).
    setCarrinho((prev) =>
      prev.map((l) => (l.item_id === itemId ? { ...l, qty: Math.max(1, l.qty + delta) } : l))
    );
    setUltimoItem(itemId);
  }

  function limparComanda() {
    setCarrinho([]);
    setDesconto("");
    setUltimoItem(null);
    setVenda(null);
    buscaRef.current?.focus();
  }

  function registrarVenda() {
    if (!sessao || carrinho.length === 0) return;
    if (tetoDesconto !== null && descNum > tetoDesconto) {
      setAviso({
        tipo: "erro",
        texto: `Desconto de ${brl(descNum)} acima do limite de 10% do seu perfil (máximo ${brl(
          tetoDesconto
        )}).`,
      });
      return;
    }
    const snapshot = carrinho.map((l) => {
      const item = itens.find((i) => i.id === l.item_id)!;
      return { name: l.name, qty: l.qty, preco: precoDe(item) };
    });
    startTransition(async () => {
      const r = await registrarVendaPdv(
        carrinho.map((l) => ({ item_id: l.item_id, quantity: l.qty })),
        metodo,
        metodo === "cartao" ? parcelas : 1,
        canal,
        descNum
      );
      setAviso(r.ok ? { tipo: "ok", texto: r.msg } : { tipo: "erro", texto: r.erro });
      if (r.ok && r.venda) {
        setVenda({
          pedido: r.venda.pedido,
          numero: r.venda.numero,
          total: r.venda.total,
          metodo,
          parcelas: metodo === "cartao" ? parcelas : 1,
          titulo: r.venda.titulo,
          itens: snapshot,
        });
        setCarrinho([]);
        setDesconto("");
        setParcelas(1);
        setUltimoItem(null);
        buscaRef.current?.focus(); // FV-04: foco volta à busca
        router.refresh();
      }
    });
  }

  function enterNaBusca() {
    if (!sessao) return;
    const { qtd, termo: t } = mult;
    const exato = t
      ? itens.find((i) => i.sku.toLowerCase() === t.trim().toLowerCase())
      : undefined;
    if (exato) {
      addItem(exato, qtd); // PDV-03: código exato entra direto (leitor)
      return;
    }
    const alvo = filtrados[destaque] ?? filtrados[0];
    if (alvo) addItem(alvo, qtd);
  }

  // atalhos 5.4: F2 busca · F8 caixa · F12 finaliza · Esc limpa/fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const naBusca = alvo === buscaRef.current;
      if (e.key === "F2") {
        e.preventDefault();
        buscaRef.current?.focus();
      } else if (e.key === "F8") {
        e.preventDefault();
        if (caixaRef.current) {
          caixaRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
          const primeiro = caixaRef.current.querySelector<HTMLElement>("input, select, button");
          primeiro?.focus();
        } else {
          aberturaRef.current?.focus();
        }
      } else if (e.key === "F12") {
        e.preventDefault();
        registrarVenda();
      } else if (e.key === "Escape") {
        if (naBusca && busca) setBusca("");
        else setDrawerAberto(false);
      } else if (naBusca) {
        if (e.key === "Enter") {
          e.preventDefault();
          enterNaBusca();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setDestaque((d) => Math.min(d + 1, Math.max(filtrados.length - 1, 0)));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setDestaque((d) => Math.max(d - 1, 0));
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, filtrados, carrinho, sessao, metodo, parcelas, canal, desconto, mult]);

  // resultado ao vivo do fechamento (CX-07)
  const esperado = resumo ? resumo.gaveta : sessao?.abertura ?? 0;
  const contadoNum = contagem === "" ? null : Number(contagem);
  let fechamentoVivo: { cor: string; texto: string } | null = null;
  if (contadoNum !== null && Number.isFinite(contadoNum)) {
    const dif = Math.round((contadoNum - esperado) * 100) / 100;
    fechamentoVivo =
      Math.abs(dif) < 0.005
        ? { cor: "#1E7F4F", texto: "Caixa confere." }
        : dif > 0
        ? { cor: "#B54708", texto: `Sobra de ${brl(dif)}` }
        : { cor: "#B42318", texto: `Falta de ${brl(Math.abs(dif))}` };
  }

  // ------------------------------------------------------------- sem caixa --
  if (!sessao) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "26px 24px 60px" }} className="pdv-shell">
        <PageHeader
          titulo="PDV"
          subtitulo="Frente de caixa. Abra o caixa para começar a vender."
          voltarPara="/crm"
        />

        <Aviso aviso={aviso} />

        <div className="pdv-grid" style={{ gridTemplateColumns: "1fr" }}>
          <section style={CARD} aria-label="Painel Caixa">
            <h2 style={TITULO}>Abrir caixa</h2>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={LABEL}>
                Fundo de troco (R$)
                <input
                  ref={aberturaRef}
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Valor de abertura"
                  value={abertura}
                  autoFocus
                  onChange={(e) => setAbertura(Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rodar(() => abrirCaixa(abertura));
                  }}
                  style={{ ...INPUT, display: "block", marginTop: 4, width: 160 }}
                />
              </label>
              <button
                disabled={pendente}
                onClick={() => rodar(() => abrirCaixa(abertura))}
                style={{ ...BTN, background: "var(--pink-600)", color: "#FFF", padding: "9px 18px" }}
              >
                Abrir caixa
              </button>
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                Enter no campo também confirma (CX-02).
              </span>
            </div>
          </section>

          {ultimo && (
            <section style={CARD} aria-label="Último turno">
              <h2 style={TITULO}>Último turno (resumo)</h2>
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13 }}>
                <div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 11.5, fontWeight: 700 }}>
                    FECHADO EM
                  </div>
                  <div style={{ fontWeight: 800 }}>{dataCurta(ultimo.fechada_em)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 11.5, fontWeight: 700 }}>
                    VENDAS
                  </div>
                  <div style={{ fontWeight: 800 }}>
                    {ultimo.vendasQtd} · {brl(ultimo.vendasTotal)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 11.5, fontWeight: 700 }}>
                    ESPERADO
                  </div>
                  <div style={{ fontWeight: 800 }}>{brl(ultimo.esperado)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 11.5, fontWeight: 700 }}>
                    CONTADO
                  </div>
                  <div style={{ fontWeight: 800 }}>{brl(ultimo.contado)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 11.5, fontWeight: 700 }}>
                    DIFERENÇA
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      color:
                        Math.abs(ultimo.diferenca) < 0.005
                          ? "#1E7F4F"
                          : ultimo.diferenca > 0
                          ? "#B54708"
                          : "#B42318",
                    }}
                  >
                    {Math.abs(ultimo.diferenca) < 0.005
                      ? "Confere"
                      : ultimo.diferenca > 0
                      ? `Sobra de ${brl(ultimo.diferenca)}`
                      : `Falta de ${brl(Math.abs(ultimo.diferenca))}`}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------- com caixa --
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "26px 24px 60px" }} className="pdv-shell">
      <PageHeader
        titulo="PDV"
        subtitulo={
          <>
            Caixa aberto {dataCurta(sessao.aberta_em)} · fundo {brl(sessao.abertura)}
            {sessao.operador ? ` · ${sessao.operador}` : ""}.
          </>
        }
        voltarPara="/crm"
      />

      <Aviso aviso={aviso} />

      <div className="pdv-grid">
        {/* -------------------------------------------------- coluna esquerda */}
        <div>
          <section style={CARD}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <h2 style={{ ...TITULO, margin: 0 }}>Ponto de venda</h2>
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                passe o leitor ou digite…
              </span>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ ...LABEL, flex: 1, minWidth: 220 }}>
                Buscar produto
                <div style={{ position: "relative" }}>
                  <input
                    ref={buscaRef}
                    value={busca}
                    onChange={(e) => {
                      setBusca(e.target.value);
                      setDestaque(0);
                    }}
                    placeholder="nome, código ou 3*7891002…"
                    aria-label="Buscar produto"
                    style={{ ...INPUT, display: "block", marginTop: 4, width: "100%" }}
                  />
                  {mult.qtd > 1 && termo.length >= 0 && busca !== termo && (
                    <span
                      aria-label="Multiplicador"
                      style={{
                        position: "absolute",
                        right: 8,
                        top: 10,
                        background: "var(--pink-600)",
                        color: "#FFF",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "2px 8px",
                      }}
                    >
                      {mult.qtd}×
                    </span>
                  )}
                </div>
              </label>
              <label style={LABEL}>
                Canal
                <select
                  value={canal}
                  onChange={(e) => setCanal(e.target.value)}
                  aria-label="Canal"
                  style={{ ...INPUT, display: "block", marginTop: 4 }}
                >
                  <option value="varejo">Varejo</option>
                  <option value="atacado">Atacado</option>
                </select>
              </label>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "var(--ink-soft)",
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  padding: "5px 10px",
                }}
              >
                Leitor ativo · F2
              </span>
            </div>

            {termo.length < 2 ? (
              <div
                aria-label="Pronto para vender"
                style={{
                  marginTop: 16,
                  textAlign: "center",
                  padding: "26px 12px",
                  background: "var(--white)",
                  border: "1px dashed var(--border)",
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    width: 54,
                    height: 54,
                    margin: "0 auto 10px",
                    borderRadius: 999,
                    background: "var(--pink-100)",
                    color: "var(--pink-600)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 18,
                    letterSpacing: 2,
                  }}
                >
                  |||
                </div>
                <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: 14 }}>
                  Pronto para vender
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
                  Digite 2+ caracteres para buscar · F2 foca a busca · F8 abre o caixa · F12
                  finaliza · Esc limpa
                </div>
              </div>
            ) : filtrados.length === 0 ? (
              <div
                style={{
                  marginTop: 16,
                  textAlign: "center",
                  padding: "22px 12px",
                  background: "var(--white)",
                  border: "1px dashed var(--border)",
                  borderRadius: 12,
                  fontSize: 13,
                  color: "var(--ink-soft)",
                }}
              >
                Nenhum produto para “{mult.termo.trim()}”.
              </div>
            ) : (
              <div
                style={{
                  marginTop: 16,
                  background: "var(--white)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "8px 12px",
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    color: "var(--ink-soft)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span style={{ width: 130 }}>Código</span>
                  <span style={{ flex: 1 }}>Produto</span>
                  <span style={{ width: 88 }}>Estoque</span>
                  <span style={{ width: 90, textAlign: "right" }}>Preço</span>
                  <span style={{ width: 96 }} />
                </div>
                {filtrados.map((i, idx) => {
                  const baixo = i.estoque !== null && i.estoque <= 5;
                  const ativo = idx === destaque;
                  const relido = i.id === ultimoItem;
                  return (
                    <div
                      key={i.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 12px",
                        fontSize: 13,
                        borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                        background: relido ? "var(--pink-100)" : ativo ? "#F6FAFB" : "transparent",
                        borderLeft: relido ? "3px solid var(--pink-600)" : "3px solid transparent",
                      }}
                    >
                      <span style={{ width: 130, fontFamily: "monospace", fontSize: 12 }}>
                        {i.sku}
                      </span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{i.name}</span>
                      <span
                        style={{
                          width: 88,
                          fontSize: 12,
                          fontWeight: 700,
                          color: baixo ? "#B54708" : "var(--ink-soft)",
                        }}
                      >
                        {i.estoque === null
                          ? "sem controle"
                          : baixo
                          ? `${i.estoque} un. · baixo`
                          : `${i.estoque} un.`}
                      </span>
                      <span style={{ width: 90, textAlign: "right", fontWeight: 700 }}>
                        {brl(precoDe(i))}
                      </span>
                      <span style={{ width: 96, textAlign: "right" }}>
                        <button
                          onClick={() => addItem(i)}
                          aria-label={`Adicionar ${i.name}`}
                          style={{ ...BTN, background: "var(--navy)", color: "#FFF" }}
                        >
                          Adicionar
                        </button>
                      </span>
                    </div>
                  );
                })}
                <div
                  style={{
                    padding: "7px 12px",
                    fontSize: 11.5,
                    color: "var(--ink-soft)",
                    borderTop: "1px solid var(--border)",
                    background: "var(--bg-cloud)",
                  }}
                >
                  {filtrados.length} produto{filtrados.length > 1 ? "s" : ""} encontrado
                  {filtrados.length > 1 ? "s" : ""}
                </div>
              </div>
            )}
          </section>

          {/* ---------------------------------------------- painel Caixa (F8) */}
          <section ref={caixaRef} aria-label="Painel Caixa" tabIndex={-1} style={CARD}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <h2 style={{ ...TITULO, margin: 0 }}>Caixa</h2>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)" }}>
                aberto · F8
              </span>
            </div>

            {/* CX-10: resumo do caixa aberto */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={resumoCard}>
                <div style={resumoRotulo}>ABERTURA</div>
                <div style={resumoValor}>{brl(resumo?.abertura ?? sessao.abertura)}</div>
              </div>
              <div style={resumoCard}>
                <div style={resumoRotulo}>VENDAS</div>
                <div style={resumoValor}>
                  {resumo?.vendasQtd ?? 0} · {brl(resumo?.vendasTotal ?? 0)}
                </div>
              </div>
              <div
                style={{
                  ...resumoCard,
                  background: "var(--pink-100)",
                  border: "1px solid var(--pink-300)",
                }}
              >
                <div style={resumoRotulo}>DINHEIRO NA GAVETA</div>
                <div style={{ ...resumoValor, color: "var(--navy)" }}>
                  {brl(resumo?.gaveta ?? sessao.abertura)}
                </div>
              </div>
            </div>

            <h3 style={{ fontSize: 13.5, margin: "0 0 8px", color: "var(--navy)" }}>Movimentação</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <label style={LABEL}>
                Tipo
                <select
                  value={scTipo}
                  onChange={(e) => setScTipo(e.target.value)}
                  aria-label="Tipo de movimento"
                  style={{ ...INPUT, display: "block", marginTop: 4 }}
                >
                  <option value="suprimento">Suprimento (+)</option>
                  <option value="sangria">Sangria (−)</option>
                </select>
              </label>
              <label style={LABEL}>
                Valor (R$)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={scValor}
                  onChange={(e) => setScValor(e.target.value)}
                  aria-label="Valor do movimento"
                  style={{ ...INPUT, display: "block", marginTop: 4, width: 110 }}
                />
              </label>
              <label style={{ ...LABEL, flex: 1, minWidth: 120 }}>
                Motivo
                <input
                  value={scMotivo}
                  onChange={(e) => setScMotivo(e.target.value)}
                  placeholder="troco, depósito…"
                  aria-label="Motivo do movimento"
                  style={{ ...INPUT, display: "block", marginTop: 4, width: "100%" }}
                />
              </label>
              <button
                disabled={pendente || !scValor || !scMotivo.trim()}
                onClick={() =>
                  rodar(() => movimentoCaixa(scTipo, Number(scValor), scMotivo), () => {
                    setScValor("");
                    setScMotivo("");
                  })
                }
                aria-label="Registrar movimento"
                style={{ ...BTN, background: "var(--blue-600)", color: "#FFF", padding: "9px 16px" }}
              >
                Registrar movimento
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
              {movimentos.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>
                  Nenhum movimento nesta sessão.
                </p>
              )}
              {movimentos.slice(0, 12).map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "baseline",
                    fontSize: 12.5,
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: 5,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 800,
                      color:
                        m.tipo === "suprimento" || m.direcao === "in" ? "#1E7F4F" : "#B42318",
                      minWidth: 84,
                    }}
                  >
                    {m.tipo}
                  </span>
                  <span style={{ flex: 1, color: "var(--ink-soft)" }}>
                    {m.motivo ?? dataCurta(m.criado_em)}
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    {m.direcao === "in" ? "+" : "−"} {brl(m.valor)}
                  </span>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 13.5, margin: "0 0 8px", color: "var(--navy)" }}>Fechar caixa</h3>
            <div
              style={{
                background: "var(--white)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                marginBottom: 10,
                fontSize: 12.5,
              }}
            >
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
                {(resumo?.porPagamento ?? []).length === 0 && (
                  <span style={{ color: "var(--ink-soft)" }}>Sem vendas ainda.</span>
                )}
                {(resumo?.porPagamento ?? []).map((p) => (
                  <span key={p.metodo}>
                    <b>{ROTULO_METODO[p.metodo] ?? p.metodo}</b>: {brl(p.total)}
                  </span>
                ))}
              </div>
              <div style={{ color: "var(--ink-soft)" }}>
                Abertura {brl(resumo?.abertura ?? sessao.abertura)} · suprimentos{" "}
                {brl(resumo?.suprimentos ?? 0)} · sangrias {brl(resumo?.sangrias ?? 0)} ·{" "}
                <b style={{ color: "var(--navy)" }}>esperado {brl(esperado)}</b>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={LABEL}>
                Dinheiro contado (R$)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={contagem}
                  onChange={(e) => setContagem(e.target.value)}
                  aria-label="Valor da contagem"
                  style={{ ...INPUT, display: "block", marginTop: 4, width: 150 }}
                />
              </label>
              <button
                disabled={pendente || contagem === ""}
                onClick={() => rodar(() => fecharCaixa(Number(contagem)), () => setContagem(""))}
                aria-label="Fechar caixa"
                style={{ ...BTN, background: "var(--navy)", color: "#FFF", padding: "9px 18px" }}
              >
                Fechar caixa
              </button>
              {fechamentoVivo && (
                <span
                  role="status"
                  style={{ fontSize: 13, fontWeight: 800, color: fechamentoVivo.cor, paddingBottom: 6 }}
                >
                  {fechamentoVivo.texto}
                </span>
              )}
            </div>
          </section>
        </div>

        {/* ------------------------------------------------------ comanda ---- */}
        <aside
          className="pdv-comanda"
          data-aberto={drawerAberto ? "true" : "false"}
          aria-label="Comanda"
          style={CARD}
        >
          <button
            className="pdv-fechar"
            aria-label="Fechar comanda"
            onClick={() => setDrawerAberto(false)}
          >
            ✕
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <h2 style={{ ...TITULO, margin: 0 }}>
              Comanda ({qtdCarrinho})
            </h2>
            <button
              onClick={limparComanda}
              aria-label="Limpar comanda"
              disabled={carrinho.length === 0 && !desconto}
              style={{
                ...BTN,
                background: "transparent",
                color: "#991B1B",
                border: "1px solid var(--border)",
              }}
            >
              Limpar
            </button>
          </div>

          {carrinho.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "6px 0 14px" }}>
              Comanda vazia — leia um código ou busque um produto (PDV-01).
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    color: "var(--ink-soft)",
                    fontSize: 11,
                    textTransform: "uppercase",
                  }}
                >
                  <th style={{ padding: "5px 6px" }}>Item</th>
                  <th style={{ padding: "5px 6px" }}>Qtd</th>
                  <th style={{ padding: "5px 6px", textAlign: "right" }}>Subtotal</th>
                  <th style={{ padding: "5px 6px" }} />
                </tr>
              </thead>
              <tbody>
                {carrinho.map((l) => {
                  const item = itens.find((i) => i.id === l.item_id);
                  const sub = item ? precoDe(item) * l.qty : 0;
                  const relido = l.item_id === ultimoItem;
                  return (
                    <tr
                      key={l.item_id}
                      style={{
                        borderTop: "1px solid var(--border)",
                        background: relido ? "var(--pink-100)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "7px 6px" }}>
                        {l.sku} — {l.name}
                      </td>
                      <td style={{ padding: "7px 6px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button
                            onClick={() => mudarQtd(l.item_id, -1)}
                            aria-label={`Remover ${l.name}`}
                            style={{ ...BTN, background: "#FEE2E2", color: "#991B1B", padding: "3px 10px" }}
                          >
                            −
                          </button>
                          <span style={{ fontWeight: 700, minWidth: 20, textAlign: "center" }}>
                            {l.qty}
                          </span>
                          <button
                            onClick={() => mudarQtd(l.item_id, 1)}
                            aria-label={`Somar ${l.name}`}
                            style={{ ...BTN, background: "#DCFCE7", color: "#166534", padding: "3px 10px" }}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700 }}>
                        {brl(sub)}
                      </td>
                      <td style={{ padding: "7px 6px", textAlign: "right" }}>
                        <button
                          onClick={() =>
                            setCarrinho((p) => p.filter((x) => x.item_id !== l.item_id))
                          }
                          aria-label={`Excluir ${l.name}`}
                          style={{
                            ...BTN,
                            background: "transparent",
                            color: "#991B1B",
                            border: "1px solid #FECACA",
                            padding: "3px 8px",
                          }}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              padding: "3px 0",
            }}
          >
            <span style={{ color: "var(--ink-soft)" }}>Subtotal</span>
            <span style={{ fontWeight: 700 }}>{brl(subtotal)}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              padding: "3px 0 6px",
            }}
          >
            <label style={{ color: "var(--ink-soft)" }}>
              Desconto (R$)
              <input
                type="number"
                min={0}
                step="0.01"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                aria-label="Desconto"
                placeholder="0"
                style={{ ...INPUT, width: 92, marginLeft: 6, padding: 5 }}
              />
            </label>
            <span style={{ fontWeight: 700, color: descNum > 0 ? "#B54708" : "var(--ink-soft)" }}>
              − {brl(descNum)}
            </span>
          </div>
          {tetoDesconto !== null && (
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 6 }}>
              Seu limite de desconto é 10% do subtotal (máx. {brl(tetoDesconto)}).
            </div>
          )}

          <div style={{ textAlign: "right", marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 800 }}>
              TOTAL A PAGAR
            </div>
            <div
              style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)", lineHeight: 1.1 }}
              aria-label="Total da venda"
            >
              {brl(totalFinal)}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ ...LABEL, flex: 1, minWidth: 130 }}>
              Forma de pagamento
              <select
                value={metodo}
                onChange={(e) => {
                  setMetodo(e.target.value);
                  if (e.target.value !== "cartao") setParcelas(1);
                }}
                aria-label="Forma de pagamento"
                style={{ ...INPUT, display: "block", marginTop: 4, width: "100%" }}
              >
                {METODOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            {metodo === "cartao" && (
              <label style={{ ...LABEL, width: 86 }}>
                Parcelas
                <select
                  value={parcelas}
                  onChange={(e) => setParcelas(Number(e.target.value))}
                  aria-label="Parcelas"
                  style={{ ...INPUT, display: "block", marginTop: 4, width: "100%" }}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}x
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                if (caixaRef.current) {
                  caixaRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
                  const primeiro = caixaRef.current.querySelector<HTMLElement>("input, select, button");
                  primeiro?.focus();
                }
              }}
              aria-label="Abrir painel de caixa"
              style={{
                ...BTN,
                flex: 1,
                background: "transparent",
                color: "var(--navy)",
                border: "1.5px solid var(--navy)",
                padding: "10px 12px",
              }}
            >
              Caixa (F8)
            </button>
            <button
              disabled={pendente || carrinho.length === 0}
              onClick={registrarVenda}
              aria-label="Registrar venda"
              style={{
                ...BTN,
                flex: 2,
                background: "var(--pink-600)",
                color: "#FFF",
                padding: "11px 18px",
                fontSize: 14,
              }}
            >
              Registrar venda (F12)
            </button>
          </div>

          {venda && (
            <section
              aria-label="Comprovante"
              style={{
                marginTop: 16,
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                borderRadius: 12,
                padding: 14,
              }}
            >
              <h3 style={{ fontSize: 15, margin: "0 0 8px", color: "#166534" }}>
                Comprovante não fiscal — venda registrada
              </h3>
              <p style={{ fontSize: 13, margin: "0 0 4px", color: "#166534", fontWeight: 700 }}>
                Pedido {venda.numero ?? venda.pedido.slice(0, 8)} · {brl(venda.total)} ·{" "}
                {METODOS.find((m) => m.valor === venda.metodo)?.label}
                {venda.parcelas > 1 ? ` em ${venda.parcelas}x` : ""}
                {descNum > 0 ? ` · desconto ${brl(descNum)}` : ""}
                {venda.titulo ? " · título gerado no financeiro" : ""}
              </p>
              <ul style={{ fontSize: 13, margin: "6px 0 10px", paddingLeft: 18, color: "#374151" }}>
                {venda.itens.map((l, idx) => (
                  <li key={idx}>
                    {l.qty}× {l.name} — {brl(l.preco)} un.
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => setVenda(null)}
                  style={{ ...BTN, background: "var(--navy)", color: "#FFF" }}
                >
                  Nova venda
                </button>
                <button
                  onClick={() => rodar(() => emitirNfcePdv(venda.pedido))}
                  aria-label="Emitir NFC-e"
                  style={{
                    ...BTN,
                    background: "transparent",
                    color: "var(--navy)",
                    border: "1.5px solid var(--navy)",
                  }}
                >
                  Emitir NFC-e
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>

      {/* barra flutuante do drawer (mobile, <900px) */}
      <button
        className="pdv-barra"
        aria-label="Abrir comanda"
        onClick={() => setDrawerAberto(true)}
      >
        <span>
          {qtdCarrinho} item{qtdCarrinho === 1 ? "" : "s"} · {brl(totalFinal)} →
        </span>
        <span style={{ fontWeight: 800 }}>Comanda</span>
      </button>
      <button
        className="pdv-fundo"
        data-aberto={drawerAberto ? "true" : "false"}
        aria-label="Fechar comanda"
        onClick={() => setDrawerAberto(false)}
      />
    </div>
  );
}

const resumoCard: React.CSSProperties = {
  flex: "1 1 150px",
  background: "var(--white)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "10px 12px",
};

const resumoRotulo: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  color: "var(--ink-soft)",
  letterSpacing: 0.4,
};

const resumoValor: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  color: "var(--navy)",
  marginTop: 2,
};
