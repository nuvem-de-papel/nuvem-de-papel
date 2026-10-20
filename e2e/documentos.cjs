/* E2E Documentos (Bloco 4) — PDF do pedido de compra, folha de impressão do
 * documento auxiliar (DANFE) e download do XML autorizado.
 *   D1..D4  rota /compras/pedido/[id] serve o pedido em A4 (título, itens,
 *           totais, condições) e responde 404 para pedido inexistente;
 *   D5      a rota passa pelo middleware (/compras) e manda anônimo p/ /login;
 *   D6..D8  o documento auxiliar abre como .doc-print, os controles ficam fora
 *           do papel ([data-no-print]) e "Baixar XML" entrega o arquivo;
 *   D9      o botão PDF da listagem de compras abre a folha em nova aba;
 *   D10     a folha @media print existe e esconde a interface.
 * Requisitos: npm run build && npm run start (:3000) + SEFAZ_MOCK=1.
 * Roda junto de: npm run e2e (executa depois de dre). */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EPOCH = Date.now();
const SKU = `SKU-E2E-DOC-${EPOCH}`;
const ITEM = "Item E2E Documentos Bloco 4";
const SKU2 = `SKU-E2E-DOC2-${EPOCH}`;
const ITEM2 = "Segundo item E2E Documentos";
const NOME_FORN = `Forn E2E Documentos ${EPOCH}`;
const CODIGO = `PC-DOC-${EPOCH}`;
const LINHAS = [
  { sku: SKU, nome: ITEM, qtd: 10, unit: 123.45 },
  { sku: SKU2, nome: ITEM2, qtd: 3, unit: 55.5 },
];
const TOTAL = LINHAS.reduce((s, l) => s + l.qtd * l.unit, 0);
const NAO_EXISTE = "00000000-0000-0000-0000-0000000000ff";

function lerEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const env = lerEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const resultados = [];
function check(nome, cond, detalhe = "") {
  resultados.push({ ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"} - ${nome}${detalhe ? " | " + detalhe : ""}`);
}

async function login(page, email, senha) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

async function presente(page, seletor, deve = true, timeout = 15000) {
  try {
    await page.waitForSelector(seletor, { state: deve ? "attached" : "detached", timeout });
    return true;
  } catch {
    return !deve;
  }
}

// a folha de impressão é servida junto do CSS global; procuramos a regra
// @media print que esconde a interface e devolve .doc-print para o papel.
async function temFolhaDeImpressao(page) {
  return page.evaluate(() => {
    for (const folha of Array.from(document.styleSheets)) {
      let regras;
      try {
        regras = folha.cssRules;
      } catch {
        continue;
      }
      for (const r of Array.from(regras ?? [])) {
        const texto = r.cssText ?? "";
        if (/media[^{]*print/.test(texto) && texto.includes(".doc-print")) return true;
      }
    }
    return false;
  });
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });

  // ------------------------------------------------------------ fixtures --
  // varredura: remove sobras de execucoes anteriores antes de semear.
  // A nota (serie 9 = marcador) e apagada ANTES do PO: nfe_emissoes.purchase_order_id
  // e ON DELETE SET NULL, entao sem esse delete a nota fica orfa para sempre.
  await admin.from("nfe_emissoes").delete().eq("tenant_id", TENANT).eq("serie", 9);
  await admin.from("purchase_orders").delete().eq("tenant_id", TENANT).like("code", "PC-DOC-%");
  await admin.from("suppliers").delete().eq("tenant_id", TENANT).like("name", "Forn E2E Documentos%");
  await admin.from("catalog_items").delete().eq("tenant_id", TENANT).like("sku", "SKU-E2E-DOC%");

  async function garantirItem(sku, name) {
    const { data: existente } = await admin
      .from("catalog_items")
      .select("id")
      .eq("tenant_id", TENANT)
      .eq("sku", sku)
      .maybeSingle();
    if (existente) return existente.id;
    const { data: novo, error } = await admin
      .from("catalog_items")
      .insert({ tenant_id: TENANT, sku, name, active: true })
      .select("id")
      .single();
    if (error) throw new Error("seed catalog_items: " + error.message);
    return novo.id;
  }
  const itemA = await garantirItem(SKU, ITEM);
  const itemB = await garantirItem(SKU2, ITEM2);
  const idPorSku = { [SKU]: itemA, [SKU2]: itemB };

  const { data: forn, error: eF } = await admin
    .from("suppliers")
    .insert({ tenant_id: TENANT, name: NOME_FORN, cnpj: "11222333000181", uf: "SP" })
    .select("id")
    .single();
  if (eF) throw new Error("seed supplier: " + eF.message);

  const { data: po, error: ePo } = await admin
    .from("purchase_orders")
    .insert({
      tenant_id: TENANT,
      supplier_id: forn.id,
      code: CODIGO,
      idempotency_key: `e2e-doc-${EPOCH}`,
      status: "aberto",
      total: TOTAL,
      notes: "Pedido de compra do E2E Documentos (Bloco 4).",
      origem: "nacional",
      tipo: "pedido",
      frete: 0,
      desconto: 0,
      condicao: "28 dias",
      expected_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    })
    .select("id, code")
    .single();
  if (ePo) throw new Error("seed purchase_orders: " + ePo.message);

  const { error: eIt } = await admin.from("purchase_order_items").insert(
    LINHAS.map((l) => ({
      tenant_id: TENANT,
      purchase_order_id: po.id,
      item_id: idPorSku[l.sku],
      sku_snapshot: l.sku,
      name_snapshot: l.nome,
      quantity: l.qtd,
      unit_cost: l.unit,
      line_total: +(l.qtd * l.unit).toFixed(2),
    }))
  );
  if (eIt) throw new Error("seed purchase_order_items: " + eIt.message);

  // D6..D8: a aba "Notas emitidas" precisa de UMA nota para abrir o DANFE e
  // baixar o XML. Nenhuma suite da chain deixa uma para tras (vendas/sefaz/
  // vendas-v5 emitem e apagam a propria; a 0034 zerou a tabela toda), entao o
  // D6a passou a depender de sobra de run antigo - agora a propria suíte semeia
  // a dela, ligada ao PO que acaba de criar (nfe_emissoes aceita pedido de
  // compra). Serie 9 = marcador da varredura do topo; chave de 44 digitos e
  // XML de verdade sao o que o D8 exige (nome do arquivo = chave).
  // chave = cUF(2)+AAMM(4)+CNPJ(14)+mod(2)+serie(3)+nNF(9)+tpEmis(1)+cNF(8)+DV(1) = 44
  const CHAVE_NOTA = `3526101122233300018155009${String(900000 + (EPOCH % 99999)).padStart(9, "0")}1000000001`;
  const XML_NOTA =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">\n` +
    `<NFe><infNFe Id="NFe${CHAVE_NOTA}">` +
    `<ide><cUF>35</cUF><mod>55</mod><serie>9</serie><nNF>${CHAVE_NOTA.slice(25, 34)}</nNF></ide>` +
    `<emit><CNPJ>11222333000181</CNPJ><xNome>NUVEM DE PAPEL LTDA</xNome></emit>` +
    `<dest><CNPJ>11222333000181</CNPJ><xNome>E2E DOCUMENTOS</xNome></dest>` +
    LINHAS.map(
      (l, i) =>
        `<det nItem="${i + 1}"><prod><xProd>${l.nome}</xProd><qtd>${l.qtd}</qtd>` +
        `<vUn>${l.unit.toFixed(2)}</vUn><vProd>${(l.qtd * l.unit).toFixed(2)}</vProd></prod></det>`
    ).join("") +
    `<total><ICMSTot><vNF>${TOTAL.toFixed(2)}</vNF></ICMSTot></total>` +
    `</infNFe></NFe>\n</nfeProc>\n`;
  const { error: eNota } = await admin.from("nfe_emissoes").insert({
    tenant_id: TENANT,
    tipo: "entrada",
    purchase_order_id: po.id,
    numero: 900000 + (EPOCH % 99999),
    serie: 9,
    natureza_operacao: "Compra para comercialização",
    cfop: "2102",
    destinatario: { nome: "Nuvem de Papel LTDA", cnpj: "11222333000181", uf: "SP" },
    itens: LINHAS.map((l) => ({
      numero: l.sku,
      descricao: l.nome,
      quantidade: l.qtd,
      valor_unitario: l.unit,
      line_total: +(l.qtd * l.unit).toFixed(2),
    })),
    totais: { base: TOTAL, icms: 0, pis: 0, cofins: 0, total: TOTAL },
    status: "autorizada",
    chave: CHAVE_NOTA,
    protocolo: `1352600000000${String(900000 + (EPOCH % 99999)).padStart(9, "0")}`.slice(0, 15),
    autorizada_em: new Date().toISOString(),
    xml: XML_NOTA,
  });
  if (eNota) throw new Error("seed nfe_emissoes: " + eNota.message);

  const page = await browser.newPage();
  try {
    await login(page, EMAIL_MASTER, SENHA_MASTER);

    // ------------------------------------------- D1 folha A4 do pedido ----
    await page.goto(`${BASE}/compras/pedido/${po.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.innerText.includes("PEDIDO DE COMPRA"), null, {
      timeout: 20000,
    });
    const corpo = await page.evaluate(() => document.body.innerText);
    check("D1 pedido de compra serve a folha A4", corpo.includes("PEDIDO DE COMPRA"), CODIGO);
    check(
      "D1a codigo do pedido no papel",
      corpo.includes(CODIGO),
      CODIGO
    );
    check("D1b fornecedor no papel", corpo.includes(NOME_FORN));
    check(
      "D1c itens e total no papel",
      corpo.includes(ITEM) && corpo.includes("1.401,00"),
      TOTAL.toFixed(2)
    );

    // --------------------------------- D2 controles fora do papel + print --
    const botaoImprimir = await presente(page, 'button[aria-label="Imprimir / Salvar PDF"]');
    check("D2 botao Imprimir / Salvar PDF no pedido", botaoImprimir);
    const foraDoPapel = await page.evaluate(() => {
      const b = document.querySelector('button[aria-label="Imprimir / Salvar PDF"]');
      return !!b && b.hasAttribute("data-no-print");
    });
    check("D2a controles marcados [data-no-print]", foraDoPapel);
    const chamouPrint = await page.evaluate(() => {
      window.__e2ePrint = false;
      window.print = () => {
        window.__e2ePrint = true;
      };
      return true;
    });
    await page.click('button[aria-label="Imprimir / Salvar PDF"]');
    await page.waitForFunction(() => window.__e2ePrint === true, null, { timeout: 5000 });
    check("D2b window.print() chamado pelo botao", chamouPrint);

    // --------------------------------------------- D3 rota inexistente ----
    const r404 = await page.goto(`${BASE}/compras/pedido/${NAO_EXISTE}`, {
      waitUntil: "domcontentloaded",
    });
    check("D3 pedido inexistente responde 404", r404 && r404.status() === 404);

    // ------------------------------------------------- D4 folha de print --
    check("D4 folha @media print (.doc-print) carregada", await temFolhaDeImpressao(page));

    // ----------------------------------------------- D5 middleware /login --
    const anonCtx = await browser.newContext();
    const anon = await anonCtx.newPage();
    await anon.goto(`${BASE}/compras/pedido/${po.id}`, { waitUntil: "domcontentloaded" });
    await anon.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 20000 });
    check("D5 rota exige login (middleware /compras)", anon.url().includes("/login"));
    await anonCtx.close();

    // -------------------------------------- D6 documento auxiliar (DANFE) --
    await page.goto(BASE + "/vendas", { waitUntil: "domcontentloaded" });
    const temNotas = await presente(page, 'button[aria-label="Aba Notas emitidas"]', true, 30000);
    check("D6 aba Notas emitidas presente", temNotas);
    await page.click('button[aria-label="Aba Notas emitidas"]');
    const temVer = await presente(page, 'button[aria-label^="Ver documento"]', true, 20000);
    check("D6a ha nota para abrir", temVer);
    if (temVer) {
      await page.click('button[aria-label^="Ver documento"]');
      const modal = await presente(page, ".doc-print-inner", true, 15000);
      check("D6b documento auxiliar abre com classe .doc-print-inner", modal);
      const overlay = await page.evaluate(() => {
        const alvo = document.querySelector(".doc-print-inner");
        return !!alvo && !!document.querySelector(".doc-print");
      });
      check("D6c overlay marcado .doc-print (unico item impresso)", overlay);

      const temImprimir = await presente(page, '.doc-print-inner button[aria-label="Imprimir / PDF"]');
      check("D7 botao Imprimir / PDF no DANFE", temImprimir);
      const temXml = await presente(page, '.doc-print-inner button[aria-label="Baixar XML da nota"]');
      check("D7a botao Baixar XML no DANFE", temXml);
      const foraDoPapel2 = await page.evaluate(() => {
        const b = document.querySelector('.doc-print-inner button[aria-label="Imprimir / PDF"]');
        const x = document.querySelector('.doc-print-inner button[aria-label="Baixar XML da nota"]');
        return !!b && !!x && b.hasAttribute("data-no-print") && x.hasAttribute("data-no-print");
      });
      check("D7b impressao e XML ficam fora do papel", foraDoPapel2);

      // ------------------------------------------------- D8 download XML --
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 25000 }),
        page.click('.doc-print-inner button[aria-label="Baixar XML da nota"]'),
      ]);
      const nome = download.suggestedFilename();
      check("D8 XML baixa com a chave de 44 digitos", /^[0-9]{44}\.xml$/.test(nome), nome);
      const arquivo = await download.path();
      const conteudo = arquivo ? fs.readFileSync(arquivo, "utf8") : "";
      check(
        "D8a conteudo e XML de verdade",
        conteudo.includes("<") && /NFe|nfe/.test(conteudo.slice(0, 600)),
        `${conteudo.length} bytes`
      );
    }

    // ---------------------------------------- D9 botao PDF na listagem ----
    await page.goto(BASE + "/compras", { waitUntil: "domcontentloaded" });
    const temBotaoPdf = await presente(page, `button[aria-label="Abrir PDF do pedido ${CODIGO}"]`, true, 20000);
    check("D9 botao PDF na listagem de compras", temBotaoPdf);
    if (temBotaoPdf) {
      const [popup] = await Promise.all([
        page.waitForEvent("popup", { timeout: 25000 }),
        page.click(`button[aria-label="Abrir PDF do pedido ${CODIGO}"]`),
      ]);
      await popup.waitForFunction(
        () => document.body.innerText.includes("PEDIDO DE COMPRA"),
        null,
        { timeout: 20000 }
      );
      const texto = await popup.evaluate(() => document.body.innerText);
      check("D9a a nova aba traz o pedido em A4", texto.includes(CODIGO));
      await popup.close();
    }
  } finally {
    await browser.close();
    // -------------------------------------------------------- limpeza -----
    // nota ANTES do PO: purchase_order_id e ON DELETE SET NULL, sem isso a
    // nota fica orfa (e a varredura do topo a pega na proxima execucao).
    await admin.from("nfe_emissoes").delete().eq("tenant_id", TENANT).eq("serie", 9);
    await admin.from("purchase_orders").delete().eq("id", po.id);
    await admin.from("suppliers").delete().eq("id", forn.id);
    await admin.from("catalog_items").delete().eq("tenant_id", TENANT).like("sku", "SKU-E2E-DOC%");
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO - " + (e?.stack ?? e));
  process.exit(1);
});
