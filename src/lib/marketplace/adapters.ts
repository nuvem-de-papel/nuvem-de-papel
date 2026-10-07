import type { MarketplaceAdapter } from "./types";

// Registro unico de adaptadores (padrao adaptador do briefing de marketplaces).
// M1 (kernel): vazio - nenhum canal e chamado de verdade e o handler da fila
// responde "adaptador pendente (Modulo 2)" em vez de inventar resposta de API.
// O Modulo 2 (Mercado Livre) chama registrarAdapter() aqui; o 11o canal
// futuro entra sem tocar no core da fila nem no schema.

const registro = new Map<string, MarketplaceAdapter>();

export function registrarAdapter(adapter: MarketplaceAdapter): void {
  registro.set(adapter.slug, adapter);
}

export function obterAdapter(slug: string): MarketplaceAdapter | null {
  return registro.get(slug) ?? null;
}

export function adaptadoresRegistrados(): string[] {
  return [...registro.keys()];
}
