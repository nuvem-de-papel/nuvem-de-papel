"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  avancarEntrega,
  atualizarEntrega,
  cancelarNfe,
  cancelarPedido,
  consultarNfe,
  converterVenda,
  emitirNfe,
  importarPedidosLoja,
  registrarOcorrencia,
  transmitirNfe,
  buscarXmlNota,
  salvarVendedor,
  removerVendedor,
  definirVendedorPedido,
  type EntradaNfe,
  type EntradaVendedor,
  type LinhaComissao,
  type Resultado,
  type ResultadoNfe,
  type Vendedor,
} from "@/app/vendas/actions";
import BotaoImprimir from "@/components/compras/BotaoImprimir";

// Console do módulo Vendas (Vendas Detalhada): gestão de pedidos de venda e
// de compra em telas simples + emissão de nota fiscal (emissão interna da
// empresa; as telas clássicas de NF-e serviram só de referência — este é o
// nosso layout). Abas: Vendas | Compras | Notas emitidas.

export type ItemPedido = { sku: string; nome: string; qtd: number; unit: number; total: number };

// maquina de estados da nota (F8.2): pendente -> transmitida -> autorizada
const ESTADOS_NOTA: Record<string, { label: string; bg: string; fg: string }> = {
  pendente: { label: "Pendente", bg: "#FEF3C7", fg: "#92400E" },
  transmitida: { label: "Transmitida", bg: "#DBEAFE", fg: "#1E40AF" },
  autorizada: { label: "Autorizada", bg: "#DCFCE7", fg: "#166534" },
  rejeitada: { label: "Rejeitada", bg: "#FEE2E2", fg: "#991B1B" },
  cancelada: { label: "Cancelada", bg: "#F3F4F6", fg: "#4B5563" },
  emitida: { label: "Emitida", bg: "#DCFCE7", fg: "#166534" },
};

export type PedidoVenda = {
  id: string;
  codigo: string;
  cliente: string;
  email: string;
  documento: string | null;
  canal: string;
  origem: string;
  etapa: string | null;
  cancelado: boolean;
  pedidoNumero: string | null;
  vendaNumero: string | null;
  status: string;
  data: string;
  total: number;
  itens: ItemPedido[];
  vendedorId: string | null;
};

// Vendas v5: funil (VD-02), expedicao (EN-*) e importacao da loja (secao 4)
export type FunilBucket = { qtd: number; total: number; ids: string[] };
export type DadoFunil = {
  pedidos: FunilBucket;
  afaturar: FunilBucket;
  emitidas: FunilBucket;
  rejeitadas: FunilBucket;
};

export type DadoEntrega = {
  id: string;
  orderId: string;
  codigo: string;
  cliente: string;
  status: string;
  transportadora: string | null;
  rastreio: string | null;
  prazo: string | null;
  atrasada: boolean;
  nota: number | null;
  ultimoEvento: { texto: string; em: string } | null;
  concluida: boolean;
  observacao: string | null;
};

export type PendenteLoja = {
  id: string;
  codigo: string;
  cliente: string;
  documento: string | null;
  uf: string | null;
  itens: number;
  pagamento: string | null;
};

type Aba = "vendas" | "expedicao" | "importar" | "compras" | "notas" | "vendedores";
type FiltroFunil = "todos" | "pedidos" | "afaturar" | "emitidas" | "rejeitadas";
type FiltroCanal = "todos" | "varejo" | "atacado" | "loja";
type FiltroExp = "expedir" | "caminho" | "problema" | "entregues";

type AcaoLinha = {
  label: string;
  aria: string;
  bg: string;
  fg: string;
  tipo: "converter" | "emitir" | "expedicao" | "notas";
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
  chave: string | null;
  protocolo: string | null;
  recibo: string | null;
  motivo: string | null;
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

export type ConsoleEmitente = {
  razao: string;
  fantasia?: string;
  cnpj: string;
  email?: string;
  endereco?: string;
};

const EMITENTE: ConsoleEmitente = {
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

const STATUS_ENTREGA: Record<string, { label: string; bg: string; fg: string }> = {
  aguardando: { label: "A separar", bg: "#FEF3C7", fg: "#92400E" },
  separado: { label: "Separado", bg: "#E0E7FF", fg: "#3730A3" },
  em_transito: { label: "Em trânsito", bg: "#DBEAFE", fg: "#1E40AF" },
  entregue: { label: "Entregue", bg: "#DCFCE7", fg: "#166534" },
  falhou: { label: "Ocorrência", bg: "#FEE2E2", fg: "#991B1B" },
  devolvido: { label: "Devolvido", bg: "#F3F4F6", fg: "#374151" },
};

const FILTROS_FUNIL = [
  { id: "pedidos", label: "Pedidos em aberto", bg: "#DBEAFE", fg: "#1E40AF" },
  { id: "afaturar", label: "Vendas a faturar", bg: "#FEF3C7", fg: "#92400E" },
  { id: "emitidas", label: "Notas emitidas", bg: "#DCFCE7", fg: "#166534" },
  { id: "rejeitadas", label: "Notas rejeitadas", bg: "#FEE2E2", fg: "#991B1B" },
] as const;

const CHIPS_CANAL = [
  { id: "todos", label: "Todos os canais" },
  { id: "varejo", label: "Varejo" },
  { id: "atacado", label: "Atacado" },
  { id: "loja", label: "Loja online" },
] as const;

const FILTROS_EXP = [
  { id: "expedir", label: "A expedir" },
  { id: "caminho", label: "A caminho" },
  { id: "problema", label: "Com problema" },
  { id: "entregues", label: "Entregues" },
] as const;

const TRANSPORTADORAS = ["Jadlog", "Correios PAC", "Correios SEDEX", "Loggi", "Transportadora própria", "Retirada na loja"];

const ETAPAS_NOMES = ["Pedido", "Venda", "Nota", "Entrega"];

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
  ieDest: string;
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
    ieDest: "",
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

// Etapa do documento em 4 pontos (spec 7.2): feitas em navy, atual em rosa,
// erro em vermelho "!", pendentes em cinza.
function EtapaPontos({
  atual,
  cancelado,
  rejeitada,
}: {
  atual: number;
  cancelado: boolean;
  rejeitada: boolean;
}) {
  const base: React.CSSProperties = {
    width: 20,
    height: 20,
    borderRadius: "50%",
    fontSize: 10.5,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
  };
  return (
    <span style={{ display: "inline-flex", gap: 5 }} aria-label="Etapa do documento">
      {ETAPAS_NOMES.map((nome, i) => {
        if (cancelado) {
          return (
            <span
              key={nome}
              title={`${nome}: —`}
              aria-label={`Etapa ${nome} inexistente`}
              style={{ ...base, background: "var(--border)", color: "var(--ink-soft)" }}
            >
              —
            </span>
          );
        }
        if (rejeitada && i === 2) {
          return (
            <span
              key={nome}
              title={`${nome}: rejeitada`}
              aria-label={`Etapa ${nome} com erro`}
              style={{ ...base, background: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}
            >
              !
            </span>
          );
        }
        if (i < atual) {
          return (
            <span
              key={nome}
              title={`${nome}: concluída`}
              aria-label={`Etapa ${nome} concluída`}
              style={{ ...base, background: "var(--navy)", color: "#FFF" }}
            >
              ✓
            </span>
          );
        }
        if (i === atual) {
          return (
            <span
              key={nome}
              title={`${nome}: atual`}
              aria-label={`Etapa ${nome} atual`}
              style={{ ...base, background: "var(--pink-600)", color: "#FFF" }}
            />
          );
        }
        return (
          <span
            key={nome}
            title={`${nome}: pendente`}
            aria-label={`Etapa ${nome} pendente`}
            style={{ ...base, background: "var(--bg-cloud)", color: "var(--ink-soft)", border: "1px solid var(--border)" }}
          >
            ·
          </span>
        );
      })}
    </span>
  );
}

export function ConsoleVendas({
  vendas,
  compras,
  notas,
  funil,
  expedicao,
  pendentes,
  emitente,
  vendedores,
  comissoes,
}: {
  vendas: PedidoVenda[];
  compras: PedidoCompra[];
  notas: NotaEmitida[];
  funil: DadoFunil;
  expedicao: DadoEntrega[];
  pendentes: PendenteLoja[];
  emitente?: ConsoleEmitente | null;
  vendedores: Vendedor[];
  comissoes: LinhaComissao[];
}) {
  const emitenteDoc: ConsoleEmitente = emitente ?? EMITENTE;
  const cnpjEmitente = emitenteDoc.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  const [aba, setAba] = useState<Aba>("vendas");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [emissao, setEmissao] = useState<{ tipo: "saida" | "entrada"; pedido: PedidoVenda | PedidoCompra } | null>(null);
  const [form, setForm] = useState<FormNfe | null>(null);
  const [doc, setDoc] = useState<NotaEmitida | null>(null);
  const [xmlPendente, setXmlPendente] = useState(false);
  const [xmlErro, setXmlErro] = useState<string | null>(null);

  // Bloco 5 passo 1 - aba "Vendedores": cadastro, comissao e vendedor do pedido
  const vazioVendedor = (): EntradaVendedor => ({
    nome: "",
    email: "",
    documento: "",
    telefone: "",
    commissionPct: 0,
    meta: 0,
    ativo: true,
  });
  const [formVend, setFormVend] = useState<EntradaVendedor>(vazioVendedor());
  const [trabalhando, startTrabalho] = useTransition();

  const salvarNovoVendedor = (e: React.FormEvent) => {
    e.preventDefault();
    if (trabalhando) return;
    const entrada = { ...formVend };
    startTrabalho(async () => {
      const r = await salvarVendedor(entrada);
      setAviso(r.ok ? { tipo: "ok", texto: r.msg } : { tipo: "erro", texto: r.erro });
      if (r.ok) setFormVend(vazioVendedor());
    });
  };

  const editarVendedor = (v: Vendedor) => {
    setFormVend({
      id: v.id,
      nome: v.nome,
      email: v.email,
      documento: v.documento,
      telefone: v.telefone,
      commissionPct: v.commissionPct,
      meta: v.meta,
      ativo: v.ativo,
    });
    setAviso(null);
  };

  const apagarVendedor = (v: Vendedor) => {
    if (!window.confirm(`Remover o vendedor ${v.nome}? O historico de vendas fica.`)) return;
    if (formVend.id === v.id) setFormVend(vazioVendedor());
    startTrabalho(async () => {
      const r = await removerVendedor(v.id);
      setAviso(r.ok ? { tipo: "ok", texto: r.msg } : { tipo: "erro", texto: r.erro });
    });
  };

  const trocarVendedorDoPedido = (pedidoId: string, valor: string) => {
    if (trabalhando) return;
    startTrabalho(async () => {
      const r = await definirVendedorPedido(pedidoId, valor || null);
      setAviso(r.ok ? { tipo: "ok", texto: r.msg } : { tipo: "erro", texto: r.erro });
    });
  };

  // Bloco 4 - download do XML autorizado. Busca sob demanda (o XML nao vai
  // dentro da listagem) e dispara o download pelo browser. Armazenado em Blob
  // + object URL para nao depender de rota publica.
  const baixarXml = async () => {
    if (!doc || xmlPendente) return;
    setXmlPendente(true);
    setXmlErro(null);
    try {
      const r = await buscarXmlNota(doc.id);
      if (!r.ok) {
        setXmlErro(r.erro);
        return;
      }
      const blob = new Blob([r.xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setXmlErro("Falha ao baixar o XML.");
    } finally {
      setXmlPendente(false);
    }
  };
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  // Vendas v5: funil/busca/canais (VD-02), expedicao (EN-*) e importar loja
  const [funilFiltro, setFunilFiltro] = useState<FiltroFunil>("todos");
  const [canalFiltro, setCanalFiltro] = useState<FiltroCanal>("todos");
  const [busca, setBusca] = useState("");
  const [filtroExp, setFiltroExp] = useState<FiltroExp | null>(null);
  const [entForm, setEntForm] = useState<Record<string, { transportadora: string; rastreio: string; prazo: string }>>({});
  const [ocorrId, setOcorrId] = useState<string | null>(null);
  const [ocorrTexto, setOcorrTexto] = useState("");
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});

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
        ie: form.ieDest.trim(),
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

  function transmitirNota(nota: NotaEmitida) {
    if (pendente) return;
    startTransition(async () => {
      const r: ResultadoNfe = await transmitirNfe(nota.id);
      setAviso({ tipo: r.ok ? "ok" : "erro", texto: r.ok ? r.msg : r.erro });
    });
  }

  function consultarNota(nota: NotaEmitida) {
    if (pendente) return;
    startTransition(async () => {
      const r: ResultadoNfe = await consultarNfe(nota.id);
      setAviso({ tipo: r.ok ? "ok" : "erro", texto: r.ok ? r.msg : r.erro });
    });
  }

  function toggleExpandir(id: string) {
    setExpandido((atual) => (atual === id ? null : id));
  }

  // ------------------------------------------------------------ v5: dados --
  const entregaPorPedido = useMemo(
    () => new Map(expedicao.map((e) => [e.orderId, e])),
    [expedicao]
  );

  const qtdExpedicao = useMemo(
    () =>
      expedicao.filter(
        (e) =>
          ["aguardando", "separado", "falhou"].includes(e.status) ||
          (e.atrasada && e.status !== "entregue")
      ).length,
    [expedicao]
  );

  const vendasFiltradas = useMemo(() => {
    let rows = vendas;
    if (funilFiltro !== "todos") {
      const ids = funil[funilFiltro].ids;
      rows = rows.filter((r) => ids.includes(r.id));
    }
    if (canalFiltro !== "todos") {
      rows = rows.filter((r) =>
        canalFiltro === "loja" ? r.origem === "loja" : r.canal === canalFiltro
      );
    }
    const termo = busca.trim().toLowerCase();
    if (termo) {
      rows = rows.filter((r) => {
        if (r.codigo.toLowerCase().includes(termo)) return true;
        if ((r.vendaNumero ?? "").toLowerCase().includes(termo)) return true;
        if ((r.pedidoNumero ?? "").toLowerCase().includes(termo)) return true;
        if (r.cliente.toLowerCase().includes(termo)) return true;
        if ((r.documento ?? "").includes(termo)) return true;
        return notas.some(
          (n) => n.vinculo === r.codigo && String(n.numero) === termo
        );
      });
    }
    return rows;
  }, [vendas, funil, funilFiltro, canalFiltro, busca, notas]);

  const listaExp = useMemo(() => {
    if (!filtroExp) return expedicao;
    return expedicao.filter((e) => {
      if (filtroExp === "expedir") return e.status === "aguardando" || e.status === "separado";
      if (filtroExp === "caminho") return e.status === "em_transito";
      if (filtroExp === "problema") {
        return e.status === "falhou" || e.status === "devolvido" || e.atrasada;
      }
      return e.status === "entregue";
    });
  }, [expedicao, filtroExp]);

  const retiradasNaLoja = useMemo(
    () => expedicao.filter((e) => e.transportadora === "Retirada na loja").length,
    [expedicao]
  );

  // ------------------------------------------------------------ v5: acoes --
  function mostrar(r: Resultado) {
    if (r.ok) setAviso({ tipo: "ok", texto: r.msg });
    else setAviso({ tipo: "erro", texto: r.erro });
  }

  function converter(p: PedidoVenda) {
    startTransition(async () => mostrar(await converterVenda(p.id)));
  }

  function cancelarLinha(p: PedidoVenda) {
    if (!window.confirm(`Cancelar o pedido ${p.codigo}?`)) return;
    startTransition(async () => mostrar(await cancelarPedido(p.id)));
  }

  function salvarEntrega(e: DadoEntrega) {
    const dados =
      entForm[e.id] ?? { transportadora: e.transportadora ?? "", rastreio: e.rastreio ?? "", prazo: e.prazo ?? "" };
    startTransition(async () => {
      const r = await atualizarEntrega(e.id, dados);
      setEntForm((atual) => {
        const copia = { ...atual };
        delete copia[e.id];
        return copia;
      });
      mostrar(r);
    });
  }

  function avancar(e: DadoEntrega) {
    startTransition(async () => mostrar(await avancarEntrega(e.id)));
  }

  function confirmarOcorrencia(e: DadoEntrega) {
    startTransition(async () => {
      const r = await registrarOcorrencia(e.id, ocorrTexto);
      if (r.ok) {
        setOcorrId(null);
        setOcorrTexto("");
      }
      mostrar(r);
    });
  }

  function importarMarcados() {
    const ids = pendentes.filter((p) => marcados[p.id] ?? true).map((p) => p.id);
    startTransition(async () => mostrar(await importarPedidosLoja(ids)));
  }

  function acaoPrincipal(p: PedidoVenda): AcaoLinha | null {
    if (p.cancelado) return null;
    // pedido: converter (VD-03); o cancelar fica num botao a parte
    if (p.etapa === "pedido") {
      return {
        label: "Converter em venda",
        aria: `Converter em venda ${p.codigo}`,
        bg: "var(--pink-600)",
        fg: "#FFF",
        tipo: "converter",
      };
    }
    const exp = entregaPorPedido.get(p.id);
    if (exp) {
      if (exp.status === "falhou" || (exp.atrasada && !exp.concluida)) {
        return {
          label: "Resolver entrega",
          aria: `Resolver entrega ${p.codigo}`,
          bg: "#DC2626",
          fg: "#fff",
          tipo: "expedicao",
        };
      }
      if (exp.status === "aguardando" || exp.status === "separado") {
        return {
          label: "Expedir",
          aria: `Expedir ${p.codigo}`,
          bg: "var(--pink-600)",
          fg: "#FFF",
          tipo: "expedicao",
        };
      }
      if (exp.status === "em_transito") {
        return {
          label: "Ver rastreio",
          aria: `Ver rastreio ${p.codigo}`,
          bg: "var(--bg-cloud)",
          fg: "var(--navy)",
          tipo: "expedicao",
        };
      }
      if (exp.status === "entregue") {
        return {
          label: "Ver nota",
          aria: `Ver nota ${p.codigo}`,
          bg: "var(--bg-cloud)",
          fg: "var(--navy)",
          tipo: "notas",
        };
      }
      return null; // devolvido: so historico
    }
    const notaRow = notas.find(
      (n) => n.tipo === "saida" && n.vinculo === p.codigo && n.status !== "cancelada"
    );
    if (notaRow && notaRow.status !== "rejeitada") {
      return {
        label: "Ver nota",
        aria: `Ver nota ${p.codigo}`,
        bg: "var(--bg-cloud)",
        fg: "var(--navy)",
        tipo: "notas",
      };
    }
    return {
      label: "Emitir NF-e",
      aria: `Emitir NF-e ${p.codigo}`,
      bg: "var(--pink-600)",
      fg: "#FFF",
      tipo: "emitir",
    };
  }

  function executarAcao(p: PedidoVenda) {
    const acao = acaoPrincipal(p);
    if (!acao) return;
    if (acao.tipo === "converter") return converter(p);
    if (acao.tipo === "emitir") return abrirEmissao("saida", p);
    setExpandido(null);
    setAba(acao.tipo === "notas" ? "notas" : "expedicao");
  }

  function notaDaLinha(p: PedidoVenda): NotaEmitida | null {
    return (
      notas.find(
        (n) => n.tipo === "saida" && n.vinculo === p.codigo && n.status !== "cancelada"
      ) ?? null
    );
  }

  function passoAtual(p: PedidoVenda, notaRow: NotaEmitida | null): number {
    if (p.etapa === "pedido") return 1;
    if (p.etapa !== "venda") return 0; // etapa nula = loja ainda nao importada
    const exp = entregaPorPedido.get(p.id);
    if (exp) return exp.concluida ? 4 : 3;
    if (notaRow?.status === "autorizada") return 3;
    return 2;
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

  const TABS: { id: Aba; label: string; qtd: number }[] = [
    { id: "vendas", label: "Vendas", qtd: vendas.length },
    { id: "expedicao", label: "Expedição", qtd: qtdExpedicao },
    { id: "importar", label: "Importar da loja", qtd: pendentes.length },
    { id: "compras", label: "Compras", qtd: compras.length },
    { id: "notas", label: "Notas emitidas", qtd: notas.length },
    { id: "vendedores", label: "Vendedores", qtd: vendedores.length },
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

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          type="button"
          aria-label="Importar da loja"
          onClick={() => {
            setAba("importar");
            setExpandido(null);
          }}
          style={{ ...BTN, background: "#FFF", color: "var(--navy)", border: "1.5px solid var(--border)" }}
        >
          Importar da loja
          {pendentes.length > 0 && (
            <span
              style={{
                marginLeft: 8,
                background: "var(--pink-600)",
                color: "#FFF",
                borderRadius: 999,
                padding: "1px 8px",
                fontSize: 11.5,
              }}
            >
              {pendentes.length}
            </span>
          )}
        </button>
        {/* TODO §7.3: "Nova venda ou pedido" quando o editor da venda existir */}
      </div>

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
        <div>
          {/* funil (VD-02): 4 cartoes clicaveis que filtram a lista */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 10,
              marginBottom: 14,
            }}
          >
            {FILTROS_FUNIL.map((b) => {
              const d = funil[b.id];
              const ativo = funilFiltro === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-label={`Filtro ${b.label}`}
                  onClick={() => setFunilFiltro(ativo ? "todos" : b.id)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 12,
                    cursor: "pointer",
                    background: ativo ? "var(--navy)" : "#FFF",
                    color: ativo ? "#FFF" : "var(--ink)",
                    border: `1.5px solid ${ativo ? "var(--navy)" : "var(--border)"}`,
                    boxShadow: "var(--shadow-card)",
                    fontFamily: "'Open Sans', sans-serif",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontSize: 11.5,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: ativo ? "#FFF" : b.fg,
                    }}
                  >
                    {b.label}
                  </span>
                  <span style={{ display: "block", fontSize: 21, fontWeight: 800, marginTop: 4 }}>{d.qtd}</span>
                  <span style={{ display: "block", fontSize: 12.5, opacity: 0.8 }}>{brl(d.total)}</span>
                </button>
              );
            })}
          </div>

          {/* busca + chips de canal (VD-02 / VL-05) */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <input
              aria-label="Buscar vendas"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por documento, cliente, CPF/CNPJ ou nota"
              style={{
                flex: "1 1 240px",
                minWidth: 220,
                padding: "8px 12px",
                borderRadius: 10,
                border: "1.5px solid var(--border)",
                fontSize: 13.5,
                fontFamily: "'Open Sans', sans-serif",
                color: "var(--ink)",
              }}
            />
            {CHIPS_CANAL.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={`Canal ${c.label}`}
                onClick={() => setCanalFiltro(c.id)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "'Open Sans', sans-serif",
                  border: `1.5px solid ${canalFiltro === c.id ? "var(--pink-600)" : "var(--border)"}`,
                  background: canalFiltro === c.id ? "var(--pink-600)" : "#FFF",
                  color: canalFiltro === c.id ? "#FFF" : "var(--ink-soft)",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          {funilFiltro !== "todos" && (
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 10px" }}>
              Filtrando por “{FILTROS_FUNIL.find((b) => b.id === funilFiltro)?.label}” — clique no cartão para limpar.
            </p>
          )}

          <div style={CARD}>
            {vendasFiltradas.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: 24, margin: 0 }}>
                {vendas.length === 0
                  ? "Nenhum pedido de venda registrado."
                  : "Nenhum documento corresponde aos filtros."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Documento</th>
                      <th style={th}>Cliente</th>
                      <th style={th}>Canal</th>
                      <th style={th}>Etapa</th>
                      <th style={th}>Status</th>
                      <th style={{ ...th, textAlign: "right" }}>Total</th>
                      <th style={th}>Nota / entrega</th>
                      <th style={{ ...th, textAlign: "right" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                  {vendasFiltradas.map((p) => {
                    const st = STATUS_VENDA[p.status] ?? { label: p.status, bg: "var(--bg-cloud)", fg: "var(--ink-soft)" };
                    const notaRow = notaDaLinha(p);
                    const exp = entregaPorPedido.get(p.id);
                    const acao = acaoPrincipal(p);
                    return (
                      <tr key={p.id} style={{ borderBottom: expandido === p.id ? "none" : undefined }}>
                        <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {p.codigo}
                          {(p.vendaNumero || p.pedidoNumero) && (
                            <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 600 }}>
                              {p.vendaNumero
                                ? `${p.vendaNumero}${p.pedidoNumero ? ` · de ${p.pedidoNumero}` : ""}`
                                : p.pedidoNumero}
                            </span>
                          )}
                          {p.cancelado && (
                            <span style={{ display: "inline-block", marginTop: 4 }}>
                              <Badge bg="#FEE2E2" fg="#991B1B">Cancelado</Badge>
                            </span>
                          )}
                        </td>
                        <td style={td}>
                          {p.cliente}
                          {p.email && (
                            <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-soft)" }}>{p.email}</span>
                          )}
                        </td>
                        <td style={{ ...td, textTransform: "capitalize" }}>
                          {p.origem === "loja" ? "Loja online" : p.canal}
                        </td>
                        <td style={td}>
                          <EtapaPontos
                            atual={passoAtual(p, notaRow)}
                            cancelado={p.cancelado}
                            rejeitada={notaRow?.status === "rejeitada"}
                          />
                        </td>
                        <td style={td}>
                          <Badge bg={st.bg} fg={st.fg}>{st.label}</Badge>
                        </td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{brl(p.total)}</td>
                        <td style={td}>
                          {notaRow ? (
                            (() => {
                              const s = ESTADOS_NOTA[notaRow.status] ?? ESTADOS_NOTA.pendente;
                              return (
                                <Badge bg={s.bg} fg={s.fg}>{s.label}</Badge>
                              );
                            })()
                          ) : exp ? (
                            exp.atrasada ? (
                              <Badge bg="#FEE2E2" fg="#991B1B">Atrasada</Badge>
                            ) : (() => {
                                const s = STATUS_ENTREGA[exp.status] ?? {
                                  label: exp.status,
                                  bg: "var(--bg-cloud)",
                                  fg: "var(--ink-soft)",
                                };
                                return <Badge bg={s.bg} fg={s.fg}>{s.label}</Badge>;
                              })()
                          ) : (
                            <span style={{ color: "var(--ink-soft)" }}>—</span>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => toggleExpandir(p.id)}
                            style={{ ...BTN, background: "var(--bg-cloud)", color: "var(--navy)", marginRight: 8 }}
                          >
                            {expandido === p.id ? "Ocultar" : "Itens"}
                          </button>
                          {p.etapa === "pedido" && !p.cancelado && (
                            <button
                              type="button"
                              aria-label={`Cancelar pedido ${p.codigo}`}
                              onClick={() => cancelarLinha(p)}
                              disabled={pendente}
                              style={{
                                ...BTN,
                                background: "transparent",
                                color: "#991B1B",
                                border: "1px solid #FECACA",
                                marginRight: 8,
                                opacity: pendente ? 0.6 : 1,
                              }}
                            >
                              Cancelar
                            </button>
                          )}
                          {acao && (
                            <button
                              type="button"
                              aria-label={acao.aria}
                              onClick={() => executarAcao(p)}
                              disabled={pendente}
                              style={{
                                ...BTN,
                                background: acao.bg,
                                color: acao.fg,
                                border: acao.bg === "var(--bg-cloud)" ? "1px solid var(--border)" : undefined,
                                opacity: pendente ? 0.6 : 1,
                              }}
                            >
                              {acao.label}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {vendasFiltradas.map((p) =>
                    expandido === p.id ? (
                      <tr key={`${p.id}-itens`}>
                        <td colSpan={8} style={{ ...td, background: "#FFF", borderBottom: "1px solid var(--border)" }}>
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

                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                              marginTop: 12,
                              paddingTop: 10,
                              borderTop: "1px dashed var(--border)",
                              flexWrap: "wrap",
                            }}
                          >
                            <label
                              htmlFor={`vend-${p.id}`}
                              style={{ fontSize: 12, fontWeight: 800, color: "var(--ink-soft)" }}
                            >
                              Vendedor
                            </label>
                            <select
                              id={`vend-${p.id}`}
                              aria-label={`Vendedor do pedido ${p.codigo}`}
                              value={p.vendedorId ?? ""}
                              disabled={trabalhando}
                              onChange={(e) => trocarVendedorDoPedido(p.id, e.target.value)}
                              style={{
                                fontSize: 13,
                                padding: "6px 10px",
                                borderRadius: 8,
                                border: "1px solid var(--border)",
                                background: "#FFF",
                                color: "var(--ink)",
                              }}
                            >
                              <option value="">Sem vendedor</option>
                              {vendedores.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.nome}
                                </option>
                              ))}
                            </select>
                            <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                              A venda fica na comissao do mes do vendedor.
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : null
                  )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {aba === "expedicao" && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              marginBottom: 14,
            }}
          >
            {FILTROS_EXP.map((f) => {
              const ativo = filtroExp === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-label={`Filtro ${f.label}`}
                  onClick={() => setFiltroExp(ativo ? null : f.id)}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    borderRadius: 12,
                    cursor: "pointer",
                    background: ativo ? "var(--navy)" : "#FFF",
                    color: ativo ? "#FFF" : "var(--ink)",
                    border: `1.5px solid ${ativo ? "var(--navy)" : "var(--border)"}`,
                    boxShadow: "var(--shadow-card)",
                    fontFamily: "'Open Sans', sans-serif",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div style={CARD}>
            {listaExp.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: 24, margin: 0 }}>
                Nenhuma entrega nesta fila.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Venda</th>
                      <th style={th}>Destinatário</th>
                      <th style={th}>Transportadora / código</th>
                      <th style={th}>Prazo</th>
                      <th style={th}>Situação</th>
                      <th style={{ ...th, textAlign: "right" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaExp.map((e) => {
                      const st =
                        STATUS_ENTREGA[e.status] ?? {
                          label: e.status,
                          bg: "var(--bg-cloud)",
                          fg: "var(--ink-soft)",
                        };
                      const form = entForm[e.id] ?? {
                        transportadora: e.transportadora ?? "",
                        rastreio: e.rastreio ?? "",
                        prazo: e.prazo ?? "",
                      };
                      const mudar = (
                        campo: "transportadora" | "rastreio" | "prazo",
                        valor: string
                      ) =>
                        setEntForm((atual) => ({
                          ...atual,
                          [e.id]: { ...form, [campo]: valor },
                        }));
                      return (
                        <Fragment key={e.id}>
                          <tr>
                            <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>
                              {e.codigo}
                              {e.nota && (
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: 11.5,
                                    color: "var(--ink-soft)",
                                    fontWeight: 600,
                                  }}
                                >
                                  NF-e {e.nota}
                                </span>
                              )}
                            </td>
                            <td style={td}>
                              {e.cliente}
                              {e.ultimoEvento && (
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: 11.5,
                                    color: "var(--ink-soft)",
                                  }}
                                >
                                  Último evento: {e.ultimoEvento.texto}
                                </span>
                              )}
                              {e.observacao && (
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: 11.5,
                                    color: "#991B1B",
                                  }}
                                >
                                  Ocorrência: {e.observacao}
                                </span>
                              )}
                            </td>
                            <td style={td}>
                              {e.concluida ? (
                                <span>
                                  {e.transportadora ?? "—"}
                                  {e.rastreio && (
                                    <span
                                      style={{
                                        display: "block",
                                        fontSize: 11.5,
                                        color: "var(--ink-soft)",
                                      }}
                                    >
                                      {e.rastreio}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                    minWidth: 190,
                                  }}
                                >
                                  <select
                                    aria-label={`Transportadora ${e.codigo}`}
                                    value={form.transportadora}
                                    onChange={(ev) => mudar("transportadora", ev.target.value)}
                                    style={{ ...INPUT, padding: "6px 8px", fontSize: 12.5 }}
                                  >
                                    <option value="">Sem transportadora</option>
                                    {TRANSPORTADORAS.map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                    {form.transportadora &&
                                      !TRANSPORTADORAS.includes(form.transportadora) && (
                                        <option value={form.transportadora}>
                                          {form.transportadora}
                                        </option>
                                      )}
                                  </select>
                                  <input
                                    aria-label={`Código de rastreio ${e.codigo}`}
                                    value={form.rastreio}
                                    onChange={(ev) => mudar("rastreio", ev.target.value)}
                                    placeholder={e.rastreio ? undefined : "Sem código de rastreio"}
                                    style={{ ...INPUT, padding: "6px 8px", fontSize: 12.5 }}
                                  />
                                </div>
                              )}
                            </td>
                            <td style={td}>
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 6,
                                  alignItems: "flex-start",
                                }}
                              >
                                <input
                                  type="date"
                                  aria-label={`Prazo ${e.codigo}`}
                                  value={form.prazo}
                                  disabled={e.concluida}
                                  onChange={(ev) => mudar("prazo", ev.target.value)}
                                  style={{ ...INPUT, width: 150, padding: "6px 8px", fontSize: 12.5 }}
                                />
                                {e.atrasada && <Badge bg="#FEE2E2" fg="#991B1B">Atrasada</Badge>}
                              </div>
                            </td>
                            <td style={td}>
                              <Badge bg={st.bg} fg={st.fg}>{st.label}</Badge>
                            </td>
                            <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                              {!e.concluida && (
                                <button
                                  type="button"
                                  aria-label={`Salvar entrega ${e.codigo}`}
                                  onClick={() => salvarEntrega(e)}
                                  disabled={pendente}
                                  style={{
                                    ...BTN,
                                    background: "var(--bg-cloud)",
                                    color: "var(--navy)",
                                    marginRight: 8,
                                    opacity: pendente ? 0.6 : 1,
                                  }}
                                >
                                  Salvar
                                </button>
                              )}
                              {e.status === "aguardando" && (
                                <button
                                  type="button"
                                  aria-label={`Marcar como separado ${e.codigo}`}
                                  onClick={() => avancar(e)}
                                  disabled={pendente}
                                  style={{
                                    ...BTN,
                                    background: "var(--navy)",
                                    color: "#FFF",
                                    marginRight: 8,
                                    opacity: pendente ? 0.6 : 1,
                                  }}
                                >
                                  Marcar separado
                                </button>
                              )}
                              {e.status === "separado" && (
                                <button
                                  type="button"
                                  aria-label={`Postar envio ${e.codigo}`}
                                  onClick={() => avancar(e)}
                                  disabled={pendente}
                                  style={{
                                    ...BTN,
                                    background: "var(--pink-600)",
                                    color: "#FFF",
                                    marginRight: 8,
                                    opacity: pendente ? 0.6 : 1,
                                  }}
                                >
                                  Postar envio
                                </button>
                              )}
                              {e.status === "em_transito" && (
                                <button
                                  type="button"
                                  aria-label={`Marcar como entregue ${e.codigo}`}
                                  onClick={() => avancar(e)}
                                  disabled={pendente}
                                  style={{
                                    ...BTN,
                                    background: "#166534",
                                    color: "#FFF",
                                    marginRight: 8,
                                    opacity: pendente ? 0.6 : 1,
                                  }}
                                >
                                  Entregue
                                </button>
                              )}
                              {e.status === "falhou" && (
                                <button
                                  type="button"
                                  aria-label={`Resolver entrega ${e.codigo}`}
                                  onClick={() => avancar(e)}
                                  disabled={pendente}
                                  style={{
                                    ...BTN,
                                    background: "#DC2626",
                                    color: "#FFF",
                                    marginRight: 8,
                                    opacity: pendente ? 0.6 : 1,
                                  }}
                                >
                                  Resolver
                                </button>
                              )}
                              {["aguardando", "separado", "em_transito"].includes(e.status) && (
                                <button
                                  type="button"
                                  aria-label={`Registrar ocorrência ${e.codigo}`}
                                  onClick={() => {
                                    setOcorrId(ocorrId === e.id ? null : e.id);
                                    setOcorrTexto("");
                                  }}
                                  style={{
                                    ...BTN,
                                    background: "transparent",
                                    color: "#991B1B",
                                    border: "1px solid #FECACA",
                                  }}
                                >
                                  Ocorrência
                                </button>
                              )}
                            </td>
                          </tr>
                          {ocorrId === e.id && (
                            <tr key={`${e.id}-ocorr`}>
                              <td colSpan={6} style={{ ...td, background: "#FFF" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                  }}
                                >
                                  <input
                                    aria-label={`Texto da ocorrência ${e.codigo}`}
                                    value={ocorrTexto}
                                    onChange={(ev) => setOcorrTexto(ev.target.value)}
                                    placeholder="Descreva a ocorrência (ex.: endereço incorreto)"
                                    style={{ ...INPUT, flex: "1 1 260px", width: "auto" }}
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Confirmar ocorrência ${e.codigo}`}
                                    onClick={() => confirmarOcorrencia(e)}
                                    disabled={pendente}
                                    style={{
                                      ...BTN,
                                      background: "#DC2626",
                                      color: "#FFF",
                                      opacity: pendente ? 0.6 : 1,
                                    }}
                                  >
                                    Confirmar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p
              style={{
                fontSize: 12.5,
                color: "var(--ink-soft)",
                padding: "12px 16px",
                margin: 0,
                background: "var(--bg-cloud)",
                borderTop: "1px solid var(--border)",
              }}
            >
              {retiradasNaLoja} venda(s) de balcão retiradas na loja não entram na fila de
              expedição.
            </p>
          </div>
        </div>
      )}

      {aba === "importar" && (
        <div style={CARD}>
          {pendentes.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: 24, margin: 0 }}>
              Nenhum pedido da loja pendente de importação.
            </p>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 76 }}>Importar</th>
                      <th style={th}>Nº loja</th>
                      <th style={th}>Cliente</th>
                      <th style={th}>CPF / CNPJ</th>
                      <th style={th}>UF</th>
                      <th style={th}>Itens</th>
                      <th style={th}>Pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendentes.map((p) => (
                      <tr key={p.id}>
                        <td style={td}>
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${p.codigo}`}
                            checked={marcados[p.id] ?? true}
                            onChange={() =>
                              setMarcados((m) => ({ ...m, [p.id]: !(m[p.id] ?? true) }))
                            }
                            style={{ width: 16, height: 16, cursor: "pointer" }}
                          />
                        </td>
                        <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {p.codigo}
                        </td>
                        <td style={td}>{p.cliente}</td>
                        <td style={td}>{p.documento ?? "—"}</td>
                        <td style={td}>{p.uf ?? "—"}</td>
                        <td style={td}>{p.itens > 0 ? `${p.itens} item(ns)` : "—"}</td>
                        <td style={{ ...td, textTransform: "capitalize" }}>
                          {p.pagamento ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  padding: 16,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <button
                  type="button"
                  aria-label="Importar pedidos"
                  onClick={importarMarcados}
                  disabled={pendente}
                  style={{
                    ...BTN,
                    background: "var(--pink-600)",
                    color: "#FFF",
                    opacity: pendente ? 0.6 : 1,
                  }}
                >
                  Importar{" "}
                  {pendentes.filter((p) => marcados[p.id] ?? true).length}{" "}
                  pedido{pendentes.filter((p) => marcados[p.id] ?? true).length === 1 ? "" : "s"}
                </button>
              </div>
            </>
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

      {/* -------------------------------------------- vendedores (Bloco 5) -- */}
      {aba === "vendedores" && (
        <div style={{ display: "grid", gap: 22 }}>
          <section style={CARD}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "var(--pink-600)",
                marginBottom: 4,
              }}
            >
              {formVend.id ? "Editando vendedor" : "Novo vendedor"}
            </div>
            <form onSubmit={salvarNovoVendedor} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Campo label="Nome" largura={220}>
                <input
                  value={formVend.nome}
                  onChange={(e) => setFormVend({ ...formVend, nome: e.target.value })}
                  placeholder="Nome do vendedor"
                  style={INPUT}
                />
              </Campo>
              <Campo label="E-mail" largura={220}>
                <input
                  type="email"
                  value={formVend.email ?? ""}
                  onChange={(e) => setFormVend({ ...formVend, email: e.target.value })}
                  placeholder="vendedor@..."
                  style={INPUT}
                />
              </Campo>
              <Campo label="CPF / CNPJ" largura={150}>
                <input
                  inputMode="numeric"
                  maxLength={14}
                  value={formVend.documento ?? ""}
                  onChange={(e) => setFormVend({ ...formVend, documento: e.target.value.replace(/\D/g, "") })}
                  placeholder="somente digitos"
                  style={INPUT}
                />
              </Campo>
              <Campo label="Telefone" largura={140}>
                <input
                  value={formVend.telefone ?? ""}
                  onChange={(e) => setFormVend({ ...formVend, telefone: e.target.value })}
                  style={INPUT}
                />
              </Campo>
              <Campo label="Comissao %" largura={110}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={formVend.commissionPct}
                  onChange={(e) => setFormVend({ ...formVend, commissionPct: Number(e.target.value) })}
                  style={INPUT}
                />
              </Campo>
              <Campo label="Meta (R$)" largura={130}>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={formVend.meta ?? 0}
                  onChange={(e) => setFormVend({ ...formVend, meta: Number(e.target.value) })}
                  style={INPUT}
                />
              </Campo>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, paddingBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={formVend.ativo !== false}
                  onChange={(e) => setFormVend({ ...formVend, ativo: e.target.checked })}
                />
                Ativo
              </label>
              <div style={{ display: "flex", gap: 8, paddingBottom: 4 }}>
                <button
                  type="submit"
                  disabled={trabalhando}
                  aria-label={formVend.id ? "Salvar vendedor" : "Criar vendedor"}
                  style={{ ...BTN, background: "var(--pink-600)", color: "#fff", opacity: trabalhando ? 0.6 : 1 }}
                >
                  {trabalhando ? "..." : formVend.id ? "Salvar" : "Criar"}
                </button>
                {formVend.id && (
                  <button
                    type="button"
                    onClick={() => setFormVend(vazioVendedor())}
                    aria-label="Cancelar edicao do vendedor"
                    style={{ ...BTN, background: "var(--bg-cloud)", color: "var(--navy)" }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10, marginBottom: 0 }}>
              A comissao e calculada sobre os pedidos <b>faturados</b> (mesma regra do diario) no mes em que o
              pedido foi criado. Quem registra o pagamento da comissao e o financeiro.
            </p>
          </section>

          <section style={CARD}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "var(--navy)",
                marginBottom: 10,
              }}
            >
              Vendedores ({vendedores.length})
            </div>
            {vendedores.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0, padding: "8px 0" }}>
                Nenhum vendedor cadastrado - comece pelo formulario acima.
              </p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Nome</th>
                    <th style={th}>Contato</th>
                    <th style={th}>CPF / CNPJ</th>
                    <th style={{ ...th, textAlign: "right" }}>Comissao</th>
                    <th style={{ ...th, textAlign: "right" }}>Meta</th>
                    <th style={th}>Situacao</th>
                    <th style={{ ...th, textAlign: "right" }}>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {vendedores.map((v) => (
                    <tr key={v.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ ...td, fontWeight: 700 }}>{v.nome}</td>
                      <td style={td}>
                        {v.email || "—"}
                        {v.telefone ? <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-soft)" }}>{v.telefone}</span> : null}
                      </td>
                      <td style={td}>{v.documento || "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{v.commissionPct}%</td>
                      <td style={{ ...td, textAlign: "right" }}>{brl(v.meta)}</td>
                      <td style={td}>
                        <Badge bg={v.ativo ? "#DCFCE7" : "#FEE2E2"} fg={v.ativo ? "#166534" : "#991B1B"}>
                          {v.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          aria-label={`Editar vendedor ${v.nome}`}
                          onClick={() => editarVendedor(v)}
                          style={{ ...BTN, background: "var(--bg-cloud)", color: "var(--navy)", marginRight: 8 }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          aria-label={`Remover vendedor ${v.nome}`}
                          onClick={() => apagarVendedor(v)}
                          style={{ ...BTN, background: "#FEE2E2", color: "#991B1B" }}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section style={CARD}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "var(--navy)",
                marginBottom: 10,
              }}
            >
              Comissao por mes
            </div>
            {comissoes.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0, padding: "8px 0" }}>
                Nada a comissionar ainda: atribua vendedor a um pedido e fature a venda.
              </p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Competencia</th>
                    <th style={th}>Vendedor</th>
                    <th style={{ ...th, textAlign: "right" }}>Pedidos</th>
                    <th style={{ ...th, textAlign: "right" }}>Base</th>
                    <th style={{ ...th, textAlign: "right" }}>%</th>
                    <th style={{ ...th, textAlign: "right" }}>Comissao</th>
                  </tr>
                </thead>
                <tbody>
                  {comissoes.map((c) => (
                    <tr key={`${c.sellerId}-${c.periodo}`} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>{c.periodo}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{c.vendedor}</td>
                      <td style={{ ...td, textAlign: "right" }}>{c.pedidos}</td>
                      <td style={{ ...td, textAlign: "right" }}>{brl(c.base)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{c.pct}%</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{brl(c.comissao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
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
                      {(() => {
                        const st = ESTADOS_NOTA[n.status] ?? ESTADOS_NOTA.cancelada;
                        return (
                          <Badge bg={st.bg} fg={st.fg}>
                            {st.label}
                          </Badge>
                        );
                      })()}
                    </td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        aria-label={`Ver documento NF-e ${n.numero}`}
                        onClick={() => {
                          setXmlErro(null);
                          setDoc(n);
                        }}
                        style={{ ...BTN, background: "var(--bg-cloud)", color: "var(--navy)", marginRight: 8 }}
                      >
                        Ver
                      </button>
                      {n.status === "pendente" && (
                        <button
                          type="button"
                          aria-label={`Transmitir NF-e ${n.numero}`}
                          onClick={() => transmitirNota(n)}
                          disabled={pendente}
                          style={{
                            ...BTN,
                            background: "#1E40AF",
                            color: "#fff",
                            marginRight: 8,
                            opacity: pendente ? 0.6 : 1,
                          }}
                        >
                          Transmitir
                        </button>
                      )}
                      {n.status === "transmitida" && (
                        <button
                          type="button"
                          aria-label={`Consultar NF-e ${n.numero}`}
                          onClick={() => consultarNota(n)}
                          disabled={pendente}
                          style={{
                            ...BTN,
                            background: "#1E40AF",
                            color: "#fff",
                            marginRight: 8,
                            opacity: pendente ? 0.6 : 1,
                          }}
                        >
                          Consultar
                        </button>
                      )}
                      {(n.status === "pendente" || n.status === "rejeitada" || n.status === "autorizada") && (
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
                <Campo label="IE do destinatário (opcional)" largura={180}>
                  <input value={form.ieDest} maxLength={14} onChange={(e) => setForm({ ...form, ieDest: e.target.value })} style={INPUT} placeholder="Contribuinte: informe a IE" />
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
          className="doc-print"
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
            className="doc-print-inner"
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
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: (ESTADOS_NOTA[doc.status] ?? ESTADOS_NOTA.cancelada).fg,
                    }}
                  >
                    ({(ESTADOS_NOTA[doc.status] ?? ESTADOS_NOTA.cancelada).label})
                  </span>
                </div>
                {doc.chave && (
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)", wordBreak: "break-all" }}>
                    Chave {doc.chave}
                    {doc.protocolo ? ` · Protocolo ${doc.protocolo}` : ""}
                    {doc.recibo ? ` · Recibo ${doc.recibo}` : ""}
                  </div>
                )}
                {doc.motivo && (
                  <div style={{ fontSize: 11.5, color: "#991B1B" }}>{doc.motivo}</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <BotaoImprimir rotulo="Imprimir / PDF" />
                <button
                  type="button"
                  data-no-print
                  aria-label="Baixar XML da nota"
                  disabled={xmlPendente}
                  onClick={() => void baixarXml()}
                  style={{ ...BTN, background: "var(--bg-cloud)", color: "var(--navy)", opacity: xmlPendente ? 0.6 : 1 }}
                >
                  {xmlPendente ? "…" : "Baixar XML"}
                </button>
                <button
                  type="button"
                  data-no-print
                  aria-label="Fechar documento"
                  onClick={() => setDoc(null)}
                  style={{ ...BTN, background: "var(--navy)", color: "#fff" }}
                >
                  Fechar
                </button>
              </div>
            </div>

            {xmlErro && (
              <div
                data-no-print
                style={{
                  margin: "10px 22px 0",
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: "#FEE2E2",
                  color: "#991B1B",
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                {xmlErro}
              </div>
            )}

            <div style={{ padding: "18px 22px 24px", fontSize: 13.5, color: "var(--ink)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6 }}>
                    Emitente
                  </div>
                  <strong>{emitenteDoc.razao}</strong>
                  <div style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>
                    {emitenteDoc.fantasia} · CNPJ {cnpjEmitente}
                  </div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>{emitenteDoc.endereco}</div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>{emitenteDoc.email}</div>
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
