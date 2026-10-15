/* Teste OFFLINE do parser do importador Reval (Bloco 2, 0031).
 * NAO depende da rede do fornecedor: transpila o TS pra um .cjs temporario e
 * roda contra um FIXTURE HTML colado aqui (mesma estrutura do site real -
 * ASP.NET WebForms server-rendered, tabela fixa <th class=label>/<td class=data>).
 * Rode: node e2e/produto-import.cjs   (node puro, sem browser, sem servidor).
 * Cobre: todos os campos mapeados, DUN-14 do master, peso unitario calculado,
 * rejeicao de host que nao e do Reval, e parser defensivo (pagina quebrada
 * nao explode - vira null). */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const resultados = [];
function check(nome, cond, detalhe = "") {
  resultados.push({ ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"} - ${nome}${detalhe ? " | " + detalhe : ""}`);
}

// --- transpila o parser TS pra CJS num temp dir ------------------------------
const tmp = path.join(__dirname, "..", ".tmp-parser");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
try {
  execSync(
    `npx tsc src/lib/fornecedor-import.ts --outDir "${tmp}" --module commonjs ` +
      `--target es2020 --moduleResolution node --skipLibCheck --esModuleInterop`,
    { cwd: path.join(__dirname, ".."), stdio: "pipe" }
  );
  var mod = require(path.join(tmp, "fornecedor-import.js"));
} catch (e) {
  console.error("Falha ao transpilar o parser:", e.message || e);
  process.exit(1);
}

const { parsePaginaReval, ehLinkReval } = mod;

// --- fixture: copia fiel da estrutura do Reval p/ o produto 114148 -----------
const FIXTURE = `
<!doctype html><html><head><title>Agenda 2027 Spice Girls A5 Capa Dura - Reval</title></head>
<body>
<nav class="breadcrumb">
  <ul>
    <li><a href="/">Inicio</a></li>
    <li><a href="/papelaria">Papelaria e Escritorio</a></li>
    <li><a href="/papelaria/agendas">Agendas</a></li>
  </ul>
</nav>
<h1 class="product-name">Agenda 2027 Spice Girls A5 Capa Dura 160 Fls Sortidas - Tilibra</h1>
<table id="product-attribute-specs-table">
  <tr><th class="label">Codigo</th><td class="data">114148</td></tr>
  <tr><th class="label">Ref.</th><td class="data">354945</td></tr>
  <tr><th class="label">Fornecedor</th><td class="data">TILIBRA</td></tr>
  <tr><th class="label">NCM</th><td class="data">48201000</td></tr>
  <tr><th class="label">CEST</th><td class="data">1902000</td></tr>
  <tr><th class="label">Origem</th><td class="data">NACIONAL</td></tr>
  <tr><th class="label">Codigo de Barras</th><td class="data">7891027019150</td></tr>
  <tr><th class="label">Codigo de Barras Unitario</th><td class="data">7891027354947</td></tr>
  <tr><th class="label">Codigo de Barras Master</th><td class="data">17891027354944</td></tr>
  <tr><th class="label">Embalagem</th><td class="data">PCT.C/04</td></tr>
  <tr><th class="label">Embalagem Master</th><td class="data">5</td></tr>
  <tr><th class="label">Peso (kg)</th><td class="data">1,39</td></tr>
  <tr><th class="label">Comp. Emb. (cm)</th><td class="data">21,5</td></tr>
  <tr><th class="label">Alt. Emb. (cm)</th><td class="data">6,5</td></tr>
  <tr><th class="label">Larg. Emb. (cm)</th><td class="data">15,5</td></tr>
  <tr><th class="label">Peso Master (kg)</th><td class="data">7,22</td></tr>
  <tr><th class="label">Comp. Master (cm)</th><td class="data">36</td></tr>
  <tr><th class="label">Alt. Master (cm)</th><td class="data">22,5</td></tr>
  <tr><th class="label">Larg. Master (cm)</th><td class="data">16,5</td></tr>
</table>
<div class="product-description">
  <h2>Detalhes do Produto</h2>
  <ul>
    <li>Capa: dura</li>
    <li>Folhas: 160</li>
    <li>Tamanho: A5</li>
  </ul>
</div>
<img src="http://www.reval.net/imagem/produtos/m/114148.jpg" alt="" />
</body></html>
`;

const URL = "https://www.reval.net/produto/114148";
const p = parsePaginaReval(FIXTURE, URL);

// --- host do Reval ------------------------------------------------------------
check("aceita link do reval.net", ehLinkReval("https://www.reval.net/produto/114148"));
check("aceita subdominio do reval", ehLinkReval("https://loja.reval.net/x"));
check("recusa http (fora de https)", !ehLinkReval("http://www.reval.net/produto/1"));
check("recusa host aleatorio (nao SSRF)", !ehLinkReval("https://evil.com/produto/114148"));
check("recusa link lixo", !ehLinkReval("nao-e-url"));

// --- identificacao ------------------------------------------------------------
check("codigo do fornecedor = 114148", p.codigo === "114148", `veio=${p.codigo}`);
check("ref fabricante = 354945", p.refFabricante === "354945", `veio=${p.refFabricante}`);
check("nome vem do h1", (p.nome || "").includes("Agenda 2027 Spice"), `veio=${p.nome}`);
check("categoria do breadcrumb = Papelaria", (p.categoria || "").includes("Papelaria"), `veio=${p.categoria}`);
check("fornecedor = TILIBRA", p.fornecedor === "TILIBRA", `veio=${p.fornecedor}`);
check("detalhes viram texto (Capa dura)", (p.observacoes || "").includes("Capa: dura"), `veio=${p.observacoes}`);

// --- fiscal -------------------------------------------------------------------
check("NCM = 48201000", p.ncm === "48201000", `veio=${p.ncm}`);
check("CEST = 1902000", p.cest === "1902000", `veio=${p.cest}`);
check("origem NACIONAL -> 0", p.origem === "0", `veio=${p.origem}`);
check("GTIN unitario = 7891027354947", p.gtinUnitario === "7891027354947", `veio=${p.gtinUnitario}`);
check("GTIN inner (embalagem) = 7891027019150", p.gtinEmbalagem === "7891027019150", `veio=${p.gtinEmbalagem}`);
check("GTIN master DUN-14 = 17891027354944 (14 dig)", p.gtinMaster === "17891027354944", `veio=${p.gtinMaster}`);

// --- embalagem / logistica ------------------------------------------------------
check("qtd embalagem = 4 (de PCT.C/04)", p.qtdEmbalagem === 4, `veio=${p.qtdEmbalagem}`);
check("qtd master = 5", p.qtdMaster === 5, `veio=${p.qtdMaster}`);
check("peso embalagem = 1,39 kg", p.pesoEmbalagemKg === 1.39, `veio=${p.pesoEmbalagemKg}`);
check("peso master = 7,22 kg", p.pesoMasterKg === 7.22, `veio=${p.pesoMasterKg}`);
check("dim emb CxAxL = 21,5x6,5x15,5", p.embComprimentoCm === 21.5 && p.embAlturaCm === 6.5 && p.embLarguraCm === 15.5,
  `veio=${p.embComprimentoCm}x${p.embAlturaCm}x${p.embLarguraCm}`);
check("dim master CxAxL = 36x22,5x16,5", p.masterComprimentoCm === 36 && p.masterAlturaCm === 22.5 && p.masterLarguraCm === 16.5,
  `veio=${p.masterComprimentoCm}x${p.masterAlturaCm}x${p.masterLarguraCm}`);

// --- peso unitario calculado (peso emb / qtd emb) ------------------------------
// 1,39 / 4 = 0,3475 -> arredondado a 3 casas = 0,348
check("peso unitario = 0,348 kg (1,39 / 4)", p.pesoUnitarioKg === 0.348, `veio=${p.pesoUnitarioKg}`);

// --- nome: marcacao NOVA do Reval (15/10/2026) ------------------------------
// O Reval trocou <h1 class="product-name"> por
// <div class="product-name"><h2 itemprop="name"><span id="MainContent_lblDescricao">... e o
// unico <h1> da pagina agora e o do LOGO (so <img>, sem texto). Cadeia nova:
// div.product-name -> span#MainContent_lblDescricao -> meta kdt:product -> h1 com texto.
const novo = FIXTURE.replace(
  /<h1 class="product-name">[\s\S]*?<\/h1>/i,
  '<div class="product-name"><h2 itemprop="name"><span id="MainContent_lblDescricao">Agenda 2027 Spice Girls A5 Capa Dura 160 Fls Sortidas - Tilibra</span></h2></div>'
).replace(
  "<body>",
  '<body><h1 class="logo"><a href="/home" id="wucHeader_aLogo" title="Reval"><img src="/logo.svg" alt="Reval" /></a></h1>'
);
const pn = parsePaginaReval(novo, "https://www.reval.net/produto/agenda-2027-114148");
check("nome vem do novo div.product-name (ignora h1 do logo)", (pn.nome || "").includes("Agenda 2027 Spice"), `veio=${pn.nome}`);

// --- nome: so a meta kdt:product (sem nenhum h1 com texto) --------------------
const soMeta = "<html><body>" +
  '<h1 class="logo"><a href="/home" title="Reval"><img src="/logo.svg" alt="Reval"></a></h1>' +
  '<meta name="kdt:product" content="sku=052458, name=Fita Scotch Fixa Forte Dupla Face Silicone 12 mm x 2 m Transparente e Verde - 3M">' +
  "</body></html>";
const pm = parsePaginaReval(soMeta, "https://www.reval.net/produto/fita-scotch-052458");
check("nome vem da meta kdt:product quando nao ha heading", (pm.nome || "").includes("Fita Scotch"), `veio=${pm.nome}`);

// --- observacoes: forma real do site (h3 + <p> de texto corrido) ----------------
// Verificado ao vivo no 080000 (15/10/2026): <h3>Detalhes do produto</h3><p>...
// O 1o <p> sem ancorar capturava a frase de login - por isso o ancoramento.
const realDet = "<html><body>" +
  '<div class="product-summary-teaser"><h3>Detalhes do produto</h3><p>Desenvolvido para quem exige alta performance e nao abre mao da sustentabilidade.</p></div>' +
  '<p>Os precos e condicoes sao exclusivos para clientes cadastrados.</p>' +
  "</body></html>";
const pd = parsePaginaReval(realDet, "https://www.reval.net/produto/080000");
check("observacoes vem do h3 (nao a frase de login)",
  (pd.observacoes || "").includes("alta performance") && !(pd.observacoes || "").includes("precos"),
  `veio=${pd.observacoes}`);

// --- foto: g (1200px) > m > pp (miniatura 54px nao serve) ----------------------
// Verificado no 080000: so existem /g/ e /pp/; a "g" vem com sufixo (080000a.jpg).
const fotoHtml = "<html><body>" +
  '<img src="http://www.reval.net/imagem/produtos/g/080000a.jpg" alt="" />' +
  '<img src="http://www.reval.net/imagem/produtos/pp/080000c.jpg" alt="" />' +
  "</body></html>";
const pf = parsePaginaReval(fotoHtml, "https://www.reval.net/produto/080000");
check("foto prefere /g/ (1200px) e normaliza https",
  pf.fotoUrl === "https://www.reval.net/imagem/produtos/g/080000a.jpg", `veio=${pf.fotoUrl}`);

// --- foto: fallback monta /m/{codigo}.jpg quando nao ha tag <img> --------------
const semImg = parsePaginaReval("<html><body><table><tr><th class=\"label\">Codigo</th><td class=\"data\">080000</td></tr></table></body></html>", "https://www.reval.net/produto/080000");
check("foto fallback monta /m/{codigo}.jpg sem tag img",
  semImg.fotoUrl === "https://www.reval.net/imagem/produtos/m/080000.jpg", `veio=${semImg.fotoUrl}`);

// --- parser defensivo (pagina quebrada nao explode) ------------------------------
const quebrado = parsePaginaReval("<html><body>pagina sem nada</body></html>", "https://www.reval.net/produto/999999");
check("pagina sem dados nao explode (campos null)", quebrado.nome === null && quebrado.ncm === null && quebrado.gtinMaster === null);
check("codigo vem da URL como fallback", quebrado.codigo === "999999", `veio=${quebrado.codigo}`);
check("peso unitario null quando sem embalagem", quebrado.pesoUnitarioKg === null);

// --- limpeza ---------------------------------------------------------------------
fs.rmSync(tmp, { recursive: true, force: true });

const total = resultados.length;
const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${total} asserts, ${falhas} falhas`);
process.exit(falhas === 0 ? 0 : 1);
