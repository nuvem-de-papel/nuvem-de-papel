// Precos de referencia do orcamento (canal varejo). Pura: usada no servidor e no navegador.
// Faixa vigente = maior min_quantity <= quantidade; se nenhuma, a de menor min_quantity.

export type FaixaPreco = { minQtd: number; preco: number };

export type InfoItemOrcamento = {
  /** Saldo do CD (item_stock_cd_public). 0 = sem linha. */
  saldo: number;
  /** Faixas vigentes do canal varejo. Vazio = sem preco cadastrado. */
  faixas: FaixaPreco[];
};

export function precoUnitario(faixas: FaixaPreco[], quantidade: number): number | null {
  if (faixas.length === 0) return null;
  const ordenadas = [...faixas].sort((a, b) => a.minQtd - b.minQtd);
  let escolhida = ordenadas[0];
  for (const f of ordenadas) {
    if (f.minQtd <= quantidade) escolhida = f;
  }
  return escolhida.preco;
}

export function formatarReal(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}
