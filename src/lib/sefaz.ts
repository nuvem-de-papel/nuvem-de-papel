// Transporte SEFAZ (F8.2) - SOMENTE servidor ("use server" fica na action).
// Regras:
//   * SEFAZ_MOCK=1 (dev local/E2E): ciclo completo fake - transmitir devolve
//     recibo, consultar devolve autorizada com chave de 44 digitos valida;
//   * producao sem credencial (SEFAZ_A1_PFX/SEFAZ_A1_SENHA + SEFAZ_CSC_ID/
//     SEFAZ_CSC_TOKEN): FAIL-CLOSED - nunca emite nota real sem A1+CSC;
//   * com credencial: a integracao real (transmissao SOAP/REST da SEFAZ) e
//     ativada na entrega do certificado A1 (bloco F8.2-realfinal).
// A chave de acesso (44 = 43 + DV mod11) e montada aqui tambem no modo
// mock, para o E2E validar o formato.

export type ResultadoSefaz<T> = ({ ok: true } & T) | { ok: false; erro: string };

export type Transmissao = { recibo: string };
export type Consulta =
  | { estado: "autorizada"; chave: string; protocolo: string }
  | { estado: "rejeitada"; motivo: string }
  | { estado: "em_processamento" };

const mockAtivo = (): boolean => process.env.SEFAZ_MOCK === "1" || process.env.SEFAZ_MOCK === "true";

function credencialCompleta(): boolean {
  return Boolean(
    process.env.SEFAZ_A1_PFX &&
      process.env.SEFAZ_A1_SENHA &&
      process.env.SEFAZ_CSC_ID &&
      process.env.SEFAZ_CSC_TOKEN
  );
}

const UF_A_CUF: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53",
  ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15",
  PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43",
  RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
};

function digitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

// DV da chave de acesso: modulo 11 com pesos 2..9 da direita para a esquerda.
function dvChave(chave43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return dv >= 10 ? 0 : dv;
}

export function montarChave44(dados: {
  uf: string;
  serie: number;
  numero: number;
  ambiente: string;
  cnpjEmitente: string;
}): { ok: true; chave: string } | { ok: false; erro: string } {
  const cnpj = digitos(dados.cnpjEmitente);
  if (cnpj.length !== 14) return { ok: false, erro: "Emitente precisa de CNPJ de 14 digitos." };
  const cUF = UF_A_CUF[dados.uf] ?? "99";
  const agora = new Date();
  const AAMM = String(agora.getUTCFullYear()).slice(2) + String(agora.getUTCMonth() + 1).padStart(2, "0");
  const serie = String(Math.trunc(dados.serie)).padStart(3, "0");
  const numero = String(Math.trunc(dados.numero)).padStart(9, "0");
  const tpEmis = dados.ambiente === "producao" ? "1" : "2"; // 2 = homologacao
  // codigo numerico deterministico por nota (mesma nota => mesma chave)
  const cNf = String((Math.trunc(dados.numero) * 7919) % 100000000).padStart(8, "0");
  const base43 = `${cUF}${AAMM}${cnpj}${"55"}${serie}${numero}${tpEmis}${cNf}`;
  if (base43.length !== 43) return { ok: false, erro: "Falha ao montar a chave (formato interno)." };
  return { ok: true, chave: base43 + String(dvChave(base43)) };
}

export async function transmitirNfe(dados: {
  chave: string;
  xml: string;
  ambiente: string;
}): Promise<ResultadoSefaz<Transmissao>> {
  if (mockAtivo()) {
    return { ok: true, recibo: `MOCK${dados.chave.slice(-12)}` };
  }
  if (!credencialCompleta()) {
    return {
      ok: false,
      erro:
        "Transmissão bloqueada: certificado A1 e/ou CSC não configurados no servidor (fail-closed). " +
        "Configure SEFAZ_A1_PFX, SEFAZ_A1_SENHA, SEFAZ_CSC_ID e SEFAZ_CSC_TOKEN.",
    };
  }
  return {
    ok: false,
    erro: "Integração real da SEFAZ será ativada na entrega do certificado A1 (F8.2-realfinal).",
  };
}

export async function consultarNfe(
  recibo: string,
  chave: string
): Promise<ResultadoSefaz<Consulta>> {
  if (mockAtivo()) {
    // mock autoriza direto (deterministico para o E2E)
    return { ok: true, estado: "autorizada", chave, protocolo: `135${recibo.slice(0, 12).padEnd(12, "0")}` };
  }
  if (!credencialCompleta()) {
    return { ok: false, erro: "Consulta bloqueada: certificado A1 e/ou CSC não configurados (fail-closed)." };
  }
  return { ok: false, erro: "Integração real da SEFAZ será ativada na entrega do certificado A1." };
}

export async function cancelarEvento(dados: {
  chave: string;
  ambiente: string;
  motivo: string;
}): Promise<ResultadoSefaz<{ protocolo: string }>> {
  if (mockAtivo()) {
    return { ok: true, protocolo: `MOCKCANCEL${dados.chave.slice(-8)}` };
  }
  if (!credencialCompleta()) {
    return {
      ok: false,
      erro: "Cancelamento bloqueado: certificado A1 e/ou CSC não configurados (fail-closed).",
    };
  }
  return { ok: false, erro: "Integração real da SEFAZ será ativada na entrega do certificado A1." };
}
