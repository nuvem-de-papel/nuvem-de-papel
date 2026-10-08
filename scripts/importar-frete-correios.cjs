/* Importa a matriz de frete do simulador PUBLICO dos Correios para
 * freight_tabelas (migration 0028). Sem credencial: o formulario em
 * www2.correios.com.br/sistemas/precosPrazos aceita POST direto.
 *
 * Uso:  node scripts/importar-frete-correios.cjs [--dump]
 *   --dump  salva a ultima resposta em tmp-correios.html (depuracao)
 *
 * Matriz: 1 CEP de origem (da loja) x 10 regioes de destino (primeiro
 * digito do CEP) x faixas de peso x PAC/SEDEX. Dimensoes por faixa sao
 * escolhidas para que o peso cubado (A*L*C/6000) nunca supere o peso real
 * - assim o preco vem do peso, nao da caixa.
 * Reimportar e seguro: upsert pela unique (tenant, origem, regiao, servico,
 * peso_ate) - preco/prazo antigos sao sobrescritos, sem duplicar. */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const DUMP = process.argv.includes("--dump");

function lerEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const env = lerEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// regioes: primeiro digito do CEP destino -> CEP representativo (capitais/centro)
const REGIOES = [
  { d: "0", cep: "01310100", nome: "SP capital" },
  // 13010115 nao existe no ViaCEP (Correios devolve pagina sem preco) — usar
  // o CEP generico do Centro de Campinas
  { d: "1", cep: "13010000", nome: "SP interior (Campinas)" },
  { d: "2", cep: "22041080", nome: "RJ (Copacabana)" },
  { d: "3", cep: "30130010", nome: "MG (Belo Horizonte)" },
  { d: "4", cep: "40015000", nome: "BA (Salvador)" },
  { d: "5", cep: "50010000", nome: "PE (Recife)" },
  { d: "6", cep: "60060000", nome: "CE (Fortaleza)" },
  { d: "7", cep: "70040010", nome: "DF (Brasilia)" },
  { d: "8", cep: "80010010", nome: "PR (Curitiba)" },
  { d: "9", cep: "90010150", nome: "RS (Porto Alegre)" },
];

// faixas: peso_ate (kg) -> dimensoes caixa A L C cm com cubado <= peso
const FAIXAS = [
  { peso: 0.3, dims: [20, 15, 5] },
  { peso: 0.5, dims: [20, 15, 10] },
  { peso: 1, dims: [25, 15, 10] },
  { peso: 2, dims: [30, 20, 15] },
  { peso: 3, dims: [30, 25, 15] },
  { peso: 5, dims: [40, 30, 20] },
  { peso: 10, dims: [50, 40, 30] },
  { peso: 20, dims: [60, 45, 40] },
];

const SERVICOS = [
  { cod: "04510", chave: "pac" },
  { cod: "04014", chave: "sedex" },
];

function dataPostagem() {
  // o formulario exige data futura (validaDataFutura no cliente; o server
  // aceita qualquer data futura). Usa amanha ja que prazo e em dias uteis.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
}

function corpo(cepDestino, peso, [alt, larg, comp], servicoCod) {
  const d = new URLSearchParams();
  d.set("data", dataPostagem());
  d.set("dataAtual", dataPostagem());
  d.set("cepOrigem", env.FRETE_CEP_ORIGEM || "09850-730");
  d.set("cepDestino", cepDestino.slice(0, 5) + "-" + cepDestino.slice(5));
  d.set("servico", servicoCod);
  d.set("Formato", "1");
  d.set("Selecao", "caixa");
  d.set("embalagem1", "outraEmbalagem1");
  d.set("Altura", String(alt));
  d.set("Largura", String(larg));
  d.set("Comprimento", String(comp));
  d.set("peso", String(peso));
  d.set("MaoPropria", "N");
  d.set("avisoRecebimento", "N");
  d.set("Calcular", "Calcular");
  // campos ocultos que o CFML exige (DEFINED check no server)
  for (let i = 1; i <= 34; i++) {
    d.set(`proCod_in_${i}`, "");
    d.set(`Selecao${i}`, "");
  }
  return d.toString();
}

async function cotar(cepDestino, peso, dims, servicoCod) {
  const resp = await fetch("https://www2.correios.com.br/sistemas/precosPrazos/prazos.cfm", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9",
      Referer: "https://www2.correios.com.br/sistemas/precosPrazos/prazos.cfm",
    },
    body: corpo(cepDestino, peso, dims, servicoCod),
    signal: AbortSignal.timeout(45000),
  });
  if (resp.status === 403) throw new Error("RATE_LIMIT_403");
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const html = buf.toString("latin1");
  if (DUMP) fs.writeFileSync(path.join(__dirname, "..", "tmp-correios.html"), buf);
  if (html.includes("ERROR ON PAGE") || html.includes("PGINA COM ERRO")) {
    const diag = /<!--([\s\S]{0,300})-->/.exec(html);
    throw new Error("pagina de erro do Correios: " + ((diag && diag[1]) || "sem detalhe"));
  }
  // texto plano: tags viram " | " para preservar celulas da tabela
  const texto = html
    .replace(/<[^>]+>/g, "|")
    .replace(/(\|\s*)+/g, " | ");

  const precoM = /Pre.o do servi.o[^R]*R\$\s*([\d.]+,\d{2})/.exec(texto);
  if (!precoM) throw new Error("parser: 'Preço do serviço' nao encontrado");
  const prazoM = /Dia da Postagem \+\s*(\d+)\s*dias?/i.exec(texto) || /\+\s*(\d+)\s*dias?\s*[uú]teis?/i.exec(texto);
  if (!prazoM) throw new Error("parser: prazo (dias) nao encontrado");

  const valor = Number(precoM[1].replace(/\./g, "").replace(",", "."));
  const prazo = Number(prazoM[1]);
  if (!Number.isFinite(valor) || valor <= 0) throw new Error(`preco invalido: ${precoM[1]}`);
  if (!Number.isFinite(prazo)) throw new Error(`prazo invalido: ${prazoM[1]}`);
  return { valor, prazo };
}

(async () => {
  const { data: tenants, error: erroT } = await admin.from("tenants").select("id").limit(1);
  if (erroT || !tenants?.length) throw new Error("nenhum tenant encontrado");
  const tenantId = tenants[0].id;

  const { data: empresa } = await admin
    .from("tenant_company")
    .select("endereco")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const cepOrigem = String(empresa?.endereco?.cep ?? "09850-730").replace(/\D/g, "");
  if (cepOrigem.length !== 8) throw new Error(`CEP de origem invalido: ${cepOrigem}`);

  // checkpoint: pula o que ja esta no banco (importacao retomavel apos 403)
  const { data: existentes } = await admin
    .from("freight_tabelas")
    .select("destino_regiao, servico, peso_ate")
    .eq("tenant_id", tenantId)
    .eq("origem_cep", cepOrigem);
  const feitas = new Set(
    (existentes ?? []).map((l) => `${l.destino_regiao}|${l.servico}|${Number(l.peso_ate)}`)
  );

  const pendentes = [];
  for (const reg of REGIOES)
    for (const faixa of FAIXAS)
      for (const svc of SERVICOS)
        if (!feitas.has(`${reg.d}|${svc.chave}|${faixa.peso}`)) pendentes.push({ reg, faixa, svc });

  console.log(
    `Origem: ${cepOrigem} | matriz ${REGIOES.length} x ${FAIXAS.length} x ${SERVICOS.length}` +
      ` = ${REGIOES.length * FAIXAS.length * SERVICOS.length} cotacoes | ja no banco: ${feitas.size} | a fazer: ${pendentes.length}`
  );
  if (pendentes.length === 0) {
    console.log("Nada a importar.");
    process.exit(0);
  }

  const linhas = [];
  let ok = 0;
  let falhas = 0;
  let espera403 = 0;
  for (let idx = 0; idx < pendentes.length; idx++) {
    const { reg, faixa, svc } = pendentes[idx];
    const tentar = async () => {
      const r = await cotar(reg.cep, faixa.peso, faixa.dims, svc.cod);
      linhas.push({
        tenant_id: tenantId,
        origem_cep: cepOrigem,
        destino_regiao: reg.d,
        servico: svc.chave,
        peso_ate: faixa.peso,
        valor: r.valor,
        prazo_dias: r.prazo,
      });
      ok++;
      console.log(`  [${idx + 1}/${pendentes.length}] ${reg.d} ${String(faixa.peso).padStart(2)}kg ${svc.chave.padEnd(5)} = R$ ${r.valor.toFixed(2).padStart(7)} | ${r.prazo}d`);
    };
    try {
      await tentar();
      espera403 = 0;
    } catch (e) {
      if (e.message === "RATE_LIMIT_403") {
        // WAF do Correios: espera longa e recomeca pelo MESMO ponto
        espera403++;
        if (espera403 > 6) {
          console.error("403 persistente - parando. Rode de novo para retomar (checkpoint no banco).");
          break;
        }
        console.warn(`  403 (rate-limit) - aguardando 120s e retomando... (tentativa ${espera403}/6)`);
        // persiste o que ja deu antes de esperar (o banco e o checkpoint)
        if (linhas.length) {
          const { error: e1 } = await admin.from("freight_tabelas").upsert(linhas, {
            onConflict: "tenant_id,origem_cep,destino_regiao,servico,peso_ate",
            ignoreDuplicates: false,
          });
          if (e1) throw new Error(`upsert: ${e1.message}`);
          linhas.length = 0;
        }
        await new Promise((r) => setTimeout(r, 120000));
        try {
          await tentar();
          espera403 = 0;
        } catch (e2) {
          idx--; // recomeca do mesmo ponto no proximo loop
          continue;
        }
      } else {
        // 1 retry comum: o simulador as vezes engasga com rajada
        await new Promise((r) => setTimeout(r, 4000));
        try {
          await tentar();
        } catch (e2) {
          falhas++;
          console.error(`  FALHA ${reg.d} ${faixa.peso}kg ${svc.chave}: ${e2.message}`);
        }
      }
    }
    await new Promise((r) => setTimeout(r, 3500));
  }

  if (linhas.length > 0) {
    const { error: erroUp } = await admin.from("freight_tabelas").upsert(linhas, {
      onConflict: "tenant_id,origem_cep,destino_regiao,servico,peso_ate",
      ignoreDuplicates: false,
    });
    if (erroUp) throw new Error(`upsert: ${erroUp.message}`);
  }

  const { count: total } = await admin
    .from("freight_tabelas")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  console.log(`\nIMPORTADO ${ok} cotações nesta rodada (${falhas} falhas) -> freight_tabelas (${total} linhas no total)`);
  process.exit(falhas > 0 ? 1 : 0);
})().catch((e) => {
  console.error("ERRO FATAL:", e.message);
  process.exit(2);
});
