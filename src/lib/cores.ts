// Mistura uma cor com branco. pct = % da cor (menor = mais clara).
export function claro(cor: string, pct: number): string {
  return `color-mix(in srgb, ${cor} ${pct}%, #FFFFFF)`;
}
