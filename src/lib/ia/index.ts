// Adaptador único de IA (entrega 5 "Catálogo com IA").
//
// Desenhei como PONTO ÚNICO de plugue: quem chama usa `gerarTexto(prompt)` e
// não sabe qual provedor está por trás. Hoje só o Gemini está ligado (chave do
// cliente, 19/10/2026). Pra acrescentar OpenAI/Claude no futuro é só criar o
// arquivo do provedor e uma linha no switch — sem refazer quem chama.
//
// Provedor escolhido por env IA_PROVEDOR (padrão "gemini"). Chave/modelo nas
// envs do provedor (GEMINI_API_KEY / GEMINI_MODEL). NUNCA commitar chave.
// Contrato best-effort: sempre resolve (nunca lança), devolvendo
// { ok, texto | motivo } — o chamador (server action) decide o que fazer.

import { gerarComGemini } from "./gemini";

export type ResultadoIA = { ok: true; texto: string } | { ok: false; motivo: string };

export async function gerarTexto(prompt: string): Promise<ResultadoIA> {
  const provedor = (process.env.IA_PROVEDOR ?? "gemini").trim().toLowerCase();

  switch (provedor) {
    case "gemini":
      return gerarComGemini(prompt);
    default:
      return { ok: false, motivo: `provedor_nao_implementado:${provedor}` };
  }
}
