/* Importador do catalogo JQ (pacote jq_export_AAAA-MM-DD) - 18/11/2026.
 *
 * Uso (na raiz do repo):
 *   node scripts/importar-jq.cjs <pasta-do-pacote>                 -> SIMULACAO (so le)
 *   node scripts/importar-jq.cjs <pasta-do-pacote> --aplicar       -> grava no staging
 *   opcoes: --relatorio <arquivo.json>  grava o plano completo em JSON
 *           --env <arquivo>             outro .env (padrao .env.local)
 *           --producao                  exige que o .env aponte para PRODUCAO
 *                                       (sem a flag, so roda contra o STAGING)
 *
 * Decisoes do dono (16-18/11/2026, ver AGENTS.md "Catalogo JQ"):
 *  - fotos no bucket publico `produtos` (0056), caminho jq/<sha256>.jpg (o mesmo
 *    arquivo usado em varios slots/SKUs sobe uma vez so);
 *  - slot N do JQ = item_images.position N-1 (0 = capa, 1-4 = galeria);
 *  - produto NOVO entra INATIVO, setor = departamento_principal em MAIUSCULAS
 *    (casa sem acento com o setor que ja existe);
 *  - EXISTENTE: galeria + preco + nome pelo JQ; venda varejo = preco_varejo,
 *    custo (preco_custo) = preco_atacado; cost_price (custo medio) so acompanha
 *    enquanto o item nao tem nota de entrada (mesma regra do salvarProduto);
 *  - SKU do sistema fora do JQ: intocado. Nada e apagado.
 * Idempotente: rodar de novo so grava o que ainda difere. Trilha unica em
 * audit_log (action catalogo.importar_jq) com o estado ANTERIOR de cada item
 * alterado. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const REF_STAGING = "cwfvxthfwbvpfjhsxpmc";
const REF_PRODUCAO = "urlfwxeflxpdmmxkuuur";
const TENANT = "00000000-0000-0000-0000-000000000001";
const BUCKET = "produtos";
const PASTA_STORAGE = "jq";
const BASE_PRECO = { channel: "varejo", min_quantity: 1, valid_from: "1970-01-01T00:00:00+00:00" };
// mesmos valores de todos os itens ja cadastrados no staging (conferido 18/11)
const FISCAL_PADRAO = { unit: "UN", origem: "2", cst_csosn: "102", icms_rate: 18, ipi_rate: 0, icms_base_pct: 100 };

// ---------- argumentos ----------
const args = process.argv.slice(2);
const opc = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const APLICAR = args.includes("--aplicar");
const PRODUCAO = args.includes("--producao");
const PACOTE = args.find((a, i) => !a.startsWith("--") && !["--relatorio", "--env"].includes(args[i - 1]));
if (!PACOTE) {
  console.error("uso: node scripts/importar-jq.cjs <pasta-do-pacote> [--aplicar] [--relatorio x.json]");
  process.exit(2);
}

// ---------- ambiente (recusa o banco errado) ----------
function lerEnv(arquivo) {
  const env = {};
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const env = lerEnv(opc("--env") || path.join(__dirname, "..", ".env.local"));
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL || "";
const REF_ESPERADO = PRODUCAO ? REF_PRODUCAO : REF_STAGING;
if (!URL_SB.includes(REF_ESPERADO)) {
  console.error(`RECUSADO: o .env aponta para ${URL_SB || "(vazio)"}, esperado ${REF_ESPERADO} (${PRODUCAO ? "producao" : "staging"}).`);
  process.exit(2);
}
const db = createClient(URL_SB, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const urlPublica = (sha) => `${URL_SB.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${PASTA_STORAGE}/${sha}.jpg`;

// ---------- CSV (RFC 4180: aspas, virgula e aspas dobradas) ----------
function lerCsv(arquivo) {
  const txt = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "");
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && txt[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...corpo] = linhas;
  return corpo.map((l) => Object.fromEntries(cab.map((k, j) => [k, l[j] ?? ""])));
}
const dinheiro = (s) => {
  const n = Number(String(s).trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
const semAcento = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

// ---------- pacote ----------
function lerPacote(pasta) {
  const erros = [];
  const produtos = lerCsv(path.join(pasta, "produtos.csv"));
  const imagens = lerCsv(path.join(pasta, "imagens.csv"));
  const porSku = new Map();
  for (const p of produtos) {
    const sku = p.sku.trim();
    // So o preco da caixa veio (57 SKUs no pacote de 16/11): mesma conta da 1a
    // carga e da regra 12b do pacote - venda = caixa x 1,30, custo = caixa x 1,15
    // (decisao do dono 18/11/2026). Conta em centavos para nao errar arredondamento.
    const semPreco = !p.preco_varejo.trim() && !p.preco_atacado.trim() && p.preco_caixa.trim();
    const caixaCent = Math.round(dinheiro(p.preco_caixa) * 100);
    const r = {
      sku,
      nome: p.nome.trim().replace(/\s+/g, " "),
      dep: p.departamento_principal.trim(),
      venda: semPreco ? Math.round((caixaCent * 130) / 100) / 100 : dinheiro(p.preco_varejo),
      custo: semPreco ? Math.round((caixaCent * 115) / 100) / 100 : dinheiro(p.preco_atacado),
      precoPelaCaixa: !!semPreco,
      fotos: [],
    };
    if (!sku) erros.push("linha sem sku em produtos.csv");
    else if (porSku.has(sku.toUpperCase())) erros.push(`sku repetido: ${sku}`);
    if (!r.nome) erros.push(`${sku}: nome vazio`);
    if (!r.dep) erros.push(`${sku}: departamento vazio`);
    if (!(r.venda > 0)) erros.push(`${sku}: preco_varejo invalido (${p.preco_varejo})`);
    if (!(r.custo >= 0)) erros.push(`${sku}: preco_atacado invalido (${p.preco_atacado})`);
    porSku.set(sku.toUpperCase(), r);
  }
  // fotos: confere existencia, tamanho e sha256 de cada arquivo (uma vez por arquivo)
  const arquivos = new Map(); // sha -> { caminho, bytes }
  const lidos = new Map(); // caminho -> sha calculado
  for (const im of imagens) {
    const r = porSku.get(im.sku.trim().toUpperCase());
    const slot = Number(im.slot);
    const sha = (im.sha256 || "").toLowerCase();
    if (!r) { erros.push(`imagens.csv: sku ${im.sku} fora de produtos.csv`); continue; }
    if (!(slot >= 1 && slot <= 5)) { erros.push(`${im.sku}: slot ${im.slot} fora de 1-5`); continue; }
    if (!/^[0-9a-f]{64}$/.test(sha)) { erros.push(`${im.sku}/${slot}: sha256 invalido`); continue; }
    if (!/\.jpe?g$/i.test(im.arquivo)) { erros.push(`${im.sku}/${slot}: arquivo nao e .jpg`); continue; }
    const caminho = path.resolve(pasta, im.arquivo);
    if (!lidos.has(caminho)) {
      if (!fs.existsSync(caminho)) { erros.push(`${im.sku}/${slot}: arquivo ausente ${caminho}`); continue; }
      const buf = fs.readFileSync(caminho);
      if (buf.length > 2 * 1024 * 1024) erros.push(`${im.sku}/${slot}: ${buf.length} bytes (> 2 MB do bucket)`);
      lidos.set(caminho, crypto.createHash("sha256").update(buf).digest("hex"));
      if (!arquivos.has(lidos.get(caminho))) arquivos.set(lidos.get(caminho), { caminho, bytes: buf.length });
    }
    if (lidos.get(caminho) !== sha) { erros.push(`${im.sku}/${slot}: sha256 do arquivo nao bate com o manifesto`); continue; }
    if (r.fotos[slot - 1]) erros.push(`${im.sku}: slot ${slot} repetido`);
    r.fotos[slot - 1] = sha;
  }
  return { itens: [...porSku.values()], arquivos, erros };
}

// ---------- banco ----------
async function todas(montar) {
  let saida = [], de = 0;
  for (;;) {
    const { data, error } = await montar().range(de, de + 999);
    if (error) throw new Error(error.message);
    saida = saida.concat(data);
    if (data.length < 1000) return saida;
    de += 1000;
  }
}
const lote = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const embed1 = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const ncmPontuado = (n) => {
  const d = (n || "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : null;
};

async function lerBanco() {
  const itens = await todas(() =>
    db
      .from("catalog_items")
      .select(
        "id, sku, name, category, active, item_fiscal_data(ncm), item_commercial_data(preco_custo, cost_price), item_prices(price, channel, min_quantity, valid_from), item_images(url, position), item_stock_by_location(location_id)"
      )
      .eq("tenant_id", TENANT)
      .order("sku")
  );
  const { data: cd, error: eCd } = await db
    .from("stock_locations")
    .select("id")
    .eq("tenant_id", TENANT)
    .eq("code", "cd")
    .maybeSingle();
  if (eCd || !cd) throw new Error("local de estoque 'cd' nao encontrado: " + (eCd?.message || "sem linha"));
  const notas = await todas(() => db.from("purchase_receipt_items").select("purchase_order_items!inner(item_id)"));
  const comNota = new Set(notas.map((n) => embed1(n.purchase_order_items)?.item_id).filter(Boolean));
  // fotos ja enviadas (bucket pode nao existir ainda: simulacao antes da 0056)
  // list() NAO da erro com bucket inexistente (devolve vazio) - por isso getBucket
  const noBucket = new Set();
  const bucketOk = !(await db.storage.getBucket(BUCKET)).error;
  for (let de = 0; bucketOk; de += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(PASTA_STORAGE, { limit: 1000, offset: de });
    if (error) throw new Error("listar fotos do bucket: " + error.message);
    for (const o of data) noBucket.add(o.name.replace(/\.jpg$/i, ""));
    if (data.length < 1000) break;
  }
  return { itens, cdId: cd.id, comNota, noBucket, bucketOk };
}

// ---------- plano ----------
function planejar(pacote, banco) {
  const porSku = new Map(banco.itens.map((i) => [i.sku.toUpperCase(), i]));
  // setor: o que ja existe (sem acento) manda na grafia
  const setores = new Map();
  for (const i of banco.itens) if (i.category) setores.set(semAcento(i.category), i.category);
  // NCM do setor = o mais comum entre os itens que ja existem nele (pontuado)
  const ncmConta = new Map();
  for (const i of banco.itens) {
    const n = ncmPontuado(embed1(i.item_fiscal_data)?.ncm);
    if (!n || !i.category) continue;
    const k = semAcento(i.category);
    const m = ncmConta.get(k) || new Map();
    m.set(n, (m.get(n) || 0) + 1);
    ncmConta.set(k, m);
  }
  const ncmSetor = (k) => {
    const m = ncmConta.get(k);
    return m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
  };

  const plano = { novos: [], nomes: [], precos: [], custos: [], imagens: [], filhasFaltando: [], fotosEnviar: [] };
  const fotosUsadas = new Set();
  for (const r of pacote.itens) {
    const atual = porSku.get(r.sku.toUpperCase());
    const urls = r.fotos.map((sha) => (sha ? urlPublica(sha) : null));
    r.fotos.forEach((sha) => sha && fotosUsadas.add(sha));
    if (!atual) {
      const k = semAcento(r.dep);
      plano.novos.push({
        sku: r.sku,
        nome: r.nome,
        setor: setores.get(k) || r.dep.toUpperCase(),
        setorNovo: !setores.has(k),
        ncm: ncmSetor(k),
        venda: r.venda,
        custo: r.custo,
        urls,
      });
      continue;
    }
    if (atual.name.trim() !== r.nome) plano.nomes.push({ id: atual.id, sku: atual.sku, de: atual.name, para: r.nome });
    const base = (atual.item_prices || []).filter((p) => p.channel === "varejo" && Number(p.min_quantity) === 1);
    const precoAtual = base.length ? Number(base[0].price) : null;
    if (base.length !== 1 || precoAtual !== r.venda || new Date(base[0].valid_from).getTime() !== 0)
      plano.precos.push({ id: atual.id, sku: atual.sku, de: base.map((p) => Number(p.price)), para: r.venda });
    const com = embed1(atual.item_commercial_data);
    const segueMedia = !banco.comNota.has(atual.id);
    const custoDe = com ? Number(com.preco_custo) : null;
    const mediaDe = com ? Number(com.cost_price) : null;
    if (!com || custoDe !== r.custo || (segueMedia && mediaDe !== r.custo))
      plano.custos.push({ id: atual.id, sku: atual.sku, de: custoDe, mediaDe, para: r.custo, segueMedia, semLinha: !com });
    const imgs = new Map((atual.item_images || []).map((im) => [im.position, im.url]));
    const mudaImg = urls.some((u, pos) => u && imgs.get(pos) !== u);
    if (mudaImg) plano.imagens.push({ id: atual.id, sku: atual.sku, de: Object.fromEntries(imgs), urls });
    const falta = [];
    if (!embed1(atual.item_fiscal_data)) falta.push("fiscal");
    if (!(atual.item_stock_by_location || []).some((s) => s.location_id === banco.cdId)) falta.push("estoque_cd");
    if (falta.length) plano.filhasFaltando.push({ id: atual.id, sku: atual.sku, falta, ncm: ncmSetor(semAcento(atual.category)) });
  }
  plano.fotosEnviar = [...fotosUsadas].filter((sha) => !banco.noBucket.has(sha));
  plano.foraDoJq = banco.itens.filter((i) => !pacote.itens.some((r) => r.sku.toUpperCase() === i.sku.toUpperCase())).length;
  plano.casamentoSoPorCaixa = pacote.itens.filter((r) => {
    const a = porSku.get(r.sku.toUpperCase());
    return a && a.sku !== r.sku;
  }).map((r) => r.sku);
  return plano;
}

// ---------- gravacao (so com --aplicar) ----------
async function emParalelo(lista, n, fn) {
  const falhas = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, lista.length) }, async () => {
      while (i < lista.length) {
        const x = lista[i++];
        try { await fn(x); } catch (e) { falhas.push({ x, erro: e.message }); }
      }
    })
  );
  return falhas;
}
const ok = (r, onde) => {
  if (r.error) throw new Error(`${onde}: ${r.error.message}`);
  return r.data;
};
const margem = (venda, custo) => {
  if (!(custo > 0)) return null;
  const m = Math.round(((venda - custo) / custo) * 10000) / 100;
  return Math.abs(m) < 10000 ? m : null; // numeric(6,2)
};

async function enviarFotos(pacote, shas) {
  let feitas = 0;
  const falhas = await emParalelo(shas, 6, async (sha) => {
    const buf = fs.readFileSync(pacote.arquivos.get(sha).caminho);
    for (let t = 1; ; t++) {
      const { error } = await db.storage
        .from(BUCKET)
        .upload(`${PASTA_STORAGE}/${sha}.jpg`, buf, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (!error || /exists|duplicate/i.test(error.message)) break;
      if (t >= 3) throw new Error(error.message);
      await new Promise((r) => setTimeout(r, 1500 * t));
    }
    if (++feitas % 250 === 0) console.log(`  fotos: ${feitas}/${shas.length}`);
  });
  return { feitas, falhas };
}

async function gravarImagens(id, urls) {
  const linhas = urls
    .map((url, position) => (url ? { tenant_id: TENANT, item_id: id, url, position } : null))
    .filter(Boolean);
  if (linhas.length) ok(await db.from("item_images").upsert(linhas, { onConflict: "item_id,position" }), "item_images");
}

async function aplicar(pacote, banco, plano) {
  console.log(`\n1/6 enviando ${plano.fotosEnviar.length} foto(s) para o bucket ${BUCKET}...`);
  const fotos = await enviarFotos(pacote, plano.fotosEnviar);
  if (fotos.falhas.length) {
    console.error("PAROU: fotos que nao subiram (nada foi gravado no banco):", fotos.falhas.slice(0, 5));
    process.exit(1);
  }

  console.log(`2/6 cadastrando ${plano.novos.length} produto(s) novo(s) (inativos)...`);
  const criados = [];
  for (const parte of lote(plano.novos, 100)) {
    const ins = ok(
      await db
        .from("catalog_items")
        .insert(parte.map((n) => ({ tenant_id: TENANT, sku: n.sku, name: n.nome, category: n.setor, active: false })))
        .select("id, sku"),
      "catalog_items"
    );
    const idDe = new Map(ins.map((x) => [x.sku, x.id]));
    const com = parte.map((n) => ({ ...n, id: idDe.get(n.sku) }));
    ok(await db.from("item_fiscal_data").insert(com.map((n) => ({ item_id: n.id, ncm: n.ncm, ...FISCAL_PADRAO }))), "item_fiscal_data");
    ok(
      await db.from("item_commercial_data").insert(
        com.map((n) => ({ item_id: n.id, preco_custo: n.custo, cost_price: n.custo, margin_percent: margem(n.venda, n.custo), min_stock: 0 }))
      ),
      "item_commercial_data"
    );
    ok(await db.from("item_prices").insert(com.map((n) => ({ item_id: n.id, ...BASE_PRECO, price: n.venda }))), "item_prices");
    ok(
      await db.from("item_stock_by_location").insert(com.map((n) => ({ item_id: n.id, location_id: banco.cdId, stock_on_hand: 0 }))),
      "item_stock_by_location"
    );
    for (const n of com) await gravarImagens(n.id, n.urls);
    criados.push(...com.map((n) => n.sku));
  }

  console.log(`3/6 linhas filhas faltando em ${plano.filhasFaltando.length} item(ns)...`);
  for (const f of plano.filhasFaltando) {
    if (f.falta.includes("fiscal"))
      ok(await db.from("item_fiscal_data").insert({ item_id: f.id, ncm: f.ncm, ...FISCAL_PADRAO }), "item_fiscal_data");
    if (f.falta.includes("estoque_cd"))
      ok(
        await db.from("item_stock_by_location").upsert({ item_id: f.id, location_id: banco.cdId, stock_on_hand: 0 }, { onConflict: "item_id,location_id" }),
        "item_stock_by_location"
      );
  }

  console.log(`4/6 nomes (${plano.nomes.length}), precos (${plano.precos.length}), custos (${plano.custos.length})...`);
  const falhas = [];
  falhas.push(
    ...(await emParalelo(plano.nomes, 6, async (n) =>
      ok(await db.from("catalog_items").update({ name: n.para }).eq("id", n.id), "nome")
    ))
  );
  falhas.push(
    ...(await emParalelo(plano.precos, 6, async (p) => {
      // mesma disciplina do salvarProduto/salvarPreco: grava a linha-base e so
      // depois apaga as outras da mesma faixa (sobra linha a mais, nunca a menos)
      ok(await db.from("item_prices").upsert({ item_id: p.id, ...BASE_PRECO, price: p.para }, { onConflict: "item_id,channel,min_quantity,valid_from" }), "preco");
      ok(
        await db.from("item_prices").delete().eq("item_id", p.id).eq("channel", "varejo").eq("min_quantity", 1).neq("valid_from", BASE_PRECO.valid_from),
        "preco_faixa"
      );
    }))
  );
  falhas.push(
    ...(await emParalelo(plano.custos, 6, async (c) => {
      if (c.semLinha)
        return ok(await db.from("item_commercial_data").insert({ item_id: c.id, preco_custo: c.para, cost_price: c.para, min_stock: 0 }), "custo");
      ok(await db.from("item_commercial_data").update({ preco_custo: c.para, ...(c.segueMedia ? { cost_price: c.para } : {}) }).eq("item_id", c.id), "custo");
    }))
  );

  console.log(`5/6 galeria de ${plano.imagens.length} item(ns) existente(s)...`);
  falhas.push(...(await emParalelo(plano.imagens, 6, (im) => gravarImagens(im.id, im.urls))));

  console.log("6/6 trilha em audit_log...");
  ok(
    await db.from("audit_log").insert({
      tenant_id: TENANT,
      actor_user_id: null,
      action: "catalogo.importar_jq",
      entity: "catalog_items",
      entity_id: null,
      before: {
        nomes: plano.nomes.map(({ sku, de }) => ({ sku, de })),
        precos: plano.precos.map(({ sku, de }) => ({ sku, de })),
        custos: plano.custos.map(({ sku, de, mediaDe }) => ({ sku, de, mediaDe })),
        imagens: plano.imagens.map(({ sku, de }) => ({ sku, de })),
      },
      after: {
        pacote: path.basename(path.resolve(PACOTE)),
        novos: criados,
        contagens: {
          novos: criados.length,
          nomes: plano.nomes.length,
          precos: plano.precos.length,
          custos: plano.custos.length,
          imagens: plano.imagens.length,
          fotos_enviadas: fotos.feitas,
          falhas: falhas.length,
        },
      },
    }),
    "audit_log"
  );
  return falhas;
}

// ---------- principal ----------
async function main() {
  console.log(`pacote: ${path.resolve(PACOTE)}`);
  console.log(`banco:  ${URL_SB} (${PRODUCAO ? "PRODUCAO" : "staging"}) - modo ${APLICAR ? "APLICAR" : "SIMULACAO (nada e gravado)"}`);
  const pacote = lerPacote(PACOTE);
  const mb = [...pacote.arquivos.values()].reduce((s, a) => s + a.bytes, 0) / 1048576;
  console.log(`pacote: ${pacote.itens.length} SKUs, ${pacote.arquivos.size} fotos unicas (${mb.toFixed(1)} MB), ${pacote.erros.length} erro(s)`);
  if (pacote.erros.length) {
    for (const e of pacote.erros.slice(0, 20)) console.log("  ERRO " + e);
    console.error("PAROU: pacote com erro - nada foi lido do banco nem gravado.");
    process.exit(1);
  }
  const semFoto = pacote.itens.filter((r) => !r.fotos[0]).map((r) => r.sku);

  const banco = await lerBanco();
  const plano = planejar(pacote, banco);
  const setoresNovos = [...new Set(plano.novos.filter((n) => n.setorNovo).map((n) => n.setor))].sort();
  const resumo = {
    banco_itens: banco.itens.length,
    bucket_produtos: banco.bucketOk ? `existe (${banco.noBucket.size} foto(s) ja enviadas)` : "NAO EXISTE (aplicar a 0056 antes)",
    preco_calculado_pela_caixa: pacote.itens.filter((r) => r.precoPelaCaixa).length,
    novos_inativos: plano.novos.length,
    setores_novos: setoresNovos.length,
    novos_sem_ncm: plano.novos.filter((n) => !n.ncm).length,
    nomes_mudam: plano.nomes.length,
    precos_mudam: plano.precos.length,
    custos_mudam: plano.custos.length,
    custos_com_nota_media_preservada: plano.custos.filter((c) => !c.segueMedia).length,
    galerias_mudam_existentes: plano.imagens.length,
    linhas_filhas_faltando: plano.filhasFaltando.length,
    fotos_a_enviar: plano.fotosEnviar.length,
    sku_sem_capa: semFoto.length,
    sku_do_sistema_fora_do_jq_intocados: plano.foraDoJq,
    casaram_so_ignorando_maiuscula: plano.casamentoSoPorCaixa.length,
  };
  console.log("\nPLANO");
  for (const [k, v] of Object.entries(resumo)) console.log(`  ${k.padEnd(38)} ${v}`);
  const amostra = (titulo, lista, fmt) => {
    if (!lista.length) return;
    console.log(`\n${titulo} (5 de ${lista.length})`);
    for (const x of lista.slice(0, 5)) console.log("  " + fmt(x));
  };
  amostra("novos", plano.novos, (n) => `${n.sku} | ${n.setor}${n.setorNovo ? " (setor novo)" : ""} | venda ${n.venda} custo ${n.custo} | ncm ${n.ncm ?? "-"}`);
  amostra("nomes", plano.nomes, (n) => `${n.sku}: "${n.de}" -> "${n.para}"`);
  amostra("precos", plano.precos, (p) => `${p.sku}: ${p.de.join("/") || "-"} -> ${p.para}`);
  amostra("custos", plano.custos, (c) => `${c.sku}: ${c.de ?? "-"} -> ${c.para}${c.segueMedia ? "" : " (media do Compras preservada)"}`);
  if (setoresNovos.length) console.log(`\nsetores novos: ${setoresNovos.join(", ")}`);

  const arq = opc("--relatorio");
  if (arq) {
    fs.writeFileSync(arq, JSON.stringify({ resumo, setoresNovos, semFoto, plano }, null, 1));
    console.log(`\nrelatorio completo: ${path.resolve(arq)}`);
  }
  if (!APLICAR) {
    console.log("\nSIMULACAO: nada foi gravado. Para gravar: acrescentar --aplicar.");
    return;
  }
  if (!banco.bucketOk) {
    console.error("PAROU: bucket 'produtos' nao existe - aplicar a migration 0056 antes.");
    process.exit(1);
  }
  const falhas = await aplicar(pacote, banco, plano);
  if (falhas.length) {
    console.error(`\nTERMINOU COM ${falhas.length} FALHA(S) - rodar de novo grava so o que falta:`);
    for (const f of falhas.slice(0, 10)) console.error(`  ${f.x.sku}: ${f.erro}`);
    process.exit(1);
  }
  console.log("\nOK: importacao concluida. Rodar a simulacao de novo deve mostrar tudo zerado.");
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
