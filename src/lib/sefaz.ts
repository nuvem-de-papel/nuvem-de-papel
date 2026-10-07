// Transporte SEFAZ real (F8.2-realfinal) - SOMENTE servidor.
// Regras:
//   * SEFAZ_MOCK=1 (dev local/E2E): ciclo completo fake, sem rede;
//   * sem SEFAZ_A1_PFX (base64 do .pfx) + SEFAZ_A1_SENHA: FAIL-CLOSED - nunca
//     transmite sem certificado;
//   * real: mTLS (certificado A1 no TLS), assinatura RSA-SHA1/C14N envelopada
//     e SOAP 1.2 da SEFAZ. Hoje a SEFAZ-SP esta mapeada (homologacao e
//     producao); outras UFs devolvem erro claro ate o mapeamento entrar.
// A chave de acesso (44 = 43 + DV mod11) e montada aqui tambem no modo mock.
import https from "https";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import municipios from "./municipios-ibge.json";

export type ResultadoSefaz<T> = ({ ok: true } & T) | { ok: false; erro: string };

// transmitir: recibo (lote assincrono) | autorizada direto (sincrono) | rejeitada
export type Transmissao =
  | { recibo: string }
  | { autorizada: { protocolo: string; chave: string } }
  | { rejeitada: { motivo: string } };

export type Consulta =
  | { estado: "autorizada"; chave: string; protocolo: string }
  | { estado: "rejeitada"; motivo: string }
  | { estado: "em_processamento" };

export const sefazEmMock = (): boolean =>
  process.env.SEFAZ_MOCK === "1" || process.env.SEFAZ_MOCK === "true";

function pfxConfigurado(): boolean {
  return Boolean(process.env.SEFAZ_A1_PFX && process.env.SEFAZ_A1_SENHA);
}

function falhaQuebrada(acao: string): { ok: false; erro: string } {
  return {
    ok: false,
    erro:
      `${acao} bloqueada: certificado A1 não configurado no servidor (fail-closed). ` +
      `Configure SEFAZ_A1_PFX (pfx em base64) e SEFAZ_A1_SENHA.`,
  };
}

const UF_A_CUF: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53",
  ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15",
  PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43",
  RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
};

// Endpoints da SEFAZ-SP (mod55). Outras UFs: mapear quando a emitente mudar.
const ENDPOINTS: Record<string, { hom: Record<string, string>; prod: Record<string, string> }> = {
  SP: {
    hom: {
      autorizacao: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
      retAutorizacao: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
      consulta: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",
      evento: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx",
      status: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
    },
    prod: {
      autorizacao: "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
      retAutorizacao: "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
      consulta: "https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",
      evento: "https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx",
      status: "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
    },
  },
};

function endpointsPara(uf: string, ambiente: string): Record<string, string> | null {
  const mapa = ENDPOINTS[uf.toUpperCase()];
  if (!mapa) return null;
  return ambiente === "producao" ? mapa.prod : mapa.hom;
}

// Cadeia do servidor da SEFAZ-SP (AC SOLUTI SSL EV G4 + raiz ICP-Brasil v10).
// O Node nao usa o cert store do Windows; sem isto o TLS derruba com
// "unable to get local issuer certificate". Atualizar se a AC mudar.
const CA_PEM = `-----BEGIN CERTIFICATE-----
MIIHtDCCBZygAwIBAgIJANjGl6F55VD+MA0GCSqGSIb3DQEBDQUAMIGYMQswCQYDVQQGEwJCUjET
MBEGA1UECgwKSUNQLUJyYXNpbDE9MDsGA1UECww0SW5zdGl0dXRvIE5hY2lvbmFsIGRlIFRlY25v
bG9naWEgZGEgSW5mb3JtYWNhbyAtIElUSTE1MDMGA1UEAwwsQXV0b3JpZGFkZSBDZXJ0aWZpY2Fk
b3JhIFJhaXogQnJhc2lsZWlyYSB2MTAwHhcNMjMwMzIyMTgwOTExWhcNMzIwNzAxMTIwMDU5WjB3
MQswCQYDVQQGEwJCUjETMBEGA1UEChMKSUNQLUJyYXNpbDE1MDMGA1UECxMsQXV0b3JpZGFkZSBD
ZXJ0aWZpY2Fkb3JhIFJhaXogQnJhc2lsZWlyYSB2MTAxHDAaBgNVBAMTE0FDIFNPTFVUSSBTU0wg
RVYgRzQwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQDHv3KvoEPrNrzImIPn17GI5vdo
Vxghsm6EVLMUjnM4JdCpDED+0BqZF0kycyZaiWt7jqSRvcGm66RKzSGcHJlUgahp9qcXAmSwMn00
pwvgBKb+4htp48vQc1/5MWpaBzQW4Di/tWvNkh9URtMyhtltf2u3s9r5vgF12ff7mCu3oj0bDBIa
Gs/a9EtMKoCfw/ziKUp711JYu1fbIWVOgbW9iHE24oiE33LGLm+uToCWpjGL3n9D+q+ryfIYFoes
6gPCYYStudDUB9lfpe83IOVcVslL3DmYd2oEncGCogO3qzaMSH3OVLMO4Rg5edERpMw5U0tAMeyO
0k5/tmnFfUM476lZl+ce2Ol56p7R2yjKxHJizeCOSmwDE5FXz7ll+Zq9C7QWUzoPQtyT739UGEeB
RTAz4KsO77frCtdifGRvX3lMfI8qeMnfvf08BK9e2dRkCHwDiv23Aw7QIixDS9PiSsMxObgjHwro
EqAAN2Mwz1B1zAuzZVUH7k6MyQQ/II/GDUpTjT4VKnhjdIfz5aEFHx7By2XjMkx1hyeONLS/2SoD
nKitE9yY/PASqWDCPCpSoJ+xfEdyZvoawEbJfL+CMhU5I7IXgf9f7gibghIc2CG4bf6dfVAdPcGk
Ykcjw21dtq/G1V2dHpOX67BbihThAVr8Z7NTgVAv4nC6MPpAywIDAQABo4ICHzCCAhswggEHBgNV
HSAEgf8wgfwwQwYFYEwBAQAwOjA4BggrBgEFBQcCARYsaHR0cDovL2FjcmFpei5pY3BicmFzaWwu
Z292LmJyL0RQQ2FjcmFpei5wZGYwUAYGYEwBAYECMEYwRAYIKwYBBQUHAgEWOGh0dHA6Ly9jY2Qu
YWNzb2x1dGkuY29tLmJyL2RvY3MvZHBjLWFjLXNvbHV0aS1zc2wtZXYucGRmMFAGBmBMAQIBcDBG
MEQGCCsGAQUFBwIBFjhodHRwOi8vY2NkLmFjc29sdXRpLmNvbS5ici9kb2NzL2RwYy1hYy1zb2x1
dGktc3NsLWV2LnBkZjAHBgVngQwBATAIBgZngQwBAgIwQAYDVR0fBDkwNzA1oDOgMYYvaHR0cDov
L2FjcmFpei5pY3BicmFzaWwuZ292LmJyL0xDUmFjcmFpenYxMC5jcmwwHwYDVR0jBBgwFoAUdPN+
//yfU3rxfOurPqSm2hi6RWMwHQYDVR0OBBYEFP4GuSyVfi/m0Lio8S+38i6F1dfAMA8GA1UdEwEB
/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMB0GA1UdJQQWMBQGCCsGAQUFBwMBBggrBgEFBQcDAjBM
BggrBgEFBQcBAQRAMD4wPAYIKwYBBQUHMAKGMGh0dHA6Ly9hY3JhaXouaWNwYnJhc2lsLmdvdi5i
ci9JQ1AtQnJhc2lsdjEwLmNydDANBgkqhkiG9w0BAQ0FAAOCAgEAABxayeHitwL18QeXSQvRZ2ei
Nb82IlYTuvER4JRMzZDWoamKOqmD7KXSSj+sdBThYiRkkNiVFiMn2qoYAdylI2I4w1npbxyrukfX
Q7tadTEiMCFva0uHHw9lpBx+oyy9rcLM7qC5qquksyhC222Yt3WbqC6Fla+Lo3GlTOpogqexeyc9
hgvAQxeMmq+xyDcjSLzKmmRmMKQ9y3w7wpufXTO/0K5uOLLZsfyXZTw+MYYeIk2+GNv1qQBbWo3g
mwlD1W0pJEHe+/KxiCRkDHpJY7Lk2Rm4bSDZRr4Bn8bk/XJWpiu7Fm9b8piPKjTtstDYTzu40ccP
Rh9UCWDUz4nKF97dXjIgYf+aTA0vnKdlnpPUDeBVpfyXavhGf/akFh5AO7/v6xkzWOUlawn5g614
mWhOQ6ITwmuay1spnpBO684d0bynFQfMoZGS5fdKoYKKDzp29xhBm3s9WD1f/oP79Ie0eDribpOv
j3Xsjz72MTG4+UVxuv0OIYuXDc8x1foMzVOco6DxuLel6KG5RH+m0tWmX4ouCgBKTNUQC70AWHBa
4PCF5YA7H8qVnH2EUBPo3rxOY0wN6GzyMbg9+D9l5e2Xcg7/ytqYBIBnZKLPjzS3OqUsM9UgUKGw
cEnaHnmRxH8vyVEMGnoK1cZNf9uDM9sMGgQUzKwVwixwyINOM8U=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIGrDCCBJSgAwIBAgIJANLVi0S/gZNCMA0GCSqGSIb3DQEBDQUAMIGYMQswCQYDVQQGEwJCUjET
MBEGA1UECgwKSUNQLUJyYXNpbDE9MDsGA1UECww0SW5zdGl0dXRvIE5hY2lvbmFsIGRlIFRlY25v
bG9naWEgZGEgSW5mb3JtYWNhbyAtIElUSTE1MDMGA1UEAwwsQXV0b3JpZGFkZSBDZXJ0aWZpY2Fk
b3JhIFJhaXogQnJhc2lsZWlyYSB2MTAwHhcNMTkwNzAxMTkxNTU5WhcNMzIwNzAxMTIwMDU5WjCB
mDELMAkGA1UEBhMCQlIxEzARBgNVBAoMCklDUC1CcmFzaWwxPTA7BgNVBAsMNEluc3RpdHV0byBO
YWNpb25hbCBkZSBUZWNub2xvZ2lhIGRhIEluZm9ybWFjYW8gLSBJVEkxNTAzBgNVBAMMLEF1dG9y
aWRhZGUgQ2VydGlmaWNhZG9yYSBSYWl6IEJyYXNpbGVpcmEgdjEwMIICIjANBgkqhkiG9w0BAQEF
AAOCAg8AMIICCgKCAgEAk3AxKl1ZtP0pNyjChqO7qNkn+/sClZeqiV/Kd7KnnbkDbI2y3VWcUG7f
eCE/deIxot6GH6JXncRG794UZl+4doD0D0/cEwBd4DvrDSZm0RT40xhmYYOTxZDJxv+coTHdmsT5
aNmSkktfjzYX4HQHh/7Mem+kTOpT/3E4K6B7KVs9HkOT7nXx5yU1qYbVWqI0qpJM9mOTSFx8C9Hi
KcHvLCvt1ioXKPAmFuHPkayOcXP2MXeb+VRNjWKU4E+L2t5uZPKVx1M/9i1DztlLb4K8OfYgGaPD
USF1sxnoGk5qZHLleO6KjCpmuQepmgsBvxi2YNO7X2YUwQQx1AXNSolgtkAR5gt+1WzxhbFUhItQ
qlhqxgWHefLmiT5T/Ctz/P2v+zSO4efkkIzsi1iwD+ypZvM2lnIvB24RcSN6jzmCahLPX4CwjwIK
6JsSoMVxIhpZHCguUP4LXqP8IWUZ6WgS/4zB7B9E0EICl2rM1PRy+6ulv+ZOW256e8a0pijUB+hX
M1msUq9L92476FAAX8va3sP7+Uut94+bGHmubcTLImWUPrxNT7QyrvE3FyHicfiHioeFL2oV4cXT
LZrEq2wS8R4PKPdSzNn5Z9e2uMEGYQaSNO+OwvVycpIhOBOqrm12wJ9ZhWKtM5UOo34/o37r5ZBI
TYXAGbhqQDB9mWXwH+0CAwEAAaOB9jCB8zBOBgNVHSAERzBFMEMGBWBMAQEAMDowOAYIKwYBBQUH
AgEWLGh0dHA6Ly9hY3JhaXouaWNwYnJhc2lsLmdvdi5ici9EUENhY3JhaXoucGRmMEAGA1UdHwQ5
MDcwNaAzoDGGL2h0dHA6Ly9hY3JhaXouaWNwYnJhc2lsLmdvdi5ici9MQ1JhY3JhaXp2MTAuY3Js
MB8GA1UdIwQYMBaAFHTzfv/8n1N68Xzrqz6kptoYukVjMB0GA1UdDgQWBBR0837//J9TevF866s+
pKbaGLpFYzAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjANBgkqhkiG9w0BAQ0FAAOC
AgEAeCNhBSuy/Ih/T+1VOtAJju85SrtoE3vET1qXASpmjQllDHG/ph7VFNRAkC+gha+BCbjoA5oJ
/8wwl+Qdp1KGz6nXXFTLx3osU+kjm0srmBf9nyXHPqvFyvBeB0A7sYb7TmII9GKD20oCxsdkccR/
oE/JuTaNnGq0GYZ2aDb5v62uLi21Y6P9UBiTxZqQ4ojWET6kXNjlK238jpXv17FR8Sg3VusCvX7Q
8eJkavvHHZDeWck2fSA+ycAc2JeL2Z0BMSxGWpH32WM9J8+6XqCJUXHiWEV0zCE8wDYiYC+047pT
xQI/gB/FcU7jvylh98DJkQPHd/Tp6Og3ynlDA9n9uBbxYHVRZs9vsZ/7xTFaxRe+zk8dhgKgZ/3R
rcMFB5702t8LFbyuUE/kQVY6rZ0QJ9qMWQ7VPLRwRhiMeU3k8WDJb/tBbOXHBqldTbWyQ+mpMEDW
hbrzE/IED82wAuO23Tb05cYk2xC7+Izef8fSc3XdJDuPSbcDpWukzyCDtSEHisLiGEtIbYRiPsF3
czlQPsnIEVoTTCWxHCH1zYR6zScSv18Qh69qVe2J40K5jZoPGEOhq/oKhVJQAdvAFW5Odp7mF3Tk
9nivjjsctJSxY26LFiV5GRV+07SSse4ti0aOjO5PLg5SWjfcOtBG2rz02EIvQAmLcb0kGBtfdj0l
W/w=
-----END CERTIFICATE-----`;

function digitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

function semAcento(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

type Municipio = { n: string; u: string; i: number };
const LISTA_MUNICIPIOS = municipios as Municipio[];

// nome de cidade + UF -> codigo IBGE (validado pela SEFAZ em cMun)
export function resolverMunicipio(cidade: string, uf: string): number | null {
  const alvo = semAcento(cidade);
  const u = (uf ?? "").toUpperCase();
  if (!alvo || !u) return null;
  for (const m of LISTA_MUNICIPIOS) {
    if (m.u === u && semAcento(m.n) === alvo) return m.i;
  }
  for (const m of LISTA_MUNICIPIOS) {
    if (m.u === u && semAcento(m.n).startsWith(alvo)) return m.i;
  }
  return null;
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
  // tpEmis na chave = tipo de EMISSAO (1 = normal). O ambiente (tpAmb) NAO
  // entra na chave; homologacao/producao e campo do XML (ide/tpAmb).
  const tpEmis = "1";
  const cNf = String((Math.trunc(dados.numero) * 7919) % 100000000).padStart(8, "0");
  const base43 = `${cUF}${AAMM}${cnpj}${"55"}${serie}${numero}${tpEmis}${cNf}`;
  if (base43.length !== 43) return { ok: false, erro: "Falha ao montar a chave (formato interno)." };
  return { ok: true, chave: base43 + String(dvChave(base43)) };
}

// ---------------- montagem do XML (schema NF-e v4.00) -----------------------

export type ItemNfeXml = {
  sku: string;
  nome: string;
  ncm: string;
  cfop: string;
  origem: string;
  cst: string;
  qtd: number;
  unit: number;
  total: number;
  icmsPct: number;
  pisPct: number;
  cofinsPct: number;
};

export type EmitenteXml = {
  cnpj: string;
  razao_social: string;
  fantasia?: string;
  ie: string;
  regime: string; // simples | mei | normal
  telefone?: string;
  endereco: {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
  };
};

export type NotaXml = {
  numero: number;
  serie: number;
  tipo: "saida" | "entrada";
  natureza_operacao: string;
  cfop: string;
  destinatario: { nome?: string; doc?: string; endereco?: string; ie?: string };
  frete?: { modalidade?: string; valor?: number };
  itens: ItemNfeXml[];
  totais: { base?: number; icms?: number; pis?: number; cofins?: number; total?: number };
  dados_adicionais?: string | null;
};

function escXml(v: string): string {
  return String(v ?? "").replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;"
  );
}

const num2 = (v: number | undefined) => (Number(v) || 0).toFixed(2);
const num4 = (v: number | undefined) => (Number(v) || 0).toFixed(4);

// endereco do destinatario vem como texto livre do form
// "Logradouro, numero - Bairro - Cidade/UF - CEP 12345-678"
function parsearEnderecoDestino(texto: string): {
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
} | null {
  const partes = String(texto ?? "").split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (partes.length < 3) return null;

  const logNum = partes[0];
  const virgula = logNum.lastIndexOf(",");
  const logradouro = (virgula > 0 ? logNum.slice(0, virgula) : logNum).trim();
  const numero = virgula > 0 ? logNum.slice(virgula + 1).trim() : "";
  const bairro = partes[1] ?? "";

  const cidUf = partes[2] ?? "";
  const m = cidUf.match(/^(.+?)\s*\/\s*([A-Za-z]{2})$/);
  if (!m) return null;
  const cidade = m[1].trim();
  const uf = m[2].toUpperCase();

  const cepIdx = partes.findIndex((p) => /^cep/i.test(p) || /^\d{5}-?\d{3}$/.test(p));
  const cep = cepIdx >= 0 ? digitos(partes[cepIdx]) : "";
  if (cep.length !== 8) return null;

  if (!logradouro || !cidade) return null;
  return { logradouro, numero: numero || "S/N", bairro, cidade, uf, cep };
}

export function montarXmlNfe(
  n: NotaXml,
  emitente: EmitenteXml,
  chave: string,
  ambiente: string
): { ok: true; xml: string } | { ok: false; erro: string } {
  const tolerante = sefazEmMock(); // mock nunca bloqueia cadastro incompleto
  const erros: string[] = [];
  const emp = emitente.endereco ?? {};
  const cnpj = digitos(emitente.cnpj ?? "");
  const cUF = UF_A_CUF[(emp.uf ?? "").toUpperCase()] ?? "99";

  const cMunEmit = resolverMunicipio(emp.cidade ?? "", emp.uf ?? "");
  if (!cMunEmit) erros.push(`Cidade do emitente não encontrada no IBGE (${emp.cidade ?? "?"}/${emp.uf ?? "?"}).`);
  if (!emp.bairro) erros.push("Bairro do emitente não informado (Configurações → Empresa).");
  if (digitos(emp.cep ?? "").length !== 8) erros.push("CEP do emitente inválido.");
  if (!emp.logradouro || !emp.numero) erros.push("Logradouro/número do emitente não informados.");
  if (digitos(emitente.ie ?? "").length < 6) erros.push("Inscrição estadual do emitente não informada.");
  if (cnpj.length !== 14) erros.push("CNPJ do emitente inválido.");

  const dest = parsearEnderecoDestino(n.destinatario?.endereco ?? "");
  if (!dest) {
    erros.push(
      "Endereço do destinatário fora do formato esperado. Use: Logradouro, número - Bairro - Cidade/UF - CEP 12345-678."
    );
  } else if (!resolverMunicipio(dest.cidade, dest.uf)) {
    erros.push(`Cidade do destinatário não encontrada no IBGE (${dest.cidade}/${dest.uf}).`);
  }
  const docDest = digitos(n.destinatario?.doc ?? "");
  if (docDest.length !== 14 && docDest.length !== 11) {
    erros.push("Destinatário precisa de CNPJ (14) ou CPF (11) válido.");
  }

  if (!n.itens?.length) erros.push("A nota precisa de ao menos um item.");
  for (const i of n.itens ?? []) {
    if (!/^\d{8}$/.test(digitos(i.ncm)) && !tolerante) {
      erros.push(`Item "${i.nome || i.sku}" com NCM inválido (informe 8 dígitos, ex.: 49019900).`);
    }
    if (!/^\d{4}$/.test(String(i.cfop ?? ""))) {
      erros.push(`Item "${i.nome || i.sku}" com CFOP inválido.`);
    }
  }

  if (erros.length && !tolerante) return { ok: false, erro: erros[0] };

  const dt = new Date();
  const off = "-03:00";
  const dh =
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}` +
    `T${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}${off}`;

  const crt = emitente.regime === "normal" ? "3" : "1";
  const cMun = cMunEmit ?? 3550308;
  const cMunDest = (dest && resolverMunicipio(dest.cidade, dest.uf)) ?? 3550308;

  // NT 2025.002 (leiaute PL_010): grupo IBSCBS obrigatorio em 2026. Regra
  // geral (LC 214/25): CST 000 + cClassTrib 000001 (tributacao integral) e
  // aliquotas de transicao 2026 = IBS 0,1% + CBS 0,9% (por fora do vNF).
  const pIbs2026 = 0.1;
  const pCbs2026 = 0.9;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const bcIbsCbs = (n.itens ?? []).reduce((s, i) => s + r2(Number(i.total) || 0), 0);
  const vIbsTot = (n.itens ?? []).reduce((s, i) => s + r2(((Number(i.total) || 0) * pIbs2026) / 100), 0);
  const vCbsTot = (n.itens ?? []).reduce((s, i) => s + r2(((Number(i.total) || 0) * pCbs2026) / 100), 0);

  const det = (n.itens ?? [])
    .map((i, idx) => {
      const orig = escXml(String(i.origem ?? "0").padStart(1, "0"));
      // banco/UI: CST do ICMS com 3 digitos ("000"); o XSD da NF-e usa 2 ("00".."90")
      const cst3 = /^\d{3}$/.test(String(i.cst)) ? String(i.cst) : /^\d{2}$/.test(String(i.cst)) ? `0${String(i.cst)}` : "000";
      let icms: string;
      if (crt === "3") {
        const cst = cst3.slice(1);
        const pIcms = Math.min(100, Math.max(0, Number(i.icmsPct) || 0));
        const vIcms = (i.total * pIcms) / 100;
        if (cst === "00") {
          icms =
            `<ICMS><ICMS00><orig>${orig}</orig><CST>00</CST><modBC>3</modBC><vBC>${num2(i.total)}</vBC>` +
            `<pICMS>${num2(pIcms)}</pICMS><vICMS>${num2(vIcms)}</vICMS></ICMS00></ICMS>`;
        } else {
          icms = `<ICMS><ICMS90><orig>${orig}</orig><CST>${escXml(cst)}</CST><modBC>3</modBC><vBC>${num2(i.total)}</vBC>` +
            `<pICMS>${num2(pIcms)}</pICMS><vICMS>${num2(vIcms)}</vICMS></ICMS90></ICMS>`;
        }
      } else {
        // Simples Nacional: CSOSN (sem credito por padrao; ST quando CST 060)
        const csosn = cst3 === "060" ? "500" : "102";
        icms =
          csosn === "500"
            ? `<ICMS><ICMSSN500><orig>${orig}</orig><CSOSN>500</CSOSN></ICMSSN500></ICMS>`
            : `<ICMS><ICMSSN102><orig>${orig}</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>`;
      }
      const pis =
        Number(i.pisPct) > 0
          ? `<PIS><PISAliq><CST>01</CST><vBC>${num2(i.total)}</vBC><pPIS>${num2(i.pisPct)}</pPIS>` +
            `<vPIS>${num2((i.total * i.pisPct) / 100)}</vPIS></PISAliq></PIS>`
          : `<PIS><PISNT><CST>08</CST></PISNT></PIS>`;
      const cofins =
        Number(i.cofinsPct) > 0
          ? `<COFINS><COFINSAliq><CST>01</CST><vBC>${num2(i.total)}</vBC><pCOFINS>${num2(i.cofinsPct)}</pCOFINS>` +
            `<vCOFINS>${num2((i.total * i.cofinsPct) / 100)}</vCOFINS></COFINSAliq></COFINS>`
          : `<COFINS><COFINSNT><CST>08</CST></COFINSNT></COFINS>`;
      const vIbsItem = r2(((Number(i.total) || 0) * pIbs2026) / 100);
      const vCbsItem = r2(((Number(i.total) || 0) * pCbs2026) / 100);
      const ibsCbs =
        `<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS>` +
        `<vBC>${num2(i.total)}</vBC>` +
        `<gIBSUF><pIBSUF>${num2(pIbs2026)}</pIBSUF><vIBSUF>${num2(vIbsItem)}</vIBSUF></gIBSUF>` +
        `<gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun>` +
        `<vIBS>${num2(vIbsItem)}</vIBS>` +
        `<gCBS><pCBS>${num2(pCbs2026)}</pCBS><vCBS>${num2(vCbsItem)}</vCBS></gCBS>` +
        `</gIBSCBS></IBSCBS>`;
      const ncm = /^\d{8}$/.test(digitos(i.ncm)) ? digitos(i.ncm) : "49019900";
      return (
        `<det nItem="${idx + 1}"><prod><cProd>${escXml(i.sku || `ITEM${idx + 1}`)}</cProd>` +
        `<cEAN>SEM GTIN</cEAN><xProd>${escXml(i.nome)}</xProd><NCM>${ncm}</NCM>` +
        `<CFOP>${escXml(i.cfop)}</CFOP><uCom>UN</uCom><qCom>${num4(i.qtd)}</qCom>` +
        `<vUnCom>${num4(i.unit)}</vUnCom><vProd>${num2(i.total)}</vProd>` +
        `<cEANTrib>SEM GTIN</cEANTrib><uTrib>UN</uTrib><qTrib>${num4(i.qtd)}</qTrib>` +
        `<vUnTrib>${num4(i.unit)}</vUnTrib><indTot>1</indTot></prod>` +
        `<imposto>${icms}${pis}${cofins}${ibsCbs}</imposto></det>`
      );
    })
    .join("");

  const totalProd = Number(n.totais?.total) || 0;
  const freteValor = n.frete && n.frete.modalidade !== "9" ? Number(n.frete.valor) || 0 : 0;
  const vNf = totalProd + freteValor;
  const simples = crt !== "3";
  const icmsTotais = simples
    ? { vBC: 0, vICMS: 0 }
    : { vBC: Number(n.totais?.base) || 0, vICMS: Number(n.totais?.icms) || 0 };
  const pisTot = Number(n.totais?.pis) || 0;
  const cofinsTot = Number(n.totais?.cofins) || 0;

  const modFrete = /^\d$/.test(String(n.frete?.modalidade ?? "")) ? n.frete?.modalidade : "9";
  const tpNf = n.tipo === "entrada" ? "0" : "1";
  const cNf = String((Math.trunc(n.numero) * 7919) % 100000000).padStart(8, "0");
  const cDV = chave[43] ?? "0";
  const tpAmb = ambiente === "producao" ? "1" : "2";
  const fantasia = emitente.fantasia ? `<xFant>${escXml(emitente.fantasia)}</xFant>` : "";
  const fone = digitos(emitente.telefone ?? "");
  const infCpl = n.dados_adicionais ? `<infCpl>${escXml(n.dados_adicionais)}</infCpl>` : "";

  // Destinatario COM IE informada = contribuinte (indIEDest 1 + IE). Sem IE
  // = nao contribuinte (indIEDest 9). CNPJ contribuinte sem IE rejeita cStat 232.
  const ieDest = digitos(n.destinatario?.ie ?? "");
  const indIEDest = ieDest.length >= 6 ? "1" : "9";
  const indIEDestXml = `<indIEDest>${indIEDest}</indIEDest>` + (indIEDest === "1" ? `<IE>${ieDest}</IE>` : "");

  const xml =
    `<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${chave}" versao="4.00">` +
    `<ide><cUF>${cUF}</cUF><cNF>${cNf}</cNF><natOp>${escXml(n.natureza_operacao || "Venda de mercadoria")}</natOp>` +
    `<mod>55</mod><serie>${Math.trunc(n.serie)}</serie><nNF>${Math.trunc(n.numero)}</nNF>` +
    `<dhEmi>${dh}</dhEmi><tpNF>${tpNf}</tpNF><idDest>1</idDest><cMunFG>${cMun}</cMunFG>` +
    `<tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${cDV}</cDV><tpAmb>${tpAmb}</tpAmb><finNFe>1</finNFe>` +
    `<indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>NUVEM1.0</verProc></ide>` +
    `<emit><CNPJ>${cnpj}</CNPJ><xNome>${escXml(emitente.razao_social)}</xNome>${fantasia}` +
    `<enderEmit><xLgr>${escXml(emp.logradouro ?? "")}</xLgr><nro>${escXml(emp.numero ?? "S/N")}</nro>` +
    (emp.complemento ? `<xCpl>${escXml(emp.complemento)}</xCpl>` : "") +
    `<xBairro>${escXml(emp.bairro ?? "")}</xBairro><cMun>${cMun}</cMun>` +
    `<xMun>${escXml(emp.cidade ?? "")}</xMun><UF>${escXml((emp.uf ?? "").toUpperCase())}</UF>` +
    `<CEP>${digitos(emp.cep ?? "")}</CEP><cPais>1058</cPais><xPais>Brasil</xPais>` +
    (fone ? `<fone>${fone}</fone>` : "") +
    `</enderEmit><IE>${escXml(digitos(emitente.ie ?? ""))}</IE><CRT>${crt}</CRT></emit>` +
    `<dest>` +
    (docDest.length === 14 ? `<CNPJ>${docDest}</CNPJ>` : `<CPF>${docDest}</CPF>`) +
    // Regra SEFAZ em homologacao: xNome do destinatario DEVE ser o literal
    // "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" (cStat 598).
    `<xNome>${escXml(ambiente === "producao" ? n.destinatario?.nome || "Consumidor" : "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL")}</xNome>` +
    `<enderDest><xLgr>${escXml(dest?.logradouro ?? "")}</xLgr><nro>${escXml(dest?.numero ?? "S/N")}</nro>` +
    `<xBairro>${escXml(dest?.bairro ?? "")}</xBairro><cMun>${cMunDest}</cMun>` +
    `<xMun>${escXml(dest?.cidade ?? "")}</xMun><UF>${escXml(dest?.uf ?? (emp.uf ?? "").toUpperCase())}</UF>` +
    `<CEP>${dest?.cep ?? ""}</CEP><cPais>1058</cPais><xPais>Brasil</xPais></enderDest>` +
    `${indIEDestXml}</dest>` +
    det +
    `<total><ICMSTot><vBC>${num2(icmsTotais.vBC)}</vBC><vICMS>${num2(icmsTotais.vICMS)}</vICMS>` +
    `<vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST>` +
    `<vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${num2(totalProd)}</vProd>` +
    `<vFrete>${num2(freteValor)}</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII>` +
    `<vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>${num2(pisTot)}</vPIS>` +
    `<vCOFINS>${num2(cofinsTot)}</vCOFINS><vOutro>0.00</vOutro><vNF>${num2(vNf)}</vNF></ICMSTot>` +
    `<IBSCBSTot><vBCIBSCBS>${num2(bcIbsCbs)}</vBCIBSCBS>` +
    `<gIBS><gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>${num2(vIbsTot)}</vIBSUF></gIBSUF>` +
    `<gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>0.00</vIBSMun></gIBSMun>` +
    `<vIBS>${num2(vIbsTot)}</vIBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gIBS>` +
    `<gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>${num2(vCbsTot)}</vCBS>` +
    `<vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gCBS>` +
    `</IBSCBSTot></total>` +
    `<transp><modFrete>${escXml(String(modFrete))}</modFrete></transp>` +
    `<pag><detPag><tPag>01</tPag><vPag>${num2(vNf)}</vPag></detPag></pag>` +
    (infCpl ? `<infAdic>${infCpl}</infAdic>` : "") +
    `</infNFe></NFe></nfeProc>`;

  return { ok: true, xml };
}

// ---------------- assinatura e transporte (mTLS + SOAP 1.2) -----------------

let tlsCache: { chavePem: string; certPem: string } | null = null;

function carregarCertificado(): { chavePem: string; certPem: string } {
  if (tlsCache) return tlsCache;
  const b64 = process.env.SEFAZ_A1_PFX ?? "";
  const senha = process.env.SEFAZ_A1_SENHA ?? "";
  let der: Buffer;
  try {
    der = Buffer.from(b64, "base64");
    if (der.length < 100) throw new Error("base64 curto");
  } catch {
    throw new Error("SEFAZ_A1_PFX não é um .pfx válido em base64.");
  }
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString("latin1")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha);
  const bags = p12.getBags({ bagType: "1.2.840.113549.1.12.10.1.2" }); // pkcs8ShroudedKeyBag
  const keyBags = bags["1.2.840.113549.1.12.10.1.2"] ?? bags["1.2.840.113549.1.12.10.1.1"];
  const key = keyBags?.[0]?.key;
  if (!key) throw new Error("Chave privada não encontrada no SEFAZ_A1_PFX.");
  const certBags = p12.getBags({ bagType: "1.2.840.113549.1.12.10.1.3" })["1.2.840.113549.1.12.10.1.3"];
  const leaf = certBags?.[0]?.cert;
  if (!leaf) throw new Error("Certificado não encontrado no SEFAZ_A1_PFX.");
  tlsCache = {
    chavePem: forge.pki.privateKeyToPem(key),
    // KeyInfo da assinatura aceita UM cert (schema da NF-e): so o leaf.
    certPem: forge.pki.certificateToPem(leaf),
  };
  return tlsCache;
}

function assinarXml(xml: string, apenasNfe: boolean): string {
  const { chavePem, certPem } = carregarCertificado();
  const alvo = apenasNfe ? "infNFe" : "infEvento";
  const sig = new SignedXml({
    privateKey: chavePem,
    publicCert: certPem,
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  });
  sig.addReference({
    xpath: `//*[local-name(.)='${alvo}']`,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });
  sig.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='${alvo}']`, action: "after" },
  });
  return sig.getSignedXml();
}

function soap(url: string, dadosXml: string, nsMetodo: string, metodo: string): Promise<string> {
  const tls = carregarCertificado();
  const u = new URL(url);
  const action = `http://www.portalfiscal.inf.br/nfe/wsdl/${nsMetodo}/${metodo}`;
  const body =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${nsMetodo}">${dadosXml}</nfeDadosMsg>` +
    `</soap12:Body></soap12:Envelope>`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        key: tls.chavePem,
        cert: tls.certPem,
        ca: CA_PEM,
        rejectUnauthorized: true,
        timeout: 45000,
        headers: {
          "Content-Type": `application/soap+xml;charset=UTF-8;action="${action}"`,
          SOAPAction: `"${action}"`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`SEFAZ respondeu HTTP ${res.statusCode}.`));
          } else resolve(data);
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("Tempo esgotado aguardando a SEFAZ."));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function campo(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return m ? m[1] : null;
}

function bloco(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`));
  return m ? m[0] : null;
}

// ---------------- ações públicas -------------------------------------------

export async function transmitirNfe(dados: {
  chave: string;
  xml: string;
  ambiente: string;
  uf: string;
}): Promise<ResultadoSefaz<Transmissao>> {
  if (sefazEmMock()) {
    return { ok: true, recibo: `MOCK${dados.chave.slice(-12)}` };
  }
  if (!pfxConfigurado()) return falhaQuebrada("Transmissão");

  const eps = endpointsPara(dados.uf, dados.ambiente);
  if (!eps) {
    return { ok: false, erro: `UF "${dados.uf}" ainda não tem web services mapeados na integração.` };
  }

  let nfe: string;
  try {
    // Assina o XML COMPLETO (nfeProc) para que infNFe herde o namespace
    // xmlns="http://www.portalfiscal.inf.br/nfe" no c14n - recortar antes de
    // assinar muda o contexto do digest e a SEFAZ rejeita com cStat 297.
    // So depois de assinar recortamos <NFe>...</NFe> para o enviNFe.
    const assinada = assinarXml(dados.xml, true);
    const i = assinada.indexOf("<NFe");
    const j = assinada.lastIndexOf("</NFe>") + "</NFe>".length;
    if (i < 0 || j < 6) throw new Error("NFe ausente no XML.");
    nfe = assinada.slice(i, j);
  } catch (e) {
    return { ok: false, erro: `Falha ao assinar a NF-e: ${(e as Error).message}` };
  }

  const envi =
    `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
    `<idLote>1</idLote><indSinc>1</indSinc>${nfe}</enviNFe>`;

  let resp: string;
  try {
    resp = await soap(eps.autorizacao, envi, "NFeAutorizacao4", "nfeAutorizacaoLote");
  } catch (e) {
    return { ok: false, erro: `Falha na transmissão à SEFAZ: ${(e as Error).message}` };
  }

  const prot = bloco(resp, "infProt");
  if (prot) {
    const cStat = campo(prot, "cStat") ?? "";
    const motivo = campo(prot, "xMotivo") ?? "Rejeição sem motivo.";
    if (cStat === "100" || cStat === "150") {
      const nProt = campo(prot, "nProt") ?? "";
      const chNFe = campo(prot, "chNFe") ?? dados.chave;
      if (nProt) return { ok: true, autorizada: { protocolo: nProt, chave: chNFe } };
    }
    if (cStat && cStat !== "104" && cStat !== "105") {
      return { ok: true, rejeitada: { motivo: `(${cStat}) ${motivo}` } };
    }
  }

  const nRec = campo(resp, "nRec");
  if (nRec) return { ok: true, recibo: nRec };

  const cStat = campo(resp, "cStat") ?? "?";
  return { ok: false, erro: `Resposta inesperada da SEFAZ (cStat ${cStat}): ${campo(resp, "xMotivo") ?? ""}` };
}

export async function consultarNfe(
  recibo: string,
  chave: string,
  ambiente: string,
  uf: string
): Promise<ResultadoSefaz<Consulta>> {
  if (sefazEmMock()) {
    // mock autoriza direto (deterministico para o E2E)
    return { ok: true, estado: "autorizada", chave, protocolo: `135${recibo.slice(0, 12).padEnd(12, "0")}` };
  }
  if (!pfxConfigurado()) return falhaQuebrada("Consulta");

  const eps = endpointsPara(uf, ambiente);
  if (!eps) return { ok: false, erro: `UF "${uf}" ainda não tem web services mapeados na integração.` };

  const cons =
    `<consReciNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
    `<tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb><nRec>${escXml(recibo)}</nRec></consReciNFe>`;

  let resp: string;
  try {
    resp = await soap(eps.retAutorizacao, cons, "NFeRetAutorizacao4", "nfeRetAutorizacaoLote");
  } catch (e) {
    return { ok: false, erro: `Falha na consulta à SEFAZ: ${(e as Error).message}` };
  }

  const cStatLote = campo(resp, "cStat") ?? "";
  const prot = bloco(resp, "infProt");
  if (prot) {
    const cStat = campo(prot, "cStat") ?? "";
    const motivo = campo(prot, "xMotivo") ?? "";
    if (cStat === "100" || cStat === "150") {
      return {
        ok: true,
        estado: "autorizada",
        chave: campo(prot, "chNFe") ?? chave,
        protocolo: campo(prot, "nProt") ?? "",
      };
    }
    if (cStat) return { ok: true, estado: "rejeitada", motivo: `(${cStat}) ${motivo}` };
  }
  if (cStatLote === "105") return { ok: true, estado: "em_processamento" };
  return { ok: false, erro: `Resposta inesperada da SEFAZ (cStat ${cStatLote}).` };
}

export async function cancelarEvento(dados: {
  chave: string;
  ambiente: string;
  motivo: string;
  protocolo: string;
  uf: string;
  cnpjEmitente: string;
}): Promise<ResultadoSefaz<{ protocolo: string }>> {
  if (sefazEmMock()) {
    return { ok: true, protocolo: `MOCKCANCEL${dados.chave.slice(-8)}` };
  }
  if (!pfxConfigurado()) return falhaQuebrada("Cancelamento");
  if (!dados.protocolo) return { ok: false, erro: "Cancelamento exige o protocolo de autorização." };

  const eps = endpointsPara(dados.uf, dados.ambiente);
  if (!eps) return { ok: false, erro: `UF "${dados.uf}" ainda não tem web services mapeados na integração.` };

  const justificativa = String(dados.motivo ?? "").trim();
  if (justificativa.length < 15) {
    return { ok: false, erro: "Justificativa de cancelamento precisa de ao menos 15 caracteres." };
  }

  const dt = new Date();
  const off = "-03:00";
  const dh =
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}` +
    `T${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}${off}`;
  const cUF = UF_A_CUF[(dados.uf ?? "").toUpperCase()] ?? "99";
  const cnpj = digitos(dados.cnpjEmitente);
  // Regra de formacao do Id: "ID" + tpEvento + chave(44) + nSeqEvento(2) = 52
  // digitos (pattern ID[0-9]{52}). O elemento nSeqEvento fica "1".
  const idEvento = `ID110111${dados.chave}01`;

  const evento =
    `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="${idEvento}">` +
    `<cOrgao>${cUF}</cOrgao><tpAmb>${dados.ambiente === "producao" ? "1" : "2"}</tpAmb>` +
    `<CNPJ>${cnpj}</CNPJ><chNFe>${dados.chave}</chNFe><dhEvento>${dh}</dhEvento>` +
    `<tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00"><descEvento>Cancelamento</descEvento>` +
    `<nProt>${escXml(dados.protocolo)}</nProt><xJust>${escXml(justificativa)}</xJust></detEvento>` +
    `</infEvento></evento>`;

  let assinado: string;
  try {
    assinado = assinarXml(evento, false);
  } catch (e) {
    return { ok: false, erro: `Falha ao assinar o evento: ${(e as Error).message}` };
  }

  const envEvento =
    `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
    `<idLote>1</idLote>${assinado}</envEvento>`;

  let resp: string;
  try {
    resp = await soap(eps.evento, envEvento, "NFeRecepcaoEvento4", "nfeRecepcaoEvento");
  } catch (e) {
    return { ok: false, erro: `Falha no cancelamento na SEFAZ: ${(e as Error).message}` };
  }

  const retEvento = bloco(resp, "infEvento");
  const cStat = campo(retEvento ?? resp, "cStat") ?? "?";
  const motivo = campo(retEvento ?? resp, "xMotivo") ?? "";
  if (cStat === "135" || cStat === "136") {
    return { ok: true, protocolo: campo(retEvento ?? "", "nProt") || `EVENTO${cStat}` };
  }
  return { ok: false, erro: `Cancelamento recusado (cStat ${cStat}): ${motivo}` };
}
