"use client";

import { useMemo, useState, useTransition } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  cancelarNfe,
  emitirNfe,
  type EntradaNfe,
  type ResultadoNfe,
} from "@/app/vendas/actions";

// Console do módulo Vendas (Vendas Detalhada): gestão de pedidos de venda e
// de compra em telas simples + emissão de nota fiscal (emissão interna da
// empresa; as telas clássicas de NF-e serviram só de referência — este é o
// nosso layout). Abas: Vendas | Compras | Notas emitidas.

export type ItemPedido = { sku: string; nome: string; qtd: number; unit: number; total: number };

export type PedidoVenda = {
  id: string;
  codigo: string;
  cliente: string;
  email: string;
  canal: string;
  status: string;
  data: string;
  total: number;
  itens: ItemPedido[];
};

export type PedidoCompra = {
  id: string;
  codigo: string;
  fornecedor: string;
  status: string;
  data: string;
  total: number;
  itens: ItemPedido[];
};

export type NotaEmitida = {
  id: string;
  tipo: string;
  numero: number;
  serie: number;
  status: string;
  data: string;
  natureza: string;
  cfop: string;
  destinatario: { nome?: string; doc?: string; endereco?: string };
  frete: { modalidade?: string; valor?: number };
  itens: {
    sku: string;
    nome: string;
    ncm: string;
    cfop: string;
    origem: string;
    cst: string;
    qtd: number;
    unit: number;
    total: number;
    icmsPct: number;
    pisPct: number;
    cofinsPct: number;
  }[];
  totais: { base: number; icms: number; pis: number; cofins: number; total: number };
  dadosAdicionais: string | null;
  vinculo: string;
  vinculoNome: string;
};

const EMITENTE = {
  razao: "CR Comércio e Exportação LTDA",
  fantasia: "Nuvem de Papel",
  cnpj: "49.163.008/0001-68",
  endereco: "Travessa Colonial, 56 – Jardim Algodoal – Piracicaba/SP – CEP 13405-404",
  email: "contato@nuvemdepapel.com.br",
};

const STATUS_VENDA: Record<string, { label: string; bg: string; fg: string }> = {
  aguardando_pagamento: { label: "Aguardando pagamento", bg: "var(--bg-cloud)", fg: "var(--ink-soft)" },
  pago: { label: "Pago", bg: "#DCFCE7", fg: "#166534" },
  processando: { label: "Processando", bg: "var(--pink-100)", fg: "var(--pink-600)" },
  em_rota: { label: "Em rota", bg: "#DBEAFE", fg: "#1D4ED8" },
  entregue: { label: "Entregue", bg: "#DCFCE7", fg: "#166534" },
  cancelado: { label: "Cancelado", bg: "#FEE2E2", fg: "#991B1B" },
};

const STATUS_COMPRA: Record<string, { label: string; bg: string; fg: string }> = {
  aberto: { label: "Aberto", bg: "var(--pink-100)", fg: "var(--pink-600)" },
  parcial: { label: "Parcial", bg: "#FEF3C7", fg: "#92400E" },
  recebido: { label: "Recebido", bg: "#DCFCE7", fg: "#166534" },
  cancelado: { label: "Cancelado", bg: "#FEE2E2", fg: "#991B1B" },
};

const FRETE_OPCOES = [
  { v: "0", l: "0 — CIF (paga o emitente)" },
  { v: "1", l: "1 — FOB (paga o destinatário)" },
  { v: "2", l: "2 — Por conta de terceiros" },
  { v: "9", l: "9 — Sem frete" },
];

const NATUREZAS: Record<"saida" | "entrada", string[]> = {
  saida: ["Venda de mercadoria", "Devolução de mercadoria", "Transferência", "Prestação de serviço"],
  entrada: ["Compra para comercialização", "Devolução", "Transferência", "Compra de uso e consumo"],
};

const FONT_LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "var(--ink-soft)",
  marginBottom: 5,
};

const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1.5px solid var(--border)",
  background: "#FFF",
  fontSize: 13.5,
  color: "var(--ink)",
  fontFamily: "inherit",
};

const BTN: React.CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "7px 14px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

type FormNfe = {
  natureza: string;
  cfop: string;
  serie: number;
  nome: string;
  doc: string;
  endereco: string;
  freteModal: string;
  freteValor: number;
  ncm: string;
  origem: string;
  cst: string;
  icmsPct: number;
  pisPct: number;
  cofinsPct: number;
  dadosAdicionais: string;
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Badge({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: 11.5,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Campo({
  label,
  children,
  largura,
}: {
  label: string;
  children: React.ReactNode;
  largura?: number;
}) {
  return (
    <label style={{ display: "block", width: largura ? largura : undefined, flex: largura ? "0 0 auto" : undefined }}>
      <span style={FONT_LABEL}>{label}</span>
      {children}
    </label>
  );
}

function inicial(tipo: "saida" | "entrada", nome: string): FormNfe {
  return {
    natureza: tipo === "saida" ? NATUREZAS.saida[0] : NATUREZAS.entrada[0],
    cfop: tipo === "saida" ? "5102" : "1102",
    serie: 1,
    nome,
    doc: "",
    endereco: "",
    freteModal: "9",
    freteValor: 0,
    ncm: "4901.99.00",
    origem: "0",
    cst: "000",
    icmsPct: 18,
    pisPct: 1.65,
    cofinsPct: 7.6,
    dadosAdicionais: "",
  };
}

export function ConsoleVendas({
  vendas,
  compras,
  notas,
}: {
  vendas: PedidoVenda[];
  compras: PedidoCompra[];
  notas: NotaEmitida[];
}) {
  const [aba, setAba] = useState<"vendas" | "compras" | "notas">("vendas");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [emissao, setEmissao] = useState<{ tipo: "saida" | "entrada"; pedido: PedidoVenda | PedidoCompra } | null>(null);
  const [form, setForm] = useState<FormNfe | null>(null);
  const [doc, setDoc] = useState<NotaEmitida | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();

  const proximoNumero = useMemo(() => {
    return (serie: number) => {
      const numeros = notas.filter((n) => n.serie === serie).map((n) => n.numero);
      return (numeros.length ? Math.max(...numeros) : 0) + 1;
    };
  }, [notas]);

  const totaisPrevistos = useMemo(() => {
    if (!emissao || !form) return null;
    const itens = emissao.pedido.itens;
    const base = itens.reduce((s, i) => s + i.total, 0);
    const icms = itens.reduce((s, i) => s + (i.total * (Number(form.icmsPct) || 0)) / 100, 0);
    const pis = itens.reduce((s, i) => s + (i.total * (Number(form.pisPct) || 0)) / 100, 0);
    const cofins = itens.reduce((s, i) => s + (i.total * (Number(form.cofinsPct) || 0)) / 100, 0);
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
    return { base: r2(base), icms: r2(icms), pis: r2(pis), cofins: r2(cofins), total: r2(base) };
  }, [emissao, form]);

  function abrirEmissao(tipo: "saida" | "entrada", pedido: PedidoVenda | PedidoCompra) {
    const nome = tipo === "saida" ? (pedido as PedidoVenda).cliente : (pedido as PedidoCompra).fornecedor;
    setAviso(null);
    setForm(inicial(tipo, nome));
    setEmissao({ tipo, pedido });
  }

  function fecharEmissao() {
    setEmissao(null);
    setForm(null);
  }

  function confirmarEmissao() {
    if (!emissao || !form || pendente) return;
    if (!form.nome.trim()) {
      setAviso({ tipo: "erro", texto: "Informe o destinatário da nota." });
      return;
    }
    if (!/^\d{4}$/.test(form.cfop.trim())) {
      setAviso({ tipo: "erro", texto: "CFOP deve ter 4 dígitos (ex.: 5102)." });
      return;
    }

    const payload: EntradaNfe = {
      tipo: emissao.tipo,
      pedidoId: emissao.pedido.id,
      naturezaOperacao: form.natureza,
      cfop: form.cfop.trim(),
      serie: Number(form.serie),
      destinatario: {
        nome: form.nome.trim(),
        doc: form.doc.trim(),
        endereco: form.endereco.trim(),
      },
      frete: { modalidade: form.freteModal, valor: Number(form.freteValor) || 0 },
      itens: emissao.pedido.itens.map((i) => ({
        sku: i.sku,
        nome: i.nome,
        ncm: form.ncm.trim(),
        cfop: form.cfop.trim(),
        origem: form.origem,
        cst: form.cst.trim(),
        qtd: i.qtd,
        unit: i.unit,
        total: i.total,
        icmsPct: Number(form.icmsPct) || 0,
        pisPct: Number(form.pisPct) || 0,
        cofinsPct: Number(form.cofinsPct) || 0,
      })),
      dadosAdicionais: form.dadosAdicionais,
    };

    startTransition(async () => {
      const r: ResultadoNfe = await emitirNfe(payload);
      if (r.ok) {
        setEmissao(null);
        setForm(null);
        setAviso({ tipo: "ok", texto: r.msg });
        setAba("notas");
      } else {
        setAviso({ tipo: "erro", texto: r.erro });
      }
    });
  }

  function cancelarNota(nota: NotaEmitida) {
    if (pendente) return;
    if (!window.confirm(`Cancelar a NF-e ${nota.numero} (série ${nota.serie})?`)) return;
    startTransition(async () => {
      const r: ResultadoNfe = await cancelarNfe(nota.id);
      setAviso({ tipo: r.ok ? "ok" : "erro", texto: r.ok ? r.msg : r.erro });
    });
  }

  function toggleExpandir(id: string) {
    setExpandido((atual) => (atual === id ? null : id));
  }

  const th: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--ink-soft)",
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "11px 12px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13.5,
    color: "var(--ink)",
    verticalAlign: "middle",
  };

  const CARD: React.CSSProperties = {
    background: "var(--bg-cloud)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-card)",
    overflow: "hidden",
    boxShadow: "var(--shadow-card)",
  };

  const TABS: { id: "vendas" | "compras" | "notas"; label: string; qtd: number }[] = [
    { id: "vendas", label: "Vendas", qtd: vendas.length },
    { id: "compras", label: "Compras", qtd: compras.length },
    { id: "notas", label: "Notas emitidas", qtd: notas.length },
  ];

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "26px 24px 60px" }}>
      <PageHeader
        titulo="Vendas Detalhada"
        subtitulo="Pedidos de venda e compra em detalhe — com emissão de nota fiscal."
        voltarPara="/crm"
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

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            aria-label={`Aba ${t.label}`}
            onClick={() => {
              setAba(t.id);
              setExpandido(null);
            }}
            style={{
              padding: "8px 18px",
              borderRadius: 10,
              border: `1.5px solid ${aba === t.id ? "var(--pink-600)" : "var(--border)"}`,
              background: aba === t.id ? "var(--pink-600)" : "var(--bg-cloud)",
              color: aba === t.id ? "#fff" : "var(--ink-soft)",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Open Sans', sans-serif",
            }}
          >
            {t.label}
            <span style={{ opacity: 0.8, fontWeight: 600 }}> ({t.qtd})</span>
          </button>
        ))}
      </div>

      {aba === "vendas" && (
        <div style={CARD}>
          {vendas.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: 24, margin: 0 }}>
              Nenhum pedido de venda registrado.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Pedido</th>
                  <th style={th}>Cliente</th>
                  <th style={th}>Canal</th>
                  <th style={th}>Status</th>
                  <th style={th}>Data</th>
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                  <th style={{ ...th, textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((p) => {
                  const st = STATUS_VENDA[p.status] ?? { label: p.status, bg: "var(--bg-cloud)", fg: "var(--ink-soft)" };
                  return (
                    <tr key={p.id} style={{ borderBottom: expandido === p.id ? "none" : undefined }}>
                      <td style={{ ...td, fontWeight: 700 }}>{p.codigo}</td>
                      <td style={td}>
                        {p.cliente}
                        {p.email && (
                          <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-soft)" }}>{p.email}</span>
                        )}
                      </td>
                      <td style={{ ...td, textTransform: "capitalize" }}>{p.canal}</td>
                      <td style={td}>
                        <Badge bg={st.bg} fg={st.fg}>{st.label}</Badge>
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{quando(p.data)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{brl(p.total)}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => toggleExpandir(p.id)}
                          style={{ ...BTN, background: "var(--bg-cloud)", color: "var(--navy)", marginRight: 8 }}
                        >
                          {expandido === p.id ? "Ocultar" : "Itens"}
                        </button>
                        <button
                          type="button"
                          aria-label={`Emitir NF-e ${p.codigo}`}
                          onClick={() => abrirEmissao("saida", p)}
                          style={{ ...BTN, background: "var(--pink-600)", color: "#FFF" }}
                        >
                          Emitir NF-e
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {vendas.map((p) =>
                  expandido === p.id ? (
                    <tr key={`${p.id}-itens`}>
                      <td colSpan={7} style={{ ...td, background: "#FFF", borderBottom: "1px solid var(--border)" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th style={{ ...th, paddingLeft: 24 }}>SKU</th>
                              <th style={th}>Descrição</th>
                              <th style={{ ...th, textAlign: "right" }}>Qtd</th>
                              <th style={{ ...th, textAlign: "right" }}>V. unit</th>
                              <th style={{ ...th, textAlign: "right", paddingRight: 24 }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.itens.length === 0 ? (
                              <tr>
                                <td colSpan={5} style={{ ...td, color: "var(--ink-soft)" }}>
                                  Pedido sem itens registrados.
                                </td>
                              </tr>
                            ) : (
                              p.itens.map((i, idx) => (
                                <tr key={`${p.id}-${idx}`}>
                                  <td style={{ ...td, paddingLeft: 24, fontSize: 12.5 }}>
                                    {i.sku}
                                  </td>
                                  <td style={td}>{i.nome}</td>
                                  <td style={{ ...td, textAlign: "right" }}>{i.qtd}</td>
                                  <td style={{ ...td, textAlign: "right" }}>{brl(i.unit)}</td>
                                  <td style={{ ...td, textAlign: "right", fontWeight: 700, paddingRight: 24 }}>
                                    {brl(i.total)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {aba === "compras" && (
        <div style={CARD}>
          {compras.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: 24, margin: 0 }}>
              Nenhum pedido de compra registrado.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Código</th>
                  <th style={th}>Fornecedor</th>
                  <th style={th}>Status</th>
                  <th style={th}>Data</th>
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                  <th style={{ ...th, textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((p) => {
                  const st = STATUS_COMPRA[p.status] ?? { label: p.status, bg: "var(--bg-cloud)", fg: "var(--ink-soft)" };
                  return (
                    <tr key={p.id}>
                      <td style={{ ...td, fontWeight: 700 }}>{p.codigo}</td>
                      <td style={td}>{p.fornecedor}</td>
                      <td style={td}>
                        <Badge bg={st.bg} fg={st.fg}>{st.label}</Badge>
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{quando(p.data)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{brl(p.total)}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          aria-label={`Emitir NF-e entrada ${p.codigo}`}
                          onClick={() => abrirEmissao("entrada", p)}
                          style={{ ...BTN, background: "var(--pink-600)", color: "#FFF" }}
                        >
                          Emitir NF-e
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {aba === "notas" && (
        <div style={CARD}>
          {notas.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: 24, margin: 0 }}>
              Nenhuma nota emitida ainda — use “Emitir NF-e” na aba Vendas ou Compras.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>NF-e</th>
                  <th style={th}>Vínculo</th>
                  <th style={th}>Destinatário</th>
                  <th style={th}>Natureza / CFOP</th>
                  <th style={th}>Emissão</th>
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {notas.map((n) => (
                  <tr key={n.id}>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>
                      NF-e {n.numero}
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 600 }}>
                        Série {n.serie} · {n.tipo === "saida" ? "Saída" : "Entrada"}
                      </span>
                    </td>
                    <td style={td}>
                      {n.vinculo}
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-soft)" }}>{n.vinculoNome}</span>
                    </td>
                    <td style={td}>{n.destinatario?.nome || "—"}</td>
                    <td style={{ ...td, fontSize: 12.5 }}>
                      {n.natureza}
                      <span style={{ display: "block", color: "var(--ink-soft)" }}>CFOP {n.cfop}</span>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{quando(n.data)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {brl(n.totais?.total ?? 0)}
                    </td>
                    <td style={td}>
                      <Badge
                        bg={n.status === "emitida" ? "#DCFCE7" : "#FEE2E2"}
                        fg={n.status === "emitida" ? "#166534" : "#991B1B"}
                      >
                        {n.status === "emitida" ? "Emitida" : "Cancelada"}
                      </Badge>
                    </td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        aria-label={`Ver documento NF-e ${n.numero}`}
                        onClick={() => setDoc(n)}
                        style={{ ...BTN, background: "var(--bg-cloud)", color: "var(--navy)", marginRight: 8 }}
                      >
                        Ver
                      </button>
                      {n.status === "emitida" && (
                        <button
                          type="button"
                          aria-label={`Cancelar NF-e ${n.numero}`}
                          onClick={() => cancelarNota(n)}
                          disabled={pendente}
                          style={{
                            ...BTN,
                            background: "transparent",
                            color: "#991B1B",
                            border: "1px solid #FECACA",
                            opacity: pendente ? 0.6 : 1,
                          }}
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ------------------------------------------------ emissão (modal) -- */}
      {emissao && form && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(7,59,76,0.55)",
            zIndex: 60,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "28px 16px",
            overflowY: "auto",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) fecharEmissao();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Emissão de nota fiscal"
            style={{
              background: "#FFF",
              borderRadius: 16,
              border: "1px solid var(--border)",
              width: "100%",
              maxWidth: 880,
              boxShadow: "0 24px 60px rgba(7,59,76,0.35)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "16px 22px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pink-600)" }}>
                  {emissao.tipo === "saida" ? "NF-e de saída" : "NF-e de entrada"}
                </span>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--navy)" }}>
                  Emitir nota fiscal — {emissao.pedido.codigo}
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar emissão"
                onClick={fecharEmissao}
                style={{ ...BTN, background: "var(--bg-cloud)", color: "var(--navy)" }}
              >
                Fechar
              </button>
            </div>

            <div style={{ padding: "18px 22px 8px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--navy)", marginBottom: 12 }}>
                Etapa 1 — Dados gerais
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
                <Campo label="Natureza da operação" largura={260}>
                  <select
                    value={form.natureza}
                    onChange={(e) => setForm({ ...form, natureza: e.target.value })}
                    style={INPUT}
                  >
                    {NATUREZAS[emissao.tipo].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="CFOP" largura={110}>
                  <input
                    value={form.cfop}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(e) => setForm({ ...form, cfop: e.target.value.replace(/\D/g, "") })}
                    style={INPUT}
                  />
                </Campo>
                <Campo label="Série" largura={90}>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={form.serie}
                    onChange={(e) => setForm({ ...form, serie: Number(e.target.value) })}
                    style={INPUT}
                  />
                </Campo>
                <Campo label="Número" largura={120}>
                  <input value={proximoNumero(form.serie)} readOnly style={{ ...INPUT, background: "var(--bg-cloud)", color: "var(--ink-soft)" }} />
                </Campo>
              </div>

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, marginBottom: 6 }}>
                <Campo label={emissao.tipo === "saida" ? "Destinatário (nome / razão social)" : "Fornecedor (nome / razão social)"} largura={320}>
                  <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={INPUT} />
                </Campo>
                <Campo label="CNPJ / CPF" largura={180}>
                  <input value={form.doc} maxLength={18} onChange={(e) => setForm({ ...form, doc: e.target.value })} style={INPUT} />
                </Campo>
                <Campo label="Endereço" largura={300}>
                  <input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} style={INPUT} />
                </Campo>
              </div>

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
                <Campo label="Frete por conta de" largura={280}>
                  <select value={form.freteModal} onChange={(e) => setForm({ ...form, freteModal: e.target.value })} style={INPUT}>
                    {FRETE_OPCOES.map((f) => (
                      <option key={f.v} value={f.v}>
                        {f.l}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Valor do frete (R$)" largura={160}>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.freteValor}
                    onChange={(e) => setForm({ ...form, freteValor: Number(e.target.value) })}
                    style={INPUT}
                  />
                </Campo>
              </div>
            </div>

            <div style={{ padding: "10px 22px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--navy)", margin: "10px 0 12px" }}>
                Itens do pedido ({emissao.pedido.itens.length})
              </div>
              <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-cloud)" }}>
                      <th style={th}>SKU</th>
                      <th style={th}>Descrição</th>
                      <th style={{ ...th, textAlign: "right" }}>Qtd</th>
                      <th style={{ ...th, textAlign: "right" }}>V. unit</th>
                      <th style={{ ...th, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emissao.pedido.itens.map((i, idx) => (
                      <tr key={idx}>
                        <td style={{ ...td, fontSize: 12.5 }}>{i.sku}</td>
                        <td style={td}>{i.nome}</td>
                        <td style={{ ...td, textAlign: "right" }}>{i.qtd}</td>
                        <td style={{ ...td, textAlign: "right" }}>{brl(i.unit)}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{brl(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: "10px 22px 4px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--navy)", margin: "10px 0 12px" }}>
                Etapa 2 — Classificação e impostos (valem para todos os itens)
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Campo label="NCM" largura={130}>
                  <input value={form.ncm} maxLength={10} onChange={(e) => setForm({ ...form, ncm: e.target.value })} style={INPUT} />
                </Campo>
                <Campo label="Origem" largura={100}>
                  <select value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} style={INPUT}>
                    {["0", "1", "2", "3", "4", "5", "6", "7", "8"].map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="CST" largura={100}>
                  <input value={form.cst} maxLength={3} onChange={(e) => setForm({ ...form, cst: e.target.value.replace(/\D/g, "") })} style={INPUT} />
                </Campo>
                <Campo label="% ICMS" largura={110}>
                  <input type="number" min={0} max={100} step="0.01" value={form.icmsPct} onChange={(e) => setForm({ ...form, icmsPct: Number(e.target.value) })} style={INPUT} />
                </Campo>
                <Campo label="% PIS" largura={110}>
                  <input type="number" min={0} max={100} step="0.01" value={form.pisPct} onChange={(e) => setForm({ ...form, pisPct: Number(e.target.value) })} style={INPUT} />
                </Campo>
                <Campo label="% COFINS" largura={110}>
                  <input type="number" min={0} max={100} step="0.01" value={form.cofinsPct} onChange={(e) => setForm({ ...form, cofinsPct: Number(e.target.value) })} style={INPUT} />
                </Campo>
              </div>
              <label style={{ display: "block", marginTop: 14 }}>
                <span style={FONT_LABEL}>Dados adicionais</span>
                <textarea
                  rows={2}
                  value={form.dadosAdicionais}
                  onChange={(e) => setForm({ ...form, dadosAdicionais: e.target.value })}
                  placeholder="Informações complementares da nota…"
                  style={{ ...INPUT, resize: "vertical" }}
                />
              </label>
            </div>

            {totaisPrevistos && (
              <div
                style={{
                  margin: "6px 22px 0",
                  padding: "12px 16px",
                  background: "var(--bg-cloud)",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  display: "flex",
                  gap: 22,
                  flexWrap: "wrap",
                  fontSize: 13,
                  color: "var(--ink-soft)",
                }}
              >
                <span>
                  Base ICMS: <strong style={{ color: "var(--ink)" }}>{brl(totaisPrevistos.base)}</strong>
                </span>
                <span>
                  ICMS: <strong style={{ color: "var(--ink)" }}>{brl(totaisPrevistos.icms)}</strong>
                </span>
                <span>
                  PIS: <strong style={{ color: "var(--ink)" }}>{brl(totaisPrevistos.pis)}</strong>
                </span>
                <span>
                  COFINS: <strong style={{ color: "var(--ink)" }}>{brl(totaisPrevistos.cofins)}</strong>
                </span>
                <span style={{ marginLeft: "auto", fontWeight: 800, color: "var(--navy)", fontSize: 14.5 }}>
                  Total: {brl(totaisPrevistos.total)}
                </span>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: "16px 22px 20px",
                position: "sticky",
                bottom: 0,
                background: "#FFF",
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 16,
              }}
            >
              <button type="button" onClick={fecharEmissao} style={{ ...BTN, background: "var(--bg-cloud)", color: "var(--navy)" }}>
                Voltar
              </button>
              <button
                type="button"
                aria-label="Confirmar emissão"
                disabled={pendente}
                onClick={confirmarEmissao}
                style={{
                  ...BTN,
                  background: "var(--pink-600)",
                  color: "#FFF",
                  padding: "9px 20px",
                  opacity: pendente ? 0.6 : 1,
                }}
              >
                {pendente ? "Emitindo…" : "Confirmar emissão"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ documento (modal) -- */}
      {doc && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(7,59,76,0.55)",
            zIndex: 60,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "28px 16px",
            overflowY: "auto",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDoc(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Documento da NF-e ${doc.numero}`}
            style={{
              background: "#FFF",
              borderRadius: 16,
              border: "1px solid var(--border)",
              width: "100%",
              maxWidth: 760,
              boxShadow: "0 24px 60px rgba(7,59,76,0.35)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "16px 22px",
                borderBottom: "2px solid var(--navy)",
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pink-600)" }}>
                  Documento auxiliar da nota fiscal eletrônica
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--navy)" }}>
                  NF-e {doc.numero} — Série {doc.serie}{" "}
                  <span style={{ fontSize: 13, fontWeight: 700, color: doc.status === "emitida" ? "#166534" : "#991B1B" }}>
                    ({doc.status === "emitida" ? "Emitida" : "Cancelada"})
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar documento"
                onClick={() => setDoc(null)}
                style={{ ...BTN, background: "var(--bg-cloud)", color: "var(--navy)" }}
              >
                Fechar
              </button>
            </div>

            <div style={{ padding: "18px 22px 24px", fontSize: 13.5, color: "var(--ink)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6 }}>
                    Emitente
                  </div>
                  <strong>{EMITENTE.razao}</strong>
                  <div style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>
                    {EMITENTE.fantasia} · CNPJ {EMITENTE.cnpj}
                  </div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>{EMITENTE.endereco}</div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>{EMITENTE.email}</div>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6 }}>
                    {doc.tipo === "saida" ? "Destinatário" : "Fornecedor"}
                  </div>
                  <strong>{doc.destinatario?.nome || "—"}</strong>
                  <div style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>{doc.destinatario?.doc || "Documento não informado"}</div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>{doc.destinatario?.endereco || "Endereço não informado"}</div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>
                    Vínculo: {doc.vinculo} · {doc.vinculoNome}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14, fontSize: 12.5 }}>
                <span>
                  <strong>Natureza da operação:</strong> {doc.natureza}
                </span>
                <span>
                  <strong>CFOP:</strong> {doc.cfop}
                </span>
                <span>
                  <strong>Emissão:</strong> {quando(doc.data)}
                </span>
                <span>
                  <strong>Frete:</strong>{" "}
                  {FRETE_OPCOES.find((f) => f.v === String(doc.frete?.modalidade ?? "9"))?.l ?? "9 — Sem frete"}
                  {Number(doc.frete?.valor) > 0 ? ` · ${brl(Number(doc.frete.valor))}` : ""}
                </span>
              </div>

              <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-cloud)" }}>
                      <th style={th}>Código</th>
                      <th style={th}>Descrição</th>
                      <th style={th}>NCM</th>
                      <th style={th}>CFOP</th>
                      <th style={th}>CST</th>
                      <th style={{ ...th, textAlign: "right" }}>Qtd</th>
                      <th style={{ ...th, textAlign: "right" }}>V. unit</th>
                      <th style={{ ...th, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.itens.map((i, idx) => (
                      <tr key={idx}>
                        <td style={{ ...td, fontSize: 12.5 }}>{i.sku}</td>
                        <td style={td}>{i.nome}</td>
                        <td style={{ ...td, fontSize: 12.5 }}>{i.ncm}</td>
                        <td style={{ ...td, fontSize: 12.5 }}>{i.cfop}</td>
                        <td style={{ ...td, fontSize: 12.5 }}>{i.cst}</td>
                        <td style={{ ...td, textAlign: "right" }}>{i.qtd}</td>
                        <td style={{ ...td, textAlign: "right" }}>{brl(i.unit)}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{brl(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  background: "var(--bg-cloud)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "12px 16px",
                  display: "flex",
                  gap: 22,
                  flexWrap: "wrap",
                  fontSize: 13,
                  color: "var(--ink-soft)",
                  marginBottom: 14,
                }}
              >
                <span>
                  Base ICMS: <strong style={{ color: "var(--ink)" }}>{brl(doc.totais?.base ?? 0)}</strong>
                </span>
                <span>
                  ICMS: <strong style={{ color: "var(--ink)" }}>{brl(doc.totais?.icms ?? 0)}</strong>
                </span>
                <span>
                  PIS: <strong style={{ color: "var(--ink)" }}>{brl(doc.totais?.pis ?? 0)}</strong>
                </span>
                <span>
                  COFINS: <strong style={{ color: "var(--ink)" }}>{brl(doc.totais?.cofins ?? 0)}</strong>
                </span>
                <span style={{ marginLeft: "auto", fontWeight: 800, color: "var(--navy)", fontSize: 14.5 }}>
                  Total da nota: {brl(doc.totais?.total ?? 0)}
                </span>
              </div>

              {doc.dadosAdicionais && (
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
                  <strong style={{ color: "var(--ink)" }}>Dados adicionais:</strong> {doc.dadosAdicionais}
                </div>
              )}

              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                Documento emitido pelo sistema Nuvem de Papel para {doc.tipo === "saida" ? "venda" : "compra"} —
                grade de consulta e numeração controlada pela empresa.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
