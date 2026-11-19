// Selos de confianca da loja (19/11/2026, pedido do Joaquim; referencia externa,
// cores do projeto). "linha" = 3 selos pequenos embaixo do botao Comprar;
// "faixa" = 4 selos grandes no topo do checkout.
const ICONES = {
  cartao: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </>
  ),
  caminhao: (
    <>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  escudo: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  cadeado: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  estrela: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />,
};

type Selo = { icone: keyof typeof ICONES; titulo: string; sub?: string };

const LINHA: Selo[] = [
  { icone: "cartao", titulo: "12x no cartão ou Pix" },
  { icone: "caminhao", titulo: "Envio para todo o Brasil" },
  { icone: "escudo", titulo: "Compra segura" },
];

const FAIXA: Selo[] = [
  { icone: "cadeado", titulo: "Compra 100%", sub: "segura" },
  { icone: "cartao", titulo: "Até 12x no cartão", sub: "ou Pix e boleto à vista" },
  { icone: "caminhao", titulo: "Envio para", sub: "todo o Brasil" },
  { icone: "estrela", titulo: "Papelaria", sub: "com carinho" },
];

function Icone({ nome, tam }: { nome: keyof typeof ICONES; tam: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONES[nome]}
    </svg>
  );
}

export function SelosConfianca({ variante }: { variante: "linha" | "faixa" }) {
  if (variante === "linha") {
    return (
      <ul className="selos-linha" aria-label="Vantagens da compra">
        {LINHA.map((s) => (
          <li key={s.titulo}>
            <Icone nome={s.icone} tam={18} />
            <span>{s.titulo}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="selos-faixa" aria-label="Vantagens da compra">
      {FAIXA.map((s) => (
        <li key={s.titulo}>
          <Icone nome={s.icone} tam={26} />
          <strong>{s.titulo}</strong>
          {s.sub && <span>{s.sub}</span>}
        </li>
      ))}
    </ul>
  );
}
