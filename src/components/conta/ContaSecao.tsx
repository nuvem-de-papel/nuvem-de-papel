import type { ReactNode } from "react";

// Cartao padrao de cada pagina da area do cliente.
export function ContaSecao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="conta-secao">
      <h2>{titulo}</h2>
      {children}
    </section>
  );
}

export function ContaEmBreve({ texto }: { texto: string }) {
  return <p className="conta-vazio">{texto}</p>;
}
