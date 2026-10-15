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
check("detalhes viram texto (Capa dura)", (p.descricao || "").includes("Capa: dura"), `veio=${p.descricao}`);

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
