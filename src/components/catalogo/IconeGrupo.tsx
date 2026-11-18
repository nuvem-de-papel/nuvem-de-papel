import { ICONES_GRUPO } from "@/lib/gruposSetores";

// Icone de linha fina do grupo (0057). Chave desconhecida = icone de menu.
// O desenho vem de constante do proprio codigo (nunca de entrada do usuario).
export function IconeGrupo({ icone, tamanho = 18 }: { icone: string; tamanho?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "0 0 auto", verticalAlign: "middle" }}
      dangerouslySetInnerHTML={{ __html: ICONES_GRUPO[icone] ?? ICONES_GRUPO.menu }}
    />
  );
}
