// Lancamento de produto (0055 - 17/11/2026).
// catalog_items.lancamento_ate (date) = ultimo dia em que o item e "Novo".
// Depois disso volta a ser produto normal SOZINHO: a regra roda na leitura,
// sem cron e sem desmarcar. Datas sempre como texto AAAA-MM-DD no fuso de
// Brasilia (comparar texto ISO = comparar data, sem erro de fuso).
// Modulo puro: usado no servidor (vitrine) e no cliente (cadastro/catalogo).

export const PRAZO_LANCAMENTO_DIAS = 30;

const FMT_BR = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Hoje em America/Sao_Paulo, AAAA-MM-DD. */
export function hojeBrasilia(agora: Date = new Date()): string {
  return FMT_BR.format(agora);
}

/** AAAA-MM-DD + n dias (calendario puro, sem fuso). */
export function somarDias(isoData: string, dias: number): string {
  const [a, m, d] = isoData.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** Data sugerida ao marcar Lancamento no cadastro: hoje + 30 dias. */
export function lancamentoPadrao(agora: Date = new Date()): string {
  return somarDias(hojeBrasilia(agora), PRAZO_LANCAMENTO_DIAS);
}

/** E lancamento enquanto lancamento_ate >= hoje (inclusive). null = normal. */
export function ehLancamento(ate: string | null | undefined, agora: Date = new Date()): boolean {
  if (!ate) return false;
  return ate.slice(0, 10) >= hojeBrasilia(agora);
}
