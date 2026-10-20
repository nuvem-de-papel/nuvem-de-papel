// Implementação Gemini (Google AI) do adaptador de IA.
// Chave/modelo em Secrets (.env): GEMINI_API_KEY, GEMINI_MODEL.
// O campo x-goog-api-key autentica; contents leva o prompt pronto.
// Best-effort: qualquer falha vira { ok:false, motivo } — quem chama decide.

import type { ResultadoIA } from "./index";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export async function gerarComGemini(prompt: string): Promise<ResultadoIA> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) return { ok: false, motivo: "gemini_sem_chave" };

  // Default = modelo de produção decidido em 20/10 (cota padrão); o 3.8-flash free
  // tem só 20 req/dia por projeto e estoura em uso real. Troca = env GEMINI_MODEL.
  const modelo = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  try {
    const resp = await fetch(`${ENDPOINT}/${modelo}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      // carta/JSON longo demora mais que uma descrição simples — 60s de folga
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      let detalhe = `http_${resp.status}`;
      try {
        const err = (await resp.json()) as { error?: { message?: string } };
        if (err.error?.message) detalhe = err.error.message.slice(0, 200);
      } catch {
        /* corpo não era JSON */
      }
      return { ok: false, motivo: detalhe };
    }

    const data = (await resp.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!texto) return { ok: false, motivo: "gemini_vazio" };
    return { ok: true, texto };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 200) : "gemini_erro" };
  }
}
