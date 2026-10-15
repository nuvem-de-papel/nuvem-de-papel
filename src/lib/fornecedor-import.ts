// fornecedor-import.ts - importador de cadastro de produto por link do
// fornecedor (Reval/Tilibra). Bloco 2, regra 14/10/2026 (staging primeiro).
//
// Por que aqui e nao no browser: o fetch roda no SERVIDOR (Node), que nao
// sofre CORS - o browser bloquearia a chamada pro site deles. O form cola o
// link, a server action busca, parseia e devolve JSON ja preenchido.
//
// Por que regex e nao cheerio: a pagina do Reval e ASP.NET WebForms server-
// rendered (sem JavaScript) e a tabela de caracteristicas e FIXA
// (<th class="label">X</th><td class="data">Y</td>). Entao bate um regex
// simples por cima do HTML cru - sem dependencia nova, sem navegador
// headless. Parser DEFENSIVO: campo que nao vier vira null e nao quebra o
// resto (o Reval pode mudar o HTML a qualquer momento).
//
// O unico campo que NAO vem e o PRECO ("faca login" - restrito a login de
// CNPJ). Peso e dimensoes vem POR EMBALAGEM e por MASTER; o peso UNITARIO se
// calcula (peso emb / qtd emb = 1,39 / 4 = 0,3475 kg/un).

export type ProdutoFornecedor = {
  // identificacao
  codigo: string | null;          // 114148 (codigo do fornecedor)
  refFabricante: string | null;   // 354945 (ref Tilibra)
  nome: string | null;            // "Agenda 2027 Spice..."
  categoria: string | null;       // breadcrumb: "Papelaria e Escritorio"
  fornecedor: string | null;      // "TILIBRA"
  fabricante: string | null;      // derivado do fornecedor
  descricao: string | null;       // detalhes livres (capa dura, 160 fls...)

  // fiscal
  ncm: string | null;             // 48201000
  cest: string | null;            // 1902000
  origem: string | null;          // "NACIONAL" -> 0 / "IMPORTADO" -> 1
  gtinUnitario: string | null;    // 7891027354947 (venda/unidade)
  gtinEmbalagem: string | null;   // 7891027019150 (PCT.C/04)
  gtinMaster: string | null;      // 17891027354944 (DUN-14)

  // embalagem / logistica (cm e kg, como vem do site)
  embalagem: string | null;       // "PCT.C/04"
  qtdEmbalagem: number | null;    // 4
  qtdMaster: number | null;       // 5
  pesoEmbalagemKg: number | null; // 1,39
  embComprimentoCm: number | null;
  embAlturaCm: number | null;
  embLarguraCm: number | null;
  pesoMasterKg: number | null;    // 7,22
  masterComprimentoCm: number | null;
  masterAlturaCm: number | null;
  masterLarguraCm: number | null;

  // derivados (nao vem do site - calculados aqui)
  pesoUnitarioKg: number | null;  // pesoEmbalagem / qtdEmbalagem
};

// limites de rede: nao vale bater no site deles pra sempre (o form usa cache
// por SKU; aqui a gente so limita o tamanho e o tempo da resposta).
const MAX_HTML = 2_000_000; // 2 MB - pagina de produto real fica < 200 KB
const TIMEOUT_MS = 12_000;

const UA_NAVEGADOR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// aceita so link do Reval (host conhecido) - nada de SSRF apontando pra
// rede interna ou pra qualquer site aleatorio.
export function ehLinkReval(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return host === "reval.net" || host.endsWith(".reval.net");
}

// numero brasileiro: "1,39" -> 1.39 | "21,5" -> 21.5 | "1.234,50" -> 1234.5
function numBr(v: string | null): number | null {
  if (!v) return null;
  const limpo = v.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

// inteiro a partir de embalagem tipo "PCT.C/04" -> 4 (usado como fallback
// quando o site nao traz a qtd explicita).
function qtdDeEmbalagem(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/(\d+)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

// remove tags de HTML, entidades e espacos sobrando - o valor vem como
// "<span class=...>48201000</span>" e a gente quer so "48201000".
function textoLimpo(v: string | null): string | null {
  if (!v) return null;
  const t = v
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 0 ? t : null;
}

// chave de busca sem acento/caixa - o HTML real do Reval traz "Código de
// Barras" acentuado, mas um template ou cache pode vir sem. Normalizar evita
// lookup exato quebrando por causa de acento so.
function chaveNormal(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// extrai <title>, <h1> e o breadcrumb por regex. Defensivo: se nao achar,
// devolve null.
function extrairTitulo(html: string): string | null {
  const m = html.match(/<h1[^>]*class="[^"]*product-name[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
    ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return textoLimpo(m?.[1] ?? null);
}

function extrairBreadcrumb(html: string): string | null {
  // nav de breadcrumb: <li><a href="/">Papelaria e Escritorio</a></li>
  const m = html.match(/<nav[^>]*breadcrumb[^>]*>([\s\S]*?)<\/nav>/i);
  if (!m) return null;
  const links = [...m[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((a) => textoLimpo(a[1]))
    .filter((x): x is string => !!x && x.toLowerCase() !== "inicio");
  // devolve o PRIMEIRO nivel util (a categoria de 1o nivel, ex. "Papelaria e
  // Escritorio") - e o que vira catalog_items.category no nosso form.
  return links[0] ?? null;
}

// a tabela de caracteristicas e fixa: <th class="label">X</th><td class="data">Y</td>
function extrairTabela(html: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const re = /<th[^>]*class="[^"]*label[^"]*"[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*class="[^"]*data[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
  for (const m of html.matchAll(re)) {
    const chave = textoLimpo(m[1]);
    const valor = textoLimpo(m[2]);
    if (chave && valor) mapa.set(chaveNormal(chave), valor);
  }
  return mapa;
}

// os detalhes vem como pares "Capa: dura" - guardamos como texto corrido
// (uma linha por par) pra exibir no form sem virar json de cubagem. O marcador
// "Detalhes do Produto" e seguido de <ul><li>...</li></ul>; nao exigimos um
// terminador fixo (a pagina pode terminar ali), so pegamos os <li> ate 4000
// chars depois do marcador.
function extrairDetalhes(html: string): string | null {
  const marc = html.search(/Detalhes do\s*Produto/i);
  if (marc < 0) return null;
  const trecho = html.slice(marc, marc + 4000);
  const linhas = [...trecho.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((li) => textoLimpo(li[1]))
    .filter(Boolean);
  return linhas.length > 0 ? linhas.join("\n") : null;
}

// "NACIONAL" -> "0", "IMPORTADA"/"IMPORTADO" -> "1", resto -> null
function origemCodigo(v: string | null): string | null {
  if (!v) return null;
  const t = v.toUpperCase();
  if (t.includes("NACIONAL")) return "0";
  if (t.includes("IMPORT")) return "1";
  return null;
}

// vira um DUN-14 (14 dig) no GTIN-13 correspondente? NAO - o DV do DUN-14 e
// proprio. Aqui so normalizamos: se vier 14 dig, mantem 14 (o banco tem o
// dun14_dv_valido); se vier 8/13, mantem.
function normalizaGtin(v: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  if (/^[0-9]{8}$/.test(d) || /^[0-9]{13}$/.test(d) || /^[0-9]{14}$/.test(d)) return d;
  return null;
}

// ---------------------------------------------------------------- parse ---
// funcao PURA (sem rede) - exportada pra ser testada com fixture HTML offline
// (o E2E nao deve depender da rede do Reval, que pode cair/mudar).
export function parsePaginaReval(html: string, urlOrigem: string): ProdutoFornecedor {
  const tab = extrairTabela(html);
  const get = (...chaves: string[]) => {
    for (const c of chaves) {
      const v = tab.get(chaveNormal(c));
      if (v) return v;
    }
    return null;
  };

  const embalagem = get("Embalagem", "Embalagem de Venda");
  const qtdEmb = numBr(get("Qtd. Embalagem")) ?? qtdDeEmbalagem(embalagem);
  const pesoEmb = numBr(get("Peso (kg)", "Peso Embalagem (kg)", "Peso"));

  const codigo = get("Código", "Codigo", "Código do Produto") ?? extrairCodigoDaUrl(urlOrigem);

  return {
    codigo,
    refFabricante: get("Ref.", "Ref. Fabricante", "Referência", "Referencia"),
    nome: extrairTitulo(html),
    categoria: extrairBreadcrumb(html),
    fornecedor: get("Fornecedor", "Fabricante"),
    fabricante: get("Fabricante", "Fornecedor"),
    descricao: extrairDetalhes(html),

    ncm: normalizaDigitos(get("NCM"), 8),
    cest: normalizaDigitos(get("CEST"), 7),
    origem: origemCodigo(get("Origem")),
    gtinUnitario: normalizaGtin(get("Código de Barras Unitário", "Codigo de Barras Unitario", "Código de Barras")),
    gtinEmbalagem: normalizaGtin(get("Código de Barras Embalagem", "Cód. Barras Embalagem", "Código de Barras")),
    gtinMaster: normalizaGtin(get("Código de Barras Master", "Cod. Barras Master", "GTIN Master")),

    embalagem,
    qtdEmbalagem: qtdEmb,
    qtdMaster: numBr(get("Embalagem Master", "Qtd. Master")),
    pesoEmbalagemKg: pesoEmb,
    embComprimentoCm: numBr(get("Comp. Emb. (cm)", "Comprimento Embalagem (cm)")),
    embAlturaCm: numBr(get("Alt. Emb. (cm)", "Altura Embalagem (cm)")),
    embLarguraCm: numBr(get("Larg. Emb. (cm)", "Largura Embalagem (cm)")),
    pesoMasterKg: numBr(get("Peso Master (kg)", "Peso Master")),
    masterComprimentoCm: numBr(get("Comp. Master (cm)", "Comprimento Master (cm)")),
    masterAlturaCm: numBr(get("Alt. Master (cm)", "Altura Master (cm)")),
    masterLarguraCm: numBr(get("Larg. Master (cm)", "Largura Master (cm)")),

    // derivado: peso UNITARIO = peso embalagem / qtd por embalagem
    pesoUnitarioKg:
      pesoEmb && qtdEmb && qtdEmb > 0
        ? Math.round((pesoEmb / qtdEmb) * 1000) / 1000
        : null,
  };
}

function normalizaDigitos(v: string | null, tamanho: number): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  return d.length === tamanho ? d : null;
}

// ".../produto/114148" -> "114148" (fallback quando a tabela nao traz o codigo)
function extrairCodigoDaUrl(url: string): string | null {
  const m = url.match(/(\d{4,10})\/?$/);
  return m?.[1] ?? null;
}

// ------------------------------------------------------------- fetch ------
// busca a pagina no servidor (sem CORS) e devolve o objeto parseado.
// erro = null quando deu certo; a mensagem e amigavel pro form.
export async function importarProdutoReval(
  url: string
): Promise<{ ok: true; produto: ProdutoFornecedor } | { ok: false; erro: string }> {
  if (!ehLinkReval(url)) {
    return { ok: false, erro: "Link inválido: cole um endereço do Reval (https://...reval.net/...)." };
  }

  let resp: Response;
  try {
    resp = await fetch(url.trim(), {
      headers: {
        // UA de browser - site deles bloqueia UA de bot/undici
        "User-Agent": UA_NAVEGADOR,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, erro: "Não consegui acessar o link do Reval (rede ou site fora do ar)." };
  }

  if (!resp.ok) {
    return { ok: false, erro: `O site do Reval respondeu ${resp.status} para este link.` };
  }

  const html = (await resp.text()).slice(0, MAX_HTML);
  const produto = parsePaginaReval(html, url);

  // pelo menos o nome ou o codigo precisa vir - se nao, o link nao e de
  // produto (e de busca/home) e a gente avisa em vez de gravar lixo.
  if (!produto.nome && !produto.codigo) {
    return { ok: false, erro: "Não encontrei dados de produto nesta página (confira se é o link direto do item)." };
  }

  return { ok: true, produto };
}
