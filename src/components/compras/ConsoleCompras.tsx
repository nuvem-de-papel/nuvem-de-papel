"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  aceitarDivergencia,
  atualizarTransporte,
  avancarTransporte,
  concluirRecebimento,
  criarEntradaDireta,
  criarFornecedor,
  criarPedidoCompra,
  consultarNotaEntrada,
  desconhecerNota,
  emitirNotaEntradaImportacao,
  enviarPedidoFornecedor,
  marcarParcelaPaga,
  recusarNota,
  salvarPedidoCompra,
  sincronizarNotasRecebidas,
  vincularNota,
} from "@/app/compras/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  compararNotaComPedido,
  CONDICOES_PAGAMENTO,
  ETAPAS_COMPRA,
  etapasCompra,
  estaAtrasada,
  proximoTransporte,
  resumoImportacao,
  resumoNacional,
  ROTULOS_TRANSPORTE,
  SEQUENCIAS_TRANSPORTE,
  type EstadoEtapa,
} from "@/lib/compras";

// ------------------------------------------------------------------- tipos --
export type Fornecedor = {
  id: string;
  nome: string;
  contato: string | null;
  cnpj: string | null;
  vinculado: boolean;
  ativo: boolean;
  uf?: string | null;
  pais?: string;
};

export type ItemPedido = {
  id: string;
  itemId: string;
  sku: string;
  nome: string;
  quantidade: number;
  custo: number;
  total: number;
  qtdRecebida: number;
};

export type NotaEntrada = {
  numero: string;
  serie: string;
  chave: string | null;
  cfop: string;
  status: string;
  tipo: string;
  divergencias: string[];
  aceita: string[] | null;
  emitidaEm: string | null;
  nfeRecebidaId: string | null;
};

export type TransportePedido = {
  status: string;
  transportadora: string | null;
  codigo: string | null;
  previsao: string | null;
  eventos?: { status: string; texto: string; local: string | null; em: string }[];
};

export type EnvioPedido = { para: string | null; em: string };

export type ImportacaoPedido = {
  moeda: string;
  cambio: number;
  di: string | null;
  freteInt: number;
  seguro: number;
  aliqIi: number;
  aliqIpi: number;
  aliqPis: number;
  aliqCofins: number;
  aliqIcms: number;
  despesas: number;
};

export type ParcelaCompra = {
  id: string;
  numero: number;
  status: string;
  vencimento: string;
  valor: number;
  pago: number;
};

export type PedidoCompra = {
  id: string;
  codigo: string;
  status: string;
  total: number;
  notas: string | null;
  criadoEm: string;
  fornecedor: string;
  fornecedorId: string;
  fornecedorCnpj: string | null;
  fornecedorUf: string | null;
  fornecedorPais: string;
  origem: "nacional" | "importacao";
  tipo: "pedido" | "entrada_direta";
  frete: number;
  desconto: number;
  condicao: string;
  conferidoEm: string | null;
  concluidaEm: string | null;
  canceladaEm: string | null;
  nota: NotaEntrada | null;
  transporte: TransportePedido | null;
  eventos: { status: string; texto: string; local: string | null; em: string }[];
  envios: EnvioPedido[];
  importacao: ImportacaoPedido | null;
  parcelas: ParcelaCompra[];
  itens: ItemPedido[];
};

export type NotaRecebida = {
  id: string;
  chave: string;
  numero: string;
  serie: string;
  emitenteCnpj: string;
  emitenteNome: string;
  emitenteUf: string | null;
  emitidaEm: string;
  valorTotal: number;
  manifestacao: string;
  compraId: string | null;
  codigoCompra: string | null;
  itens: { codigo?: string | null; descricao?: string | null; qtd?: number | null; custo?: number | null }[] | null;
};

export type ItemCatalogo = { id: string; sku: string; nome: string };

type Feedback = { tipo: "erro" | "aviso"; texto: string } | null;

type LinhaRapida = { itemId: string; qty: string; custo: string };

export type RascunhoEditor = {
  compraId: string | null;
  codigo: string | null;
  fornecedorId: string;
  origem: "nacional" | "importacao";
  linhas: LinhaRapida[];
  frete: string;
  desconto: string;
  condicao: string;
  obs: string;
  imp: {
    moeda: string;
    cambio: string;
    di: string;
    freteInt: string;
    seguro: string;
    aliqIi: string;
    aliqIpi: string;
    aliqPis: string;
    aliqCofins: string;
    aliqIcms: string;
    despesas: string;
  };
  transp: { transportadora: string; codigo: string; previsao: string };
  recebidos: Record<string, string>;
  buscaProduto: string;
};

// ------------------------------------------------------------------ estilos --
const INPUT: React.CSSProperties = {
  padding: "10px 12px",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "'Open Sans', sans-serif",
  background: "#FFFFFF",
  outline: "none",
};

const BTN: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 999,
  border: "none",
  background: "var(--pink-600)",
  color: "#FFFFFF",
  fontWeight: 700,
  fontSize: 13.5,
  cursor: "pointer",
  fontFamily: "'Open Sans', sans-serif",
};

const BTN_SEC: React.CSSProperties = {
  ...BTN,
  background: "#FFFFFF",
  color: "var(--ink)",
  border: "1.5px solid var(--border)",
};

const BTN_PERIGO: React.CSSProperties = { ...BTN, background: "#B42318" };

const CHIP: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 10px",
  borderRadius: "var(--radius-chip)",
  display: "inline-block",
  fontFamily: "'Open Sans', sans-serif",
};

const CARD: React.CSSProperties = {
  background: "var(--bg-cloud)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-card)",
  padding: 24,
  boxShadow: "var(--shadow-card)",
  marginBottom: 24,
};

const STATUS_STYLE: Record<string, { fundo: string; cor: string; rotulo: string }> = {
  aberto: { fundo: "var(--blue-100)", cor: "var(--blue-600)", rotulo: "Aberto" },
  parcial: { fundo: "#FEF3C7", cor: "#B45309", rotulo: "Parcial" },
  recebido: { fundo: "#DCFCE7", cor: "#166534", rotulo: "Recebido" },
  cancelado: { fundo: "var(--bg-cotton)", cor: "var(--ink-soft)", rotulo: "Cancelado" },
};

// cores de transporte (secao 8): cinza aguardando/producao, navy claro
// transito/porto, rosa claro desembaraco/liberado, navy solido saiu, verde chegou
const CORES_TRANSPORTE: Record<string, { fundo: string; cor: string }> = {
  aguardando: { fundo: "#F3F4F6", cor: "#6B7280" },
  producao: { fundo: "#F3F4F6", cor: "#6B7280" },
  transito: { fundo: "#DBEAFE", cor: "#1E3A8A" },
  transito_int: { fundo: "#DBEAFE", cor: "#1E3A8A" },
  porto: { fundo: "#DBEAFE", cor: "#1E3A8A" },
  embarcado: { fundo: "#DBEAFE", cor: "#1E3A8A" },
  desembaraco: { fundo: "#FCE7F3", cor: "#BE185D" },
  liberado: { fundo: "#FCE7F3", cor: "#BE185D" },
  saiu: { fundo: "#1E2A5A", cor: "#FFFFFF" },
  chegou: { fundo: "#DCFCE7", cor: "#166534" },
};

const CFOP_DESC: Record<string, string> = {
  "1102": "Compra para comercialização (SP)",
  "2102": "Compra para comercialização (outro UF)",
  "3102": "Compra para comercialização (importação)",
};

const MANIFESTACAO_ROTULO: Record<string, string> = {
  pendente: "Pendente",
  ciencia: "Ciência da operação",
  confirmada: "Confirmada",
  desconhecida: "Desconhecida",
  nao_realizada: "Operação não realizada",
};

const FUNIL = [
  { id: "nota", label: "Aguardando nota" },
  { id: "caminho", label: "A caminho" },
  { id: "conferir", label: "A conferir" },
  { id: "problema", label: "Com problema" },
  { id: "pagar", label: "A pagar" },
] as const;

type IdFunil = (typeof FUNIL)[number]["id"];

const ORIGENS = [
  { id: "todas", label: "Todas as origens" },
  { id: "nacional", label: "Nacional" },
  { id: "importacao", label: "Importação" },
] as const;

const TABS = [
  { id: "compras", label: "Compras" },
  { id: "recebimento", label: "Recebimento" },
  { id: "notas", label: "Notas recebidas" },
] as const;

type IdAba = (typeof TABS)[number]["id"];

// ------------------------------------------------------------------ helpers --
function brl(v: number): string {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function digitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function cnpjCompativel(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = digitos(a);
  const db = digitos(b);
  return da.length === 14 && db.length === 14 && da === db;
}

function atrasada(p: PedidoCompra): boolean {
  return estaAtrasada({
    previsao: p.transporte?.previsao ?? null,
    statusTransporte: p.transporte?.status ?? null,
    conferidoEm: p.conferidoEm,
  });
}

function parcelasAbertas(p: PedidoCompra): ParcelaCompra[] {
  return p.parcelas.filter((x) => x.status !== "liquidado" && x.status !== "cancelado");
}

function totalAberto(p: PedidoCompra): number {
  return parcelasAbertas(p).reduce((s, x) => s + (Number(x.valor) - Number(x.pago)), 0);
}

function quitado(p: PedidoCompra): boolean {
  return p.parcelas.length > 0 && p.parcelas.every((x) => x.status === "liquidado");
}

// funil exclusivo: problema > conferir > caminho > pagar > nota
function categoriaFunil(p: PedidoCompra): IdFunil | null {
  if (p.canceladaEm) return null;
  const st = p.transporte?.status ?? "aguardando";
  if (p.nota?.status === "divergente" || p.nota?.status === "rejeitada" || atrasada(p)) {
    return "problema";
  }
  if (st === "chegou" && !p.conferidoEm) return "conferir";
  if (st !== "aguardando" && st !== "chegou" && !p.conferidoEm) return "caminho";
  if (parcelasAbertas(p).length > 0) return "pagar";
  if (!p.nota) return "nota";
  return null;
}

function estadosDe(p: PedidoCompra): EstadoEtapa[] {
  return etapasCompra({
    temNota: !!p.nota,
    notaStatus: p.nota?.status ?? null,
    conferido: !!p.conferidoEm,
    atrasada: atrasada(p),
    temParcelas: p.parcelas.length > 0,
    quitado: quitado(p),
  });
}

function Etapas({ estados }: { estados: EstadoEtapa[] }) {
  return (
    <span style={{ display: "inline-flex", gap: 5 }} aria-label="Etapas da compra">
      {ETAPAS_COMPRA.map((nome, i) => {
        const e = estados[i] ?? "pendente";
        const cor =
          e === "feita"
            ? "#1E7F4F"
            : e === "erro"
              ? "#B42318"
              : e === "atual"
                ? "var(--pink-600)"
                : "#D1D5DB";
        return (
          <span
            key={nome}
            title={nome}
            aria-label={`Etapa ${nome}: ${e}`}
            style={{
              width: 11,
              height: 11,
              borderRadius: 999,
              background: cor,
              display: "inline-block",
            }}
          />
        );
      })}
    </span>
  );
}

function ChipTransporte({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const c = CORES_TRANSPORTE[status] ?? { fundo: "#F3F4F6", cor: "#6B7280" };
  return (
    <span style={{ ...CHIP, background: c.fundo, color: c.cor }}>
      {ROTULOS_TRANSPORTE[status] ?? status}
    </span>
  );
}

// ------------------------------------------------------------------- ações --
type AcaoLinha = { rotulo: string; estilo: React.CSSProperties; rodar: () => void };

export function ConsoleCompras({
  fornecedores,
  pedidos,
  catalogo,
  notas,
}: {
  fornecedores: Fornecedor[];
  pedidos: PedidoCompra[];
  catalogo: ItemCatalogo[];
  notas: NotaRecebida[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  // formulários rápidos legados (contrato f6)
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [cnpjF, setCnpjF] = useState("");
  const [emailUsuario, setEmailUsuario] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [obsRapida, setObsRapida] = useState("");
  const [linhas, setLinhas] = useState<LinhaRapida[]>([{ itemId: "", qty: "1", custo: "" }]);

  // navegação
  const [aba, setAba] = useState<IdAba>("compras");
  const [funilFiltro, setFunilFiltro] = useState<IdFunil | "todos">("todos");
  const [origemFiltro, setOrigemFiltro] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [filtroNotas, setFiltroNotas] = useState<"tratar" | "tratadas" | "todas">("tratar");
  const [filtroReceb, setFiltroReceb] = useState<
    "todos" | "nacional" | "importacao" | "atrasadas" | "conferir"
  >("todos");
  const [editor, setEditor] = useState<RascunhoEditor | null>(null);

  function executar<R extends { ok: boolean; erro?: string; aviso?: string }>(
    acao: () => Promise<R>
  ): Promise<(R & { ok: true }) | null> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const r = await acao();
        if (r.ok) {
          setFeedback(r.aviso ? { tipo: "aviso", texto: r.aviso } : null);
          router.refresh();
          resolve(r as R & { ok: true });
        } else {
          setFeedback({ tipo: "erro", texto: r.erro ?? "Falha na ação." });
          resolve(null);
        }
      });
    });
  }

  // ------------------------------------------------------ formulários f6 ----
  async function handleFornecedor(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const ok = await executar(() =>
      criarFornecedor({ nome, emailContato: contato, cnpj: cnpjF, emailUsuario })
    );
    if (ok) {
      setNome("");
      setContato("");
      setCnpjF("");
      setEmailUsuario("");
    }
  }

  async function handlePedidoRapido(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const itens = linhas
      .filter((l) => l.itemId)
      .map((l) => ({ itemId: l.itemId, qty: Number(l.qty), custo: Number(l.custo) }));
    if (!supplierId) {
      setFeedback({ tipo: "erro", texto: "Selecione o fornecedor." });
      return;
    }
    if (itens.length === 0) {
      setFeedback({ tipo: "erro", texto: "Adicione ao menos um item ao pedido." });
      return;
    }
    const ok = await executar(() => criarPedidoCompra({ supplierId, itens, notes: obsRapida }));
    if (ok) {
      setSupplierId("");
      setObsRapida("");
      setLinhas([{ itemId: "", qty: "1", custo: "" }]);
    }
  }

  // ------------------------------------------------------------- derivados --
  const contagemFunil = ((): Record<IdFunil, { qtd: number; ids: Set<string> }> => {
    const base = {
      nota: { qtd: 0, ids: new Set<string>() },
      caminho: { qtd: 0, ids: new Set<string>() },
      conferir: { qtd: 0, ids: new Set<string>() },
      problema: { qtd: 0, ids: new Set<string>() },
      pagar: { qtd: 0, ids: new Set<string>() },
    };
    for (const p of pedidos) {
      const c = categoriaFunil(p);
      if (c) {
        base[c].qtd += 1;
        base[c].ids.add(p.id);
      }
    }
    return base;
  })();

  const totalAPagar = pedidos.reduce((s, p) => s + totalAberto(p), 0);

  const chegaramNaoConferidos = pedidos.filter(
    (p) => p.transporte?.status === "chegou" && !p.conferidoEm && !p.canceladaEm
  );
  const atrasadas = pedidos.filter((p) => atrasada(p));
  const notasATratar = notas.filter((n) => !n.compraId);

  const pedidosFiltrados = pedidos.filter((p) => {
    if (funilFiltro !== "todos" && !contagemFunil[funilFiltro].ids.has(p.id)) return false;
    if (origemFiltro !== "todas" && p.origem !== origemFiltro) return false;
    if (busca.trim()) {
      const b = busca.trim().toLowerCase();
      const alvo = `${p.codigo} ${p.fornecedor} ${digitos(p.fornecedorCnpj)} ${
        p.nota?.numero ?? ""
      } ${p.transporte?.codigo ?? ""}`.toLowerCase();
      if (!alvo.includes(b) && !digitos(p.fornecedorCnpj).includes(digitos(busca))) return false;
    }
    return true;
  });

  const recebimentoFiltrado = pedidos.filter((p) => {
    if (p.canceladaEm || p.conferidoEm) return false;
    const st = p.transporte?.status ?? "aguardando";
    if (filtroReceb === "nacional") return p.origem === "nacional" && st !== "chegou";
    if (filtroReceb === "importacao") return p.origem === "importacao" && st !== "chegou";
    if (filtroReceb === "atrasadas") return atrasada(p);
    if (filtroReceb === "conferir") return st === "chegou";
    return true;
  });

  const notasFiltradas = notas.filter((n) => {
    if (filtroNotas === "tratar") return !n.compraId;
    if (filtroNotas === "tratadas") return !!n.compraId;
    return true;
  });

  // ------------------------------------------------------------- editor -----
  function abrirNovo() {
    setEditor({
      compraId: null,
      codigo: null,
      fornecedorId: "",
      origem: "nacional",
      linhas: [{ itemId: "", qty: "1", custo: "" }],
      frete: "0",
      desconto: "0",
      condicao: "28 dias",
      obs: "",
      imp: {
        moeda: "USD",
        cambio: "",
        di: "",
        freteInt: "0",
        seguro: "0",
        aliqIi: "0",
        aliqIpi: "0",
        aliqPis: "2.10",
        aliqCofins: "9.65",
        aliqIcms: "0",
        despesas: "0",
      },
      transp: { transportadora: "", codigo: "", previsao: "" },
      recebidos: {},
      buscaProduto: "",
    });
  }

  function abrirEdicao(p: PedidoCompra) {
    setEditor({
      compraId: p.id,
      codigo: p.codigo,
      fornecedorId: p.fornecedorId,
      origem: p.origem,
      linhas: p.itens.map((i) => ({
        itemId: i.itemId,
        qty: String(i.quantidade),
        custo: String(i.custo),
      })),
      frete: String(p.frete ?? 0),
      desconto: String(p.desconto ?? 0),
      condicao: p.condicao || "28 dias",
      obs: p.notas ?? "",
      imp: {
        moeda: p.importacao?.moeda ?? "USD",
        cambio: p.importacao ? String(p.importacao.cambio) : "",
        di: p.importacao?.di ?? "",
        freteInt: p.importacao ? String(p.importacao.freteInt) : "0",
        seguro: p.importacao ? String(p.importacao.seguro) : "0",
        aliqIi: p.importacao ? String(p.importacao.aliqIi) : "0",
        aliqIpi: p.importacao ? String(p.importacao.aliqIpi) : "0",
        aliqPis: p.importacao ? String(p.importacao.aliqPis) : "2.10",
        aliqCofins: p.importacao ? String(p.importacao.aliqCofins) : "9.65",
        aliqIcms: p.importacao ? String(p.importacao.aliqIcms) : "0",
        despesas: p.importacao ? String(p.importacao.despesas) : "0",
      },
      transp: {
        transportadora: p.transporte?.transportadora ?? "",
        codigo: p.transporte?.codigo ?? "",
        previsao: p.transporte?.previsao ?? "",
      },
      recebidos: {},
      buscaProduto: "",
    });
  }

  async function salvarEditor() {
    if (!editor) return;
    setFeedback(null);
    const itens = editor.linhas
      .filter((l) => l.itemId)
      .map((l) => ({ itemId: l.itemId, qty: Number(l.qty), custo: Number(l.custo) }));
    if (!editor.fornecedorId) {
      setFeedback({ tipo: "erro", texto: "Selecione o fornecedor." });
      return;
    }
    if (itens.length === 0) {
      setFeedback({ tipo: "erro", texto: "Adicione ao menos um produto." });
      return;
    }
    const r = await executar(() =>
      salvarPedidoCompra({
        compraId: editor.compraId,
        fornecedorId: editor.fornecedorId,
        origem: editor.origem,
        itens,
        frete: Number(editor.frete || 0),
        desconto: Number(editor.desconto || 0),
        condicao: editor.condicao,
        notas: editor.obs,
        importacao:
          editor.origem === "importacao"
            ? {
                moeda: editor.imp.moeda,
                cambio: Number(editor.imp.cambio || 0),
                di: editor.imp.di,
                freteInt: Number(editor.imp.freteInt || 0),
                seguro: Number(editor.imp.seguro || 0),
                aliqIi: Number(editor.imp.aliqIi || 0),
                aliqIpi: Number(editor.imp.aliqIpi || 0),
                aliqPis: Number(editor.imp.aliqPis || 0),
                aliqCofins: Number(editor.imp.aliqCofins || 0),
                aliqIcms: Number(editor.imp.aliqIcms || 0),
                despesas: Number(editor.imp.despesas || 0),
              }
            : undefined,
      })
    );
    if (r) {
      setEditor((e) =>
        e
          ? {
              ...e,
              compraId: r.compraId ?? e.compraId,
              codigo: r.codigo ?? e.codigo,
            }
          : e
      );
    }
  }

  function acaoContextual(p: PedidoCompra): AcaoLinha {
    const st = p.transporte?.status ?? "aguardando";
    const atrasou = atrasada(p);
    if (p.nota?.status === "divergente" || p.nota?.status === "rejeitada") {
      return {
        rotulo: "Resolver divergência",
        estilo: BTN_PERIGO,
        rodar: () => abrirEdicao(p),
      };
    }
    if (st === "chegou" && !p.conferidoEm) {
      return { rotulo: "Conferir mercadoria", estilo: BTN, rodar: () => abrirEdicao(p) };
    }
    if (
      p.origem === "importacao" &&
      !p.nota &&
      ["desembaraco", "liberado", "transito", "chegou"].includes(st)
    ) {
      return {
        rotulo: "Emitir NF de entrada",
        estilo: BTN,
        rodar: () => executar(() => emitirNotaEntradaImportacao(p.id)),
      };
    }
    if (p.origem === "nacional" && !p.nota) {
      return {
        rotulo: "Vincular nota",
        estilo: atrasou ? BTN_PERIGO : BTN,
        rodar: () => setAba("notas"),
      };
    }
    if (st !== "chegou" && st !== "aguardando") {
      return {
        rotulo: "Ver rastreio",
        estilo: atrasou ? BTN_PERIGO : BTN_SEC,
        rodar: () => abrirEdicao(p),
      };
    }
    if (parcelasAbertas(p).length > 0) {
      return { rotulo: "Ver pagamentos", estilo: BTN_SEC, rodar: () => abrirEdicao(p) };
    }
    return { rotulo: "Ver compra", estilo: BTN_SEC, rodar: () => abrirEdicao(p) };
  }

  // -------------------------------------------------------------- render ----
  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 32px 72px" }}>
      <PageHeader
        titulo="Compras"
        subtitulo="pedidos, notas de entrada, recebimento e pagamento"
        voltarPara="/crm"
      />

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          style={{
            background: feedback.tipo === "erro" ? "#FDECEC" : "var(--blue-100)",
            color: feedback.tipo === "erro" ? "#C62828" : "var(--blue-600)",
            fontSize: 13.5,
            fontWeight: 600,
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          {feedback.texto}
        </p>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginBottom: 16 }}>
        <button
          type="button"
          aria-label="Notas recebidas"
          onClick={() => setAba("notas")}
          style={BTN_SEC}
        >
          Notas recebidas
          {notasATratar.length > 0 && (
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
              {notasATratar.length}
            </span>
          )}
        </button>
        <button type="button" aria-label="Novo pedido de compra" onClick={abrirNovo} style={BTN}>
          Novo pedido de compra
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={`Aba ${t.label}`}
            onClick={() => setAba(t.id)}
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
            <span style={{ opacity: 0.8, fontWeight: 600 }}>
              {" "}
              ({t.id === "compras"
                ? pedidos.length
                : t.id === "recebimento"
                  ? chegaramNaoConferidos.length + atrasadas.length
                  : notasATratar.length}
              )
            </span>
          </button>
        ))}
      </div>

      {aba === "compras" && (
        <div>
          {/* funil: 5 cartões exclusivos que filtram a lista */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 10,
              marginBottom: 14,
            }}
          >
            {FUNIL.map((b) => {
              const ativo = funilFiltro === b.id;
              const qtd = contagemFunil[b.id].qtd;
              const ehPagar = b.id === "pagar";
              const ehProblema = b.id === "problema";
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
                    background: ativo
                      ? ehProblema
                        ? "#B42318"
                        : "var(--navy)"
                      : ehProblema && qtd > 0
                        ? "#FDECEC"
                        : "#FFF",
                    color: ativo ? "#FFF" : "var(--ink)",
                    border: `1.5px solid ${
                      ativo
                        ? ehProblema
                          ? "#B42318"
                          : "var(--navy)"
                        : ehProblema && qtd > 0
                          ? "#B42318"
                          : "var(--border)"
                    }`,
                    boxShadow: "var(--shadow-card)",
                    fontFamily: "'Open Sans', sans-serif",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{b.label}</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: ativo ? "#FFF" : ehProblema && qtd > 0 ? "#B42318" : "var(--navy)",
                    }}
                  >
                    {ehPagar ? brl(totalAPagar) : qtd}
                  </div>
                </button>
              );
            })}
          </div>

          {/* busca + chips de origem */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <input
              type="search"
              placeholder="Buscar por número, nota, fornecedor, CNPJ ou rastreio"
              aria-label="Buscar compras"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ ...INPUT, flex: "2 1 280px" }}
            />
            {ORIGENS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-label={`Origem ${o.label}`}
                onClick={() => setOrigemFiltro(o.id)}
                style={{
                  ...BTN_SEC,
                  background: origemFiltro === o.id ? "var(--navy)" : "#FFF",
                  color: origemFiltro === o.id ? "#FFF" : "var(--ink)",
                  borderColor: origemFiltro === o.id ? "var(--navy)" : "var(--border)",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* tabela de pedidos */}
          <div style={CARD}>
            <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>
              Pedidos ({pedidosFiltrados.length})
            </h2>
            {pedidosFiltrados.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
                Nenhum pedido de compra ainda.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["Pedido", "Fornecedor", "Origem", "Etapa", "Custo total", "Nota / transporte", "Ação"].map(
                        (h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: h === "Custo total" ? "right" : "left",
                              padding: "8px 10px",
                              fontSize: 11.5,
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                              color: "var(--ink-soft)",
                              borderBottom: "1.5px solid var(--border)",
                            }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pedidosFiltrados.map((p) => {
                      const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.aberto;
                      const a = acaoContextual(p);
                      const atrasou = atrasada(p);
                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                            <div style={{ fontWeight: 700, color: "var(--ink)" }}>{p.codigo}</div>
                            <span style={{ ...CHIP, background: st.fundo, color: st.cor }}>
                              {st.rotulo}
                            </span>
                          </td>
                          <td style={{ padding: "10px" }}>
                            <div style={{ color: "var(--ink)" }}>{p.fornecedor}</div>
                            <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                              {digitos(p.fornecedorCnpj).length === 14
                                ? `${p.fornecedorCnpj} · `
                                : ""}
                              {p.fornecedorPais || "Brasil"}
                            </div>
                          </td>
                          <td style={{ padding: "10px" }}>
                            <span
                              style={{
                                ...CHIP,
                                background: p.origem === "importacao" ? "var(--navy)" : "var(--blue-100)",
                                color: p.origem === "importacao" ? "#FFF" : "var(--blue-600)",
                              }}
                            >
                              {p.origem === "importacao" ? "Importação" : "Nacional"}
                            </span>
                          </td>
                          <td style={{ padding: "10px" }}>
                            <Etapas estados={estadosDe(p)} />
                          </td>
                          <td
                            style={{
                              padding: "10px",
                              textAlign: "right",
                              whiteSpace: "nowrap",
                              fontWeight: 700,
                              color: "var(--ink)",
                            }}
                          >
                            {brl(p.total)}
                          </td>
                          <td style={{ padding: "10px" }}>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              {p.nota ? (
                                <span
                                  style={{
                                    ...CHIP,
                                    background:
                                      p.nota.status === "divergente" ? "#FDECEC" : "#DCFCE7",
                                    color: p.nota.status === "divergente" ? "#B42318" : "#166534",
                                  }}
                                >
                                  NF {p.nota.numero}
                                </span>
                              ) : (
                                <span style={{ ...CHIP, background: "#F3F4F6", color: "#6B7280" }}>
                                  Sem nota
                                </span>
                              )}
                              <ChipTransporte status={p.transporte?.status} />
                              {atrasou && (
                                <span style={{ ...CHIP, background: "#FDECEC", color: "#B42318" }}>
                                  Atrasada
                                </span>
                              )}
                            </div>
                            {p.transporte?.codigo && (
                              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                                {p.transporte.transportadora ?? ""} {p.transporte.codigo}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                              <button type="button" onClick={a.rodar} style={a.estilo}>
                                {a.rotulo}
                              </button>
                              <button
                                type="button"
                                aria-label={`Abrir PDF do pedido ${p.codigo}`}
                                title="Abrir em A4 para imprimir ou salvar em PDF"
                                onClick={() => window.open(`/compras/pedido/${p.id}`, "_blank")}
                                style={{ ...CHIP, border: "1px solid var(--border)", cursor: "pointer" }}
                              >
                                PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* formulários rápidos legados (contrato f6) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
            <div style={CARD}>
              <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>
                Novo fornecedor
              </h2>
              <form onSubmit={handleFornecedor} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <input
                  type="text"
                  required
                  placeholder="Nome do fornecedor"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  style={{ ...INPUT, flex: "1 1 100%" }}
                />
                <input
                  type="email"
                  placeholder="E-mail de contato"
                  value={contato}
                  onChange={(e) => setContato(e.target.value)}
                  style={{ ...INPUT, flex: "1 1 180px" }}
                />
                <input
                  type="text"
                  placeholder="CNPJ"
                  value={cnpjF}
                  onChange={(e) => setCnpjF(e.target.value)}
                  style={{ ...INPUT, flex: "1 1 140px" }}
                />
                <input
                  type="email"
                  placeholder="E-mail do usuário fornecedor (opcional)"
                  value={emailUsuario}
                  onChange={(e) => setEmailUsuario(e.target.value)}
                  style={{ ...INPUT, flex: "1 1 100%" }}
                />
                <button type="submit" disabled={pendente} style={{ ...BTN, opacity: pendente ? 0.7 : 1 }}>
                  {pendente ? "Salvando…" : "Criar fornecedor"}
                </button>
              </form>
            </div>

            <div style={CARD}>
              <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>
                Novo pedido de compra
              </h2>
              <form onSubmit={handlePedidoRapido} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <select
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  style={INPUT}
                  aria-label="Fornecedor do pedido"
                >
                  <option value="">Fornecedor…</option>
                  {fornecedores
                    .filter((f) => f.ativo)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                        {f.vinculado ? "" : " (sem usuário)"}
                      </option>
                    ))}
                </select>

                {linhas.map((linha, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select
                      value={linha.itemId}
                      onChange={(e) =>
                        setLinhas((ls) =>
                          ls.map((l, i) => (i === idx ? { ...l, itemId: e.target.value } : l))
                        )
                      }
                      style={{ ...INPUT, flex: "2 1 200px" }}
                      aria-label={`Item ${idx + 1}`}
                    >
                      <option value="">Item…</option>
                      {catalogo.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.sku} — {c.nome}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      placeholder="Qtd"
                      value={linha.qty}
                      onChange={(e) =>
                        setLinhas((ls) =>
                          ls.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l))
                        )
                      }
                      style={{ ...INPUT, flex: "0 1 90px" }}
                      aria-label={`Quantidade ${idx + 1}`}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Custo unit."
                      value={linha.custo}
                      onChange={(e) =>
                        setLinhas((ls) =>
                          ls.map((l, i) => (i === idx ? { ...l, custo: e.target.value } : l))
                        )
                      }
                      style={{ ...INPUT, flex: "1 1 120px" }}
                      aria-label={`Custo unitário ${idx + 1}`}
                    />
                    {linhas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLinhas((ls) => ls.filter((_, i) => i !== idx))}
                        style={{ ...BTN, background: "var(--ink-soft)", padding: "10px 14px" }}
                        aria-label={`Remover item ${idx + 1}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setLinhas((ls) => [...ls, { itemId: "", qty: "1", custo: "" }])}
                    style={{ ...BTN, background: "var(--blue-600)" }}
                  >
                    + Item
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Observações (opcional)"
                  value={obsRapida}
                  onChange={(e) => setObsRapida(e.target.value)}
                  style={INPUT}
                />

                <button type="submit" disabled={pendente} style={{ ...BTN, opacity: pendente ? 0.7 : 1 }}>
                  {pendente ? "Criando…" : "Criar pedido de compra"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {aba === "recebimento" && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
              marginBottom: 14,
            }}
          >
            {(
              [
                { id: "nacional", label: "A caminho (nacional)" },
                { id: "importacao", label: "Importação" },
                { id: "atrasadas", label: "Atrasadas" },
                { id: "conferir", label: "A conferir" },
              ] as const
            ).map((c) => {
              const ativo = filtroReceb === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`Recebimento ${c.label}`}
                  onClick={() => setFiltroReceb(ativo ? "todos" : c.id)}
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
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{c.label}</div>
                </button>
              );
            })}
          </div>

          <div style={CARD}>
            <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>
              Recebimento ({recebimentoFiltrado.length})
            </h2>
            {recebimentoFiltrado.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
                Nenhuma mercadoria em recebimento.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["Pedido", "Fornecedor", "Transporte / código", "Previsão", "Situação", "Ação"].map(
                        (h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              padding: "8px 10px",
                              fontSize: 11.5,
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                              color: "var(--ink-soft)",
                              borderBottom: "1.5px solid var(--border)",
                            }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {recebimentoFiltrado.map((p) => {
                      const st = p.transporte?.status ?? "aguardando";
                      const proximo = proximoTransporte(p.origem, st);
                      const atrasou = atrasada(p);
                      const ultimo = p.eventos[0];
                      let acao: AcaoLinha;
                      if (st === "chegou") {
                        acao = {
                          rotulo: "Conferir mercadoria",
                          estilo: BTN,
                          rodar: () => abrirEdicao(p),
                        };
                      } else if (proximo === "chegou") {
                        acao = {
                          rotulo: "Registrar chegada na loja",
                          estilo: BTN,
                          rodar: () => executar(() => avancarTransporte(p.id, ultimo?.local ?? null)),
                        };
                      } else if (proximo) {
                        acao = {
                          rotulo: "Atualizar rastreio",
                          estilo: BTN,
                          rodar: () => abrirEdicao(p),
                        };
                      } else {
                        acao = { rotulo: "Ver compra", estilo: BTN_SEC, rodar: () => abrirEdicao(p) };
                      }
                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                            <div style={{ fontWeight: 700, color: "var(--ink)" }}>{p.codigo}</div>
                            <span
                              style={{
                                ...CHIP,
                                background: p.origem === "importacao" ? "var(--navy)" : "var(--blue-100)",
                                color: p.origem === "importacao" ? "#FFF" : "var(--blue-600)",
                              }}
                            >
                              {p.origem === "importacao" ? "Importação" : "Nacional"}
                            </span>
                          </td>
                          <td style={{ padding: "10px" }}>
                            <div style={{ color: "var(--ink)" }}>{p.fornecedor}</div>
                            {ultimo && (
                              <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                                {ultimo.texto}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "10px" }}>
                            <div style={{ color: "var(--ink)" }}>
                              {p.transporte?.transportadora ?? "—"}
                            </div>
                            <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                              {p.transporte?.codigo ?? "sem código"}
                            </div>
                          </td>
                          <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                            {dataCurta(p.transporte?.previsao ?? null)}
                          </td>
                          <td style={{ padding: "10px" }}>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              <ChipTransporte status={st} />
                              {atrasou && (
                                <span style={{ ...CHIP, background: "#FDECEC", color: "#B42318" }}>
                                  Atrasada
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                            <button type="button" onClick={acao.rodar} style={acao.estilo}>
                              {acao.rotulo}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {aba === "notas" && (
        <div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {(
              [
                { id: "tratar", label: "A tratar" },
                { id: "tratadas", label: "Tratadas" },
                { id: "todas", label: "Todas" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                aria-label={`Notas ${f.label}`}
                onClick={() => setFiltroNotas(f.id)}
                style={{
                  ...BTN_SEC,
                  background: filtroNotas === f.id ? "var(--navy)" : "#FFF",
                  color: filtroNotas === f.id ? "#FFF" : "var(--ink)",
                  borderColor: filtroNotas === f.id ? "var(--navy)" : "var(--border)",
                }}
              >
                {f.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              type="button"
              aria-label="Sincronizar notas"
              disabled={pendente}
              onClick={() => executar(() => sincronizarNotasRecebidas())}
              style={{ ...BTN, opacity: pendente ? 0.7 : 1 }}
            >
              Sincronizar notas (DF-e)
            </button>
          </div>

          <div style={CARD}>
            <h2 style={{ fontSize: 18, marginBottom: 6, color: "var(--ink)" }}>
              Notas recebidas ({notasFiltradas.length})
            </h2>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16 }}>
              NF-e emitidas contra o CNPJ da loja, baixadas da distribuição DF-e. Vincule a um
              pedido de compra ou crie uma entrada direta.
            </p>
            {notasFiltradas.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Nenhuma nota nesta lista.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {notasFiltradas.map((n) => (
                  <NotaCard
                    key={n.id}
                    nota={n}
                    pedidos={pedidos}
                    pendente={pendente}
                    onVincular={(compraId) =>
                      executar(() => vincularNota(compraId, n.id))
                    }
                    onEntradaDireta={() => executar(() => criarEntradaDireta(n.id))}
                    onDesconhecer={() => {
                      if (
                        !window.confirm(
                          `Desconhecer a nota ${n.numero}? O desconhecimento tem efeito fiscal e é registrado na SEFAZ.`
                        )
                      ) {
                        return;
                      }
                      executar(() => desconhecerNota(n.id));
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editor && (
        <Editor
          editor={editor}
          setEditor={setEditor}
          fornecedores={fornecedores}
          catalogo={catalogo}
          pedidos={pedidos}
          notas={notas}
          pendente={pendente}
          onFechar={() => setEditor(null)}
          onSalvar={salvarEditor}
          executar={executar}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------- NE-02/03 --
function NotaCard({
  nota,
  pedidos,
  pendente,
  onVincular,
  onEntradaDireta,
  onDesconhecer,
}: {
  nota: NotaRecebida;
  pedidos: PedidoCompra[];
  pendente: boolean;
  onVincular: (compraId: string) => void;
  onEntradaDireta: () => void;
  onDesconhecer: () => void;
}) {
  const candidatos = pedidos.filter(
    (p) =>
      p.origem === "nacional" &&
      !p.nota &&
      !p.canceladaEm &&
      cnpjCompativel(p.fornecedorCnpj, nota.emitenteCnpj)
  );
  const [alvo, setAlvo] = useState<string>(candidatos[0]?.id ?? "");
  // fallback: o estado inicial só enxerga os candidatos do primeiro render —
  // se o card montar antes dos pedidos chegarem, o botão continua habilitado.
  const alvoEfetivo =
    alvo && candidatos.some((c) => c.id === alvo) ? alvo : (candidatos[0]?.id ?? "");

  const ehVinculada = !!nota.compraId;
  const manCor: Record<string, { fundo: string; cor: string }> = {
    pendente: { fundo: "#FEF3C7", cor: "#B45309" },
    ciencia: { fundo: "var(--blue-100)", cor: "var(--blue-600)" },
    confirmada: { fundo: "#DCFCE7", cor: "#166534" },
    desconhecida: { fundo: "#FDECEC", cor: "#B42318" },
    nao_realizada: { fundo: "#FDECEC", cor: "#B42318" },
  };
  const man = manCor[nota.manifestacao] ?? manCor.pendente;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        background: "#FFFFFF",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div>
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>
            NF-e {nota.numero} · série {nota.serie}
          </span>
          <span style={{ fontSize: 13, color: "var(--ink-soft)", marginLeft: 10 }}>
            {nota.emitenteNome} · {nota.emitenteCnpj}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...CHIP, background: man.fundo, color: man.cor }}>
            {MANIFESTACAO_ROTULO[nota.manifestacao] ?? nota.manifestacao}
          </span>
          <span
            style={{
              ...CHIP,
              background: ehVinculada ? "#DCFCE7" : "#F3F4F6",
              color: ehVinculada ? "#166534" : "#6B7280",
            }}
          >
            {ehVinculada ? `Vinculada · ${nota.codigoCompra ?? ""}` : "Sem vínculo"}
          </span>
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>{brl(nota.valorTotal)}</span>
        </div>
      </div>

      <div style={{ fontSize:12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
        Emitida em {dataCurta(nota.emitidaEm)}
        {nota.emitenteUf ? ` · ${nota.emitenteUf}` : ""} · chave {nota.chave.slice(0, 12)}…
      </div>

      {/* comparação XML x pedido (NE-04) antes do vínculo */}
      {!ehVinculada && candidatos.length > 0 && nota.itens && (
        <div style={{ marginBottom: 12 }}>
          {candidatos.map((c) => {
            const div = compararNotaComPedido(
              nota.itens ?? [],
              c.itens.map((i) => ({ sku: i.sku, nome: i.nome, qtd: i.quantidade, custo: i.custo }))
            );
            return (
              <div key={c.id} style={{ fontSize: 12.5, marginBottom: 4 }}>
                <strong>{c.codigo}:</strong>{" "}
                {div.length === 0 ? (
                  <span style={{ color: "#1E7F4F", fontWeight: 700 }}>
                    confere com o pedido
                  </span>
                ) : (
                  <span style={{ color: "#B42318" }}>
                    {div.length} divergência(s) — {div.join(" · ")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!ehVinculada && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {candidatos.length > 0 && (
            <>
              <select
                aria-label={`Pedido para vincular a nota ${nota.numero}`}
                value={alvoEfetivo}
                onChange={(e) => setAlvo(e.target.value)}
                style={{ ...INPUT, flex: "1 1 240px" }}
              >
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} — {c.fornecedor}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Vincular nota ${nota.numero} ao pedido`}
                disabled={pendente || !alvoEfetivo}
                onClick={() => onVincular(alvoEfetivo)}
                style={{ ...BTN, opacity: pendente || !alvoEfetivo ? 0.7 : 1 }}
              >
                Vincular ao {(candidatos.find((c) => c.id === alvoEfetivo)?.codigo ?? "pedido").trim()}
              </button>
            </>
          )}
          <button
            type="button"
            aria-label={`Criar entrada direta da nota ${nota.numero}`}
            disabled={pendente}
            onClick={onEntradaDireta}
            style={{ ...BTN_SEC, opacity: pendente ? 0.7 : 1 }}
          >
            Criar entrada direta
          </button>
          <button
            type="button"
            aria-label={`Desconhecer nota ${nota.numero}`}
            disabled={pendente}
            onClick={onDesconhecer}
            style={{ ...BTN_PERIGO, opacity: pendente ? 0.7 : 1 }}
          >
            Desconhecer
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ editor --
function Editor({
  editor,
  setEditor,
  fornecedores,
  catalogo,
  pedidos,
  notas,
  pendente,
  onFechar,
  onSalvar,
  executar,
}: {
  editor: RascunhoEditor;
  setEditor: React.Dispatch<React.SetStateAction<RascunhoEditor | null>>;
  fornecedores: Fornecedor[];
  catalogo: ItemCatalogo[];
  pedidos: PedidoCompra[];
  notas: NotaRecebida[];
  pendente: boolean;
  onFechar: () => void;
  onSalvar: () => void;
  executar: <R extends { ok: boolean; erro?: string; aviso?: string }>(
    acao: () => Promise<R>
  ) => Promise<(R & { ok: true }) | null>;
}) {
  const pedido = editor.compraId ? (pedidos.find((p) => p.id === editor.compraId) ?? null) : null;
  const forn = fornecedores.find((f) => f.id === editor.fornecedorId) ?? null;
  const travado = !!editor.compraId;

  function patch(parcial: Partial<RascunhoEditor>) {
    setEditor((e) => (e ? { ...e, ...parcial } : e));
  }
  function patchLinha(idx: number, parcial: Partial<LinhaRapida>) {
    setEditor((e) =>
      e ? { ...e, linhas: e.linhas.map((l, i) => (i === idx ? { ...l, ...parcial } : l)) } : e
    );
  }
  function patchImp(parcial: Partial<RascunhoEditor["imp"]>) {
    setEditor((e) => (e ? { ...e, imp: { ...e.imp, ...parcial } } : e));
  }
  function patchTransp(parcial: Partial<RascunhoEditor["transp"]>) {
    setEditor((e) => (e ? { ...e, transp: { ...e.transp, ...parcial } } : e));
  }

  // mercadorias: nacional em R$, importação na moeda (5.2)
  const mercadorias = editor.linhas.reduce((s, l) => s + Number(l.qty || 0) * Number(l.custo || 0), 0);
  const resumoNac = resumoNacional(mercadorias, Number(editor.frete || 0), Number(editor.desconto || 0));
  const resumoImp = resumoImportacao(mercadorias, {
    moeda: editor.imp.moeda,
    cambio: Number(editor.imp.cambio || 0),
    freteInt: Number(editor.imp.freteInt || 0),
    seguro: Number(editor.imp.seguro || 0),
    aliqIi: Number(editor.imp.aliqIi || 0),
    aliqIpi: Number(editor.imp.aliqIpi || 0),
    aliqPis: Number(editor.imp.aliqPis || 0),
    aliqCofins: Number(editor.imp.aliqCofins || 0),
    aliqIcms: Number(editor.imp.aliqIcms || 0),
    despesas: Number(editor.imp.despesas || 0),
  });

  const etapas = pedido
    ? estadosDe(pedido)
    : (["atual", "pendente", "pendente", "pendente"] as EstadoEtapa[]);

  // nota vinculada a este pedido
  const nota = pedido?.nota ?? null;
  const nfeVinculada = nota?.nfeRecebidaId
    ? (notas.find((n) => n.id === nota.nfeRecebidaId) ?? null)
    : null;
  const candidatas = editor.compraId
    ? notas.filter(
        (n) =>
          !n.compraId &&
          cnpjCompativel(n.emitenteCnpj, forn?.cnpj) &&
          !!n.itens
      )
    : [];

  // transporte / conferência
  const stTransp = pedido?.transporte?.status ?? null;
  const seq = SEQUENCIAS_TRANSPORTE[editor.origem];
  const idxSeq = stTransp ? seq.indexOf(stTransp) : -1;
  const proximo = proximoTransporte(editor.origem, stTransp);
  const chegou = stTransp === "chegou";
  const itensParaConferir = pedido && chegou && !pedido.conferidoEm ? pedido.itens : [];

  function esperado(i: ItemPedido): number {
    const hit = nfeVinculada?.itens?.find(
      (n) => (n.codigo ?? "").trim().toUpperCase() === i.sku.trim().toUpperCase()
    );
    return hit ? Number(hit.qtd ?? 0) : i.quantidade;
  }

  async function concluir() {
    if (!pedido) return;
    const recebidos: Record<string, number> = {};
    for (const i of itensParaConferir) {
      const bruto = editor.recebidos[i.id] ?? "";
      recebidos[i.id] = bruto === "" ? esperado(i) - i.qtdRecebida : Number(bruto);
    }
    await executar(() => concluirRecebimento(pedido.id, recebidos));
  }

  const temDivergenciaNota = !!nota && (nota.status === "divergente" || nota.status === "rejeitada");

  return (
    <div style={CARD}>
      {/* cabeçalho + etapas grandes + alerta de divergência */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 20, color: "var(--ink)" }}>
            {editor.codigo ?? "Novo pedido de compra"}
          </h2>
          <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            {forn ? forn.nome : "Selecione o fornecedor"} ·{" "}
            {editor.origem === "importacao" ? "Importação" : "Nacional"}
          </div>
        </div>
        <button type="button" aria-label="Fechar editor" onClick={onFechar} style={BTN_SEC}>
          Fechar
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        {ETAPAS_COMPRA.map((nome, i) => {
          const e = etapas[i];
          const cor =
            e === "feita"
              ? { bg: "#DCFCE7", fg: "#166534" }
              : e === "erro"
                ? { bg: "#FDECEC", fg: "#B42318" }
                : e === "atual"
                  ? { bg: "var(--blue-100)", fg: "var(--blue-600)" }
                  : { bg: "#F3F4F6", fg: "#6B7280" };
          return (
            <div
              key={nome}
              aria-label={`Etapa grande ${nome}`}
              style={{
                background: cor.bg,
                color: cor.fg,
                borderRadius: 12,
                padding: "12px 14px",
                fontWeight: 700,
                fontSize: 13.5,
              }}
            >
              {i + 1}. {nome}
            </div>
          );
        })}
      </div>

      {temDivergenciaNota && nota && (
        <div
          role="alert"
          style={{
            background: "#FDECEC",
            border: "1.5px solid #B42318",
            color: "#B42318",
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 16,
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          Nota {nota.numero} divergente do pedido:
          <ul style={{ margin: "6px 0 0 18px", fontWeight: 500 }}>
            {nota.divergencias.length === 0 && <li>Sem diferenças registradas.</li>}
            {nota.divergencias.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* -------------------------------------------------- coluna 1 ----- */}
        <div>
          <h3 style={{ fontSize: 15, marginBottom: 10, color: "var(--ink)" }}>Documento</h3>

          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            {(["nacional", "importacao"] as const).map((o) => {
              const ativo = editor.origem === o;
              return (
                <button
                  key={o}
                  type="button"
                  disabled={travado}
                  aria-label={`Origem ${o}`}
                  title={travado ? "A origem não muda depois de salvo." : undefined}
                  onClick={() => patch({ origem: o })}
                  style={{
                    flex: 1,
                    padding: "12px 10px",
                    borderRadius: 12,
                    cursor: travado ? "not-allowed" : "pointer",
                    opacity: travado && !ativo ? 0.5 : 1,
                    border: `1.5px solid ${ativo ? "var(--navy)" : "var(--border)"}`,
                    background: ativo ? "var(--navy)" : "#FFF",
                    color: ativo ? "#FFF" : "var(--ink)",
                    fontWeight: 700,
                    fontSize: 13.5,
                    fontFamily: "'Open Sans', sans-serif",
                  }}
                >
                  {o === "nacional" ? "Nacional" : "Importação"}
                </button>
              );
            })}
          </div>

          <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
            Fornecedor
          </label>
          <select
            aria-label="Fornecedor no editor"
            value={editor.fornecedorId}
            onChange={(e) => patch({ fornecedorId: e.target.value })}
            style={{ ...INPUT, width: "100%", marginBottom: 8 }}
          >
            <option value="">Fornecedor…</option>
            {fornecedores
              .filter((f) => f.ativo)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
          </select>
          {forn && (
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
              {digitos(forn.cnpj).length === 14 ? (
                <span>
                  CNPJ {forn.cnpj}
                  {forn.uf ? ` · ${forn.uf}` : ""}
                </span>
              ) : (
                <span>{forn.pais || "Brasil"} · sem CNPJ</span>
              )}
              {forn.contato ? <div>E-mail: {forn.contato}</div> : null}
            </div>
          )}

          {editor.origem === "importacao" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
                Moeda
                <select
                  aria-label="Moeda"
                  value={editor.imp.moeda}
                  onChange={(e) => patchImp({ moeda: e.target.value })}
                  style={{ ...INPUT, width: "100%", marginTop: 4 }}
                >
                  {["USD", "EUR", "CNY", "BRL"].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
                Câmbio (R$)
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  aria-label="Câmbio"
                  value={editor.imp.cambio}
                  onChange={(e) => patchImp({ cambio: e.target.value })}
                  style={{ ...INPUT, width: "100%", marginTop: 4 }}
                />
              </label>
              <label
                style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", gridColumn: "1 / -1" }}
              >
                DI / DUIMP
                <input
                  type="text"
                  aria-label="DI ou DUIMP"
                  value={editor.imp.di}
                  onChange={(e) => patchImp({ di: e.target.value })}
                  style={{ ...INPUT, width: "100%", marginTop: 4 }}
                />
              </label>
            </div>
          )}

          {/* produtos */}
          <input
            type="search"
            placeholder="Buscar produto para adicionar"
            aria-label="Buscar produto no editor"
            value={editor.buscaProduto}
            onChange={(e) => patch({ buscaProduto: e.target.value })}
            style={{ ...INPUT, width: "100%", marginBottom: 10 }}
          />

          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 6 }}>
            Produto · Qtd · {editor.origem === "importacao" ? `Custo (${editor.imp.moeda})` : "Custo unit."} ·
            Custo final un.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {editor.linhas.map((l, idx) => {
              const cat = catalogo.find((c) => c.id === l.itemId);
              const custoFinal =
                editor.origem === "importacao"
                  ? Number(l.custo || 0) * Number(editor.imp.cambio || 0)
                  : Number(l.custo || 0);
              const visiveis = catalogo.filter(
                (c) =>
                  !editor.buscaProduto.trim() ||
                  `${c.sku} ${c.nome}`.toLowerCase().includes(editor.buscaProduto.trim().toLowerCase())
              );
              return (
                <div key={idx} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <select
                    aria-label={`Produto da linha ${idx + 1}`}
                    value={l.itemId}
                    onChange={(e) => patchLinha(idx, { itemId: e.target.value })}
                    style={{ ...INPUT, flex: "3 1 180px" }}
                  >
                    <option value="">Produto…</option>
                    {visiveis.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sku} — {c.nome}
                      </option>
                    ))}
                    {cat && !visiveis.some((c) => c.id === cat.id) && (
                      <option value={cat.id}>
                        {cat.sku} — {cat.nome}
                      </option>
                    )}
                  </select>
                  <input
                    type="number"
                    min={1}
                    aria-label={`Quantidade da linha ${idx + 1}`}
                    value={l.qty}
                    onChange={(e) => patchLinha(idx, { qty: e.target.value })}
                    style={{ ...INPUT, flex: "0 1 80px" }}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    aria-label={`Custo da linha ${idx + 1}`}
                    value={l.custo}
                    onChange={(e) => patchLinha(idx, { custo: e.target.value })}
                    style={{ ...INPUT, flex: "1 1 100px" }}
                  />
                  <span
                    aria-label={`Custo final da linha ${idx + 1}`}
                    style={{
                      ...INPUT,
                      flex: "1 1 110px",
                      background: "var(--bg-cotton)",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                    }}
                  >
                    {brl(custoFinal)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remover linha ${idx + 1}`}
                    onClick={() =>
                      setEditor((e) =>
                        e
                          ? {
                              ...e,
                              linhas:
                                e.linhas.length > 1
                                  ? e.linhas.filter((_, i) => i !== idx)
                                  : e.linhas,
                            }
                          : e
                      )
                    }
                    style={{ ...BTN, background: "var(--ink-soft)", padding: "10px 12px" }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="Adicionar linha de produto"
            onClick={() => patch({ linhas: [...editor.linhas, { itemId: "", qty: "1", custo: "" }] })}
            style={{ ...BTN, background: "var(--blue-600)", marginTop: 10 }}
          >
            + Produto
          </button>

          <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", marginTop: 14 }}>
            Observações
            <input
              type="text"
              aria-label="Observações do pedido"
              value={editor.obs}
              onChange={(e) => patch({ obs: e.target.value })}
              style={{ ...INPUT, width: "100%", marginTop: 4, fontWeight: 400 }}
            />
          </label>
        </div>

        {/* -------------------------------------------------- coluna 2 ----- */}
        <div>
          <h3 style={{ fontSize: 15, marginBottom: 10, color: "var(--ink)" }}>
            {editor.origem === "importacao" ? "Custo de importação" : "Resumo"}
          </h3>

          {editor.origem === "nacional" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
                Frete (R$)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Frete"
                  value={editor.frete}
                  onChange={(e) => patch({ frete: e.target.value })}
                  style={{ ...INPUT, width: "100%", marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
                Desconto (R$)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Desconto"
                  value={editor.desconto}
                  onChange={(e) => patch({ desconto: e.target.value })}
                  style={{ ...INPUT, width: "100%", marginTop: 4 }}
                />
              </label>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {(
                [
                  ["freteInt", "Frete internacional"],
                  ["seguro", "Seguro"],
                  ["aliqIi", "II (%)"],
                  ["aliqIpi", "IPI (%)"],
                  ["aliqPis", "PIS (%)"],
                  ["aliqCofins", "COFINS (%)"],
                  ["aliqIcms", "ICMS (%)"],
                  ["despesas", "Despesas (R$)"],
                ] as const
              ).map(([k, rot]) => (
                <label key={k} style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
                  {rot}
                  <input
                    type="number"
                    min={0}
                    step={k.startsWith("aliq") ? "0.01" : "0.01"}
                    aria-label={rot}
                    value={editor.imp[k]}
                    onChange={(e) => patchImp({ [k]: e.target.value } as Partial<RascunhoEditor["imp"]>)}
                    style={{ ...INPUT, width: "100%", marginTop: 4 }}
                  />
                </label>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: 14,
              padding: "14px 16px",
              borderRadius: 12,
              background: "var(--pink-600)",
              color: "#FFF",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>
              {editor.origem === "importacao" ? "Total nacionalizado" : "Total do pedido"}
            </span>
            <span style={{ fontWeight: 800, fontSize: 18 }}>
              {editor.origem === "importacao"
                ? brl(resumoImp.total)
                : brl(resumoNac.total)}
            </span>
          </div>

          {editor.origem === "importacao" && (
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
              FOB {brl(resumoImp.fob)} · CIF {brl(resumoImp.cif)} · II {brl(resumoImp.ii)} · IPI{" "}
              {brl(resumoImp.ipi)} · ICMS {brl(resumoImp.icms)}
            </div>
          )}

          <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", marginTop: 14 }}>
            Condição de pagamento
            <select
              aria-label="Condição de pagamento"
              value={editor.condicao}
              onChange={(e) => patch({ condicao: e.target.value })}
              style={{ ...INPUT, width: "100%", marginTop: 4, fontWeight: 400 }}
            >
              {CONDICOES_PAGAMENTO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {/* nota de entrada */}
          <h3 style={{ fontSize: 15, margin: "20px 0 10px", color: "var(--ink)" }}>Nota de entrada</h3>
          {!editor.compraId && (
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              Salve o pedido para vincular a nota.
            </p>
          )}
          {editor.compraId && nota && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 14,
                background: "#FFFFFF",
              }}
            >
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <span
                  style={{
                    ...CHIP,
                    background: "var(--blue-100)",
                    color: "var(--blue-600)",
                    marginRight: 8,
                  }}
                >
                  CFOP {nota.cfop}
                </span>
                <span style={{ color: "var(--ink-soft)" }}>
                  {CFOP_DESC[nota.cfop] ?? "Entrada para revenda"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>
                Emitida por {forn?.nome ?? "fornecedor"} · NF {nota.numero} · série {nota.serie}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", wordBreak: "break-all" }}>
                Chave: {nota.chave ?? "—"}
              </div>
              {nota.divergencias.length > 0 && (
                <ul
                  style={{
                    margin: "8px 0 0 18px",
                    fontSize: 12.5,
                    color: "#B42318",
                    fontWeight: 600,
                  }}
                >
                  {nota.divergencias.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {nota.status === "divergente" && (
                  <>
                    <button
                      type="button"
                      aria-label="Aceitar assim"
                      onClick={() => executar(() => aceitarDivergencia(editor.compraId!))}
                      style={BTN}
                    >
                      Aceitar assim
                    </button>
                    <button
                      type="button"
                      aria-label="Recusar nota"
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Recusar a nota ${nota.numero}? Ela é desvinculada e o desconhecimento é registrado na SEFAZ.`
                          )
                        ) {
                          return;
                        }
                        executar(() => recusarNota(editor.compraId!));
                      }}
                      style={BTN_PERIGO}
                    >
                      Recusar nota
                    </button>
                  </>
                )}
                {nota.status === "transmitida" && (
                  <button
                    type="button"
                    aria-label="Consultar nota de entrada"
                    onClick={() => executar(() => consultarNotaEntrada(editor.compraId!))}
                    style={BTN_SEC}
                  >
                    Consultar resultado (SEFAZ)
                  </button>
                )}
                {nota.status === "ok" && (
                  <span style={{ ...CHIP, background: "#DCFCE7", color: "#166534" }}>
                    Autorizada
                  </span>
                )}
              </div>
            </div>
          )}
          {editor.compraId && !nota && editor.origem === "nacional" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {candidatas.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                  Nenhuma nota pendente com o CNPJ deste fornecedor. Use a aba “Notas recebidas”.
                </p>
              )}
              {candidatas.map((n) => (
                <div
                  key={n.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 12,
                    background: "#FFFFFF",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 13 }}>
                    <strong>
                      NF {n.numero} · série {n.serie}
                    </strong>
                    <div style={{ color: "var(--ink-soft)", fontSize: 12 }}>
                      {n.emitenteNome} · {brl(n.valorTotal)}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Vincular NF ${n.numero}`}
                    onClick={() => executar(() => vincularNota(editor.compraId!, n.id))}
                    style={BTN}
                  >
                    Vincular NF {n.numero}
                  </button>
                </div>
              ))}
            </div>
          )}
          {editor.compraId && !nota && editor.origem === "importacao" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                aria-label="Emitir NF-e de entrada"
                onClick={() => executar(() => emitirNotaEntradaImportacao(editor.compraId!))}
                style={BTN}
              >
                Emitir NF-e de entrada (3102)
              </button>
            </div>
          )}
          {/* contas a pagar */}
          {pedido && pedido.parcelas.length > 0 && (
            <>
              <h3 style={{ fontSize: 15, margin: "20px 0 10px", color: "var(--ink)" }}>
                Contas a pagar
              </h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {pedido.parcelas.map((par) => (
                    <tr key={par.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 4px" }}>
                        {par.numero}ª · {dataCurta(par.vencimento)}
                      </td>
                      <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700 }}>
                        {brl(Number(par.valor) - Number(par.pago))}
                      </td>
                      <td style={{ padding: "8px 4px", textAlign: "right" }}>
                        {par.status === "liquidado" ? (
                          <span style={{ ...CHIP, background: "#DCFCE7", color: "#166534" }}>
                            Paga
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Marcar parcela ${par.numero} como paga`}
                            onClick={() => executar(() => marcarParcelaPaga(par.id))}
                            style={{ ...BTN_SEC, padding: "6px 12px", fontSize: 12.5 }}
                          >
                            Marcar paga
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* -------------------------------------------------- coluna 3 ----- */}
        <div>
          <h3 style={{ fontSize: 15, marginBottom: 10, color: "var(--ink)" }}>Recebimento</h3>

          {/* progresso do transporte */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {seq.map((s, i) => {
              const feito = idxSeq >= 0 && i <= idxSeq;
              const cor = CORES_TRANSPORTE[s] ?? { fundo: "#F3F4F6", cor: "#6B7280" };
              return (
                <div
                  key={s}
                  aria-label={`Segmento ${ROTULOS_TRANSPORTE[s] ?? s}`}
                  title={ROTULOS_TRANSPORTE[s] ?? s}
                  style={{
                    flex: "1 1 60px",
                    height: 8,
                    borderRadius: 999,
                    background: feito ? cor.fundo : "#E5E7EB",
                    border: feito ? `1px solid ${cor.cor}` : "1px solid transparent",
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            <ChipTransporte status={stTransp} />
            {pedido && atrasada(pedido) && (
              <span style={{ ...CHIP, background: "#FDECEC", color: "#B42318" }}>Atrasada</span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
              Transportadora
              <input
                type="text"
                aria-label="Transportadora"
                value={editor.transp.transportadora}
                onChange={(e) => patchTransp({ transportadora: e.target.value })}
                style={{ ...INPUT, width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
              Código (rastreio / BL / AWB)
              <input
                type="text"
                aria-label="Código de rastreio"
                value={editor.transp.codigo}
                onChange={(e) => patchTransp({ codigo: e.target.value })}
                style={{ ...INPUT, width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
              Previsão de chegada
              <input
                type="date"
                aria-label="Previsão de chegada"
                value={editor.transp.previsao}
                onChange={(e) => patchTransp({ previsao: e.target.value })}
                style={{ ...INPUT, width: "100%", marginTop: 4 }}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button
              type="button"
              aria-label="Atualizar rastreio"
              disabled={!editor.compraId || pendente}
              onClick={() =>
                executar(() =>
                  atualizarTransporte(editor.compraId!, {
                    transportadora: editor.transp.transportadora,
                    codigo: editor.transp.codigo,
                    previsao: editor.transp.previsao,
                  })
                )
              }
              style={BTN_SEC}
            >
              Atualizar rastreio
            </button>
            <button
              type="button"
              aria-label={proximo === "chegou" ? "Registrar chegada na loja" : "Avançar transporte"}
              disabled={!editor.compraId || !proximo || pendente}
              onClick={() => executar(() => avancarTransporte(editor.compraId!))}
              style={BTN}
            >
              {proximo === "chegou" ? "Registrar chegada na loja" : `Avançar: ${ROTULOS_TRANSPORTE[proximo ?? ""] ?? "—"}`}
            </button>
          </div>

          {/* quadro de conferência */}
          {itensParaConferir.length > 0 && (
            <div
              aria-label="Quadro de conferência"
              style={{
                marginTop: 16,
                border: "1.5px solid var(--navy)",
                borderRadius: 12,
                padding: 14,
                background: "#FFFFFF",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--ink)" }}>
                Conferência
              </div>
              {itensParaConferir.map((i) => {
                const esp = esperado(i);
                const recebidoAtual =
                  editor.recebidos[i.id] === undefined
                    ? String(Math.max(0, esp - i.qtdRecebida))
                    : editor.recebidos[i.id];
                const dif = Number(recebidoAtual || 0) !== esp - i.qtdRecebida;
                return (
                  <div
                    key={i.id}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ flex: "1 1 160px", fontSize: 13 }}>
                      <div style={{ fontWeight: 700 }}>{i.sku}</div>
                      <div style={{ color: "var(--ink-soft)", fontSize: 12 }}>
                        {i.nome} · esperado {esp}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      aria-label={`Recebido ${i.sku}`}
                      value={recebidoAtual}
                      onChange={(e) =>
                        setEditor((ed) =>
                          ed
                            ? {
                                ...ed,
                                recebidos: { ...ed.recebidos, [i.id]: e.target.value },
                              }
                            : ed
                        )
                      }
                      style={{
                        ...INPUT,
                        flex: "0 1 100px",
                        borderColor: dif ? "#B42318" : "var(--border)",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      já recebido {i.qtdRecebida}
                    </span>
                  </div>
                );
              })}
              <button
                type="button"
                aria-label="Concluir recebimento"
                onClick={concluir}
                disabled={pendente}
                style={{ ...BTN, marginTop: 6, opacity: pendente ? 0.7 : 1 }}
              >
                {itensParaConferir.some(
                  (i) =>
                    Number(
                      editor.recebidos[i.id] === undefined
                        ? String(Math.max(0, esperado(i) - i.qtdRecebida))
                        : editor.recebidos[i.id] || 0
                    ) !== esperado(i) - i.qtdRecebida
                )
                  ? "Concluir com diferença"
                  : "Concluir recebimento"}
              </button>
            </div>
          )}

          {/* histórico de eventos */}
          {pedido && pedido.eventos.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: "var(--ink)" }}>
                Histórico
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pedido.eventos.map((ev, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                    <strong style={{ color: "var(--ink)" }}>{ev.texto}</strong>
                    {ev.local ? ` · ${ev.local}` : ""} · {dataCurta(ev.em)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ações */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
            <button
              type="button"
              aria-label={editor.compraId ? "Salvar alterações" : "Salvar pedido de compra"}
              onClick={onSalvar}
              disabled={pendente}
              style={{ ...BTN, opacity: pendente ? 0.7 : 1 }}
            >
              {editor.compraId ? "Salvar alterações" : "Salvar pedido de compra"}
            </button>
            <button
              type="button"
              aria-label="Enviar pedido ao fornecedor"
              disabled={!editor.compraId || pendente}
              onClick={() => executar(() => enviarPedidoFornecedor(editor.compraId!))}
              style={BTN_SEC}
            >
              Enviar pedido ao fornecedor (PDF)
            </button>
          </div>

          {pedido && pedido.envios.length > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 10 }}>
              Pedido enviado {pedido.envios.length}× · último em {dataCurta(pedido.envios[0]?.em)}
              {pedido.envios[0]?.para ? ` para ${pedido.envios[0].para}` : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
