// Compras v1: regras puras compartilhadas entre as server actions e o
// console (preview de divergências, custos 5.2, CFOP 5.8, sequências de
// transporte 5.5 e condições de pagamento 5.6). Sem I/O — testável no
// cliente e no servidor com a MESMA implementação (NE-02 mostra a comparação
// antes do vínculo; a action grava a mesma lista no banco).

// ------------------------------------------------------------------- NE-04 --
export type ItemNotaXml = {
  codigo?: string | null;
  descricao?: string | null;
  qtd?: number | null;
  custo?: number | null;
};

export type ItemPedidoCmp = {
  sku: string;
  nome: string;
  qtd: number;
  custo: number;
};

function brlCurto(v: number): string {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Compara o XML da nota com o pedido: ausente na nota, item a mais na nota,
// quantidade diferente e preço diferente além de R$ 0,01.
export function compararNotaComPedido(
  itensNota: ItemNotaXml[],
  itensPedido: ItemPedidoCmp[]
): string[] {
  const div: string[] = [];
  const usados = new Set<number>();

  for (const p of itensPedido) {
    const idx = itensNota.findIndex(
      (n) => (n.codigo ?? "").trim().toUpperCase() === p.sku.trim().toUpperCase()
    );
    if (idx < 0) {
      div.push(`${p.nome}: não veio na nota`);
      continue;
    }
    usados.add(idx);
    const n = itensNota[idx];
    const qtdNota = Number(n.qtd ?? 0);
    if (qtdNota !== p.qtd) {
      div.push(`${p.nome}: pedido ${p.qtd} un., nota ${qtdNota} un.`);
    }
    const custoNota = Number(n.custo ?? 0);
    if (Math.abs(custoNota - p.custo) > 0.01) {
      div.push(`${p.nome}: custo do pedido ${brlCurto(p.custo)}, da nota ${brlCurto(custoNota)}`);
    }
  }

  itensNota.forEach((n, i) => {
    if (usados.has(i)) return;
    const codigo = (n.codigo ?? "").trim() || (n.descricao ?? "").trim() || "item";
    div.push(`${codigo}: está na nota, mas não no pedido`);
  });

  return div;
}

// -------------------------------------------------------------------- 5.2 ---
export function resumoNacional(mercadorias: number, frete: number, desconto: number) {
  const total = Math.max(0, mercadorias + frete - desconto);
  const fator = mercadorias > 0 ? total / mercadorias : 1;
  return { total, fator };
}

export type DadosImportacao = {
  moeda: string;
  cambio: number;
  freteInt: number;
  seguro: number;
  aliqIi: number;
  aliqIpi: number;
  aliqPis: number;
  aliqCofins: number;
  aliqIcms: number;
  despesas: number;
};

// Nacionalização da importação (5.2). Simulação — validar com contabilidade.
export function resumoImportacao(mercadoriaMoeda: number, imp: DadosImportacao) {
  const fob = mercadoriaMoeda * imp.cambio;
  const cif = fob + (imp.freteInt + imp.seguro) * imp.cambio;
  const ii = cif * (imp.aliqIi / 100);
  const ipi = (cif + ii) * (imp.aliqIpi / 100);
  const pis = cif * (imp.aliqPis / 100);
  const cofins = cif * (imp.aliqCofins / 100);
  const icms =
    ((cif + ii + ipi + pis + cofins + imp.despesas) / (1 - imp.aliqIcms / 100)) *
    (imp.aliqIcms / 100);
  const total = cif + ii + ipi + pis + cofins + imp.despesas + icms;
  return { fob, cif, ii, ipi, pis, cofins, icms, despesas: imp.despesas, total };
}

// -------------------------------------------------------------------- 5.8 ---
// CFOP de entrada (revenda): fornecedor de SP 1102, outro estado 2102,
// importação 3102.
export function cfopEntrada(origem: "nacional" | "importacao", uf?: string | null): string {
  if (origem === "importacao") return "3102";
  return (uf ?? "").toUpperCase() === "SP" ? "1102" : "2102";
}

// -------------------------------------------------------------------- 5.5 ---
export const SEQUENCIAS_TRANSPORTE: Record<"nacional" | "importacao", string[]> = {
  nacional: ["aguardando", "transito", "saiu", "chegou"],
  importacao: [
    "producao",
    "embarcado",
    "transito_int",
    "porto",
    "desembaraco",
    "liberado",
    "transito",
    "chegou",
  ],
};

export const ROTULOS_TRANSPORTE: Record<string, string> = {
  aguardando: "Aguardando envio",
  transito: "Em trânsito",
  saiu: "Saiu para entrega",
  chegou: "Chegou",
  producao: "Em produção",
  embarcado: "Embarcado",
  transito_int: "Trânsito internacional",
  porto: "No porto",
  desembaraco: "Em desembaraço",
  liberado: "Liberado",
};

// RC-01: texto de cada transição (o local entra junto quando informado).
export const EVENTOS_TRANSPORTE: Record<string, string> = {
  "aguardando>transito": "Mercadoria em trânsito",
  "transito>saiu": "Saiu para entrega",
  "saiu>chegou": "Chegou à loja",
  "producao>embarcado": "Embarcado no país de origem",
  "embarcado>transito_int": "Em trânsito internacional",
  "transito_int>porto": "Chegou ao porto",
  "porto>desembaraco": "Entrou em desembaraço",
  "desembaraco>liberado": "Desembaraço liberado",
  "liberado>transito": "Em trânsito nacional",
  "transito>chegou": "Chegou à loja",
};

export function proximoTransporte(
  origem: "nacional" | "importacao",
  atual: string | null | undefined
): string | null {
  const seq = SEQUENCIAS_TRANSPORTE[origem] ?? SEQUENCIAS_TRANSPORTE.nacional;
  if (!atual) return seq[0];
  const i = seq.indexOf(atual);
  if (i < 0 || i >= seq.length - 1) return null;
  return seq[i + 1];
}

// RC-02: atrasada = previsão vencida, não chegou e não conferida.
export function estaAtrasada(p: {
  previsao: string | null;
  statusTransporte: string | null;
  conferidoEm: string | null;
}): boolean {
  if (!p.previsao || p.statusTransporte === "chegou" || p.conferidoEm) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prev = new Date(p.previsao + "T00:00:00");
  return prev.getTime() < hoje.getTime();
}

// -------------------------------------------------------------------- 5.6 ---
export const CONDICOES_PAGAMENTO = ["À vista", "28 dias", "30/60", "30/60/90"] as const;

export const DIAS_CONDICAO: Record<string, number[]> = {
  "À vista": [0],
  "28 dias": [28],
  "30/60": [30, 60],
  "30/60/90": [30, 60, 90],
};

// -------------------------------------------------------------------- 5.7 ---
export const ETAPAS_COMPRA = [
  "Pedido de compra",
  "Nota de entrada",
  "Recebimento",
  "Pagamento",
] as const;

// Sequência de status por origem para a UI (não usada fora daqui por ora).
export type EstadoEtapa = "feita" | "atual" | "erro" | "pendente";

export function etapasCompra(p: {
  temNota: boolean;
  notaStatus: string | null;
  conferido: boolean;
  atrasada: boolean;
  temParcelas: boolean;
  quitado: boolean;
}): EstadoEtapa[] {
  const e: EstadoEtapa[] = ["pendente", "pendente", "pendente", "pendente"];
  e[0] = "feita"; // PC-03: o número existe sempre que a compra aparece
  e[1] = p.temNota ? (p.notaStatus === "divergente" || p.notaStatus === "rejeitada" ? "erro" : "feita") : "atual";
  if (p.conferido) e[2] = "feita";
  else if (p.atrasada) e[2] = "erro";
  else e[2] = e[1] === "feita" ? "atual" : "pendente";
  if (p.quitado) e[3] = "feita";
  else if (p.temParcelas) e[3] = e[2] === "feita" ? "atual" : "pendente";
  return e;
}
