// Chat de atendimento da loja (pacote WhatsChat, adaptado 19/11/2026).
// Roteiro fixo, sem IA, sem gravar nada e sem pedir dado pessoal: aqui o
// cliente so escolhe o assunto; a conversa real continua no WhatsApp.

export const MARCA_CHAT = {
  nome: "Nuvem de Papel",
  // mesmo numero do rodape/flutuante (Footer.tsx WHATSAPP_URL)
  whatsapp: "https://wa.me/5519993631145",
  horario: "Seg a sex, 9h às 18h · Sáb, 9h às 12h",
} as const;

export type OpcaoChat = {
  id: string;
  rotulo: string;
  // entra em "Olá! Vim pelo site da Nuvem de Papel e quero {assunto}."
  assunto: string;
  resposta: string;
  interno?: { rotulo: string; href: string };
};

export const SAUDACAO = [
  "Olá! Aqui é o atendimento da Nuvem de Papel.",
  "Sobre o que você quer falar?",
] as const;

export const OPCOES_CHAT: readonly OpcaoChat[] = [
  {
    id: "produto",
    rotulo: "Dúvida sobre um produto",
    assunto: "tirar uma dúvida sobre um produto",
    resposta: "Claro! Fale com a gente no WhatsApp ou dê uma olhada no catálogo.",
    interno: { rotulo: "Ver produtos", href: "/produtos" },
  },
  {
    id: "pedido",
    rotulo: "Meu pedido",
    assunto: "saber sobre o meu pedido",
    resposta: "Você acompanha o status em Meus pedidos. Se precisar, a equipe ajuda no WhatsApp.",
    interno: { rotulo: "Ver meus pedidos", href: "/conta/pedidos" },
  },
  {
    id: "revenda",
    rotulo: "Comprar para revenda",
    assunto: "comprar para revenda (atacado)",
    resposta: "Ótimo! A equipe passa as condições de atacado pelo WhatsApp.",
  },
  {
    id: "orcamento",
    rotulo: "Orçamento / lista escolar",
    assunto: "fazer um orçamento",
    resposta: "Mande a lista ou os itens no WhatsApp que a gente monta o orçamento.",
  },
];

/** Dentro do horario de atendimento em Brasilia: seg a sex 9h-18h, sab 9h-12h. */
export function emAtendimento(agora: Date): boolean {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(agora)) {
    p[x.type] = x.value;
  }
  const hora = Number(p.hour) % 24;
  if (p.weekday === "Sat") return hora >= 9 && hora < 12;
  if (p.weekday === "Sun") return false;
  return hora >= 9 && hora < 18;
}

/** So pagina de produto entra na mensagem; query e hash ficam de fora. */
export function urlDoProduto(origem: string, caminho: string): string | undefined {
  return /^\/produtos\/[^/]+$/.test(caminho) ? `${origem}${caminho}` : undefined;
}

export function montarMensagemWhats(assunto: string, url?: string): string {
  const base = `Olá! Vim pelo site da ${MARCA_CHAT.nome} e quero ${assunto}.`;
  return url ? `${base} Estou vendo este produto: ${url}` : base;
}

export function linkWhatsChat(assunto: string, url?: string): string {
  return `${MARCA_CHAT.whatsapp}?text=${encodeURIComponent(montarMensagemWhats(assunto, url))}`;
}
