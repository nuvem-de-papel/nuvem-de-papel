/* E2E Pedido corporativo (0060 - etapa 3, 20/11/2026): painel do comprador
 * e pedido no atacado com checagem de credito.
 * Fixture direto no banco: empresa ATIVA (limite 100, prazo 28), comprador
 * admin + login financeiro, item com atacado 7,50 / varejo 10,00, estoque 50.
 * (G) painel mostra credito · (H) pedido pela tela dentro do limite
 * (I) credito consumido · (J) pedido acima do limite recusado
 * (K) idempotencia + entrega pela RPC · (L) financeiro so ve
 * (M) parcela vencida trava · limpeza no fim (so staging).
 * 21/11/2026 (etapa 4): H7-H9 alerta de pedido PJ por e-mail; K4 RPC direta nao avisa.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");

function lerEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const i = linha.indexOf("=");
    if (i > 0 && !linha.startsWith("#")) env[linha.slice(0, i)] = linha.slice(i + 1);
  }
  return env;
}
const ENV = lerEnv();
if (!(ENV.NEXT_PUBLIC_SUPABASE_URL || "").includes("cwfvxthfwbvpfjhsxpmc")) {
  throw new Error("corporativo-pedido.cjs so roda contra o Supabase de staging");
}
const db = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = process.argv[2] || "http://localhost:3000";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EPOCH = Date.now();
const RAZAO = `E2E CORP PEDIDO ${EPOCH} LTDA`;
const EMAIL_ADMIN = `corpped.${EPOCH}@teste.local`;
const EMAIL_FIN = `corpfin.${EPOCH}@teste.local`;
const SENHA = "senha123teste";
const SKU = "SKU-E2E-CORP-PEDIDO";
const SALDO = 50;
const LIMITE = 100;
const PRAZO = 28;

function gerarCnpj() {
  const base = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).concat([0, 0, 0, 1]);
  const dv = (nums, pesos) => {
    const s = nums.reduce((a, n, i) => a + n * pesos[i], 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base.concat(d1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base.concat(d1, d2).join("");
}
const CNPJ = gerarCnpj();

let total = 0;
let falhas = 0;
function check(nome, ok, extra = "") {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"} ${nome}${extra ? " - " + extra : ""}`);
}
const norm = (s) => (s ?? "").replace(/\s+/g, " ").toLowerCase();

async function esperar(fn, ms = 15000) {
  const fim = Date.now() + ms;
  let v;
  while (Date.now() < fim) {
    v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  return v;
}

async function saldo(itemId) {
  const { data } = await db.from("item_stock").select("stock_available").eq("item_id", itemId).maybeSingle();
  return data ? Number(data.stock_available) : 0;
}
async function ajustarSaldo(itemId, alvo, nota) {
  const atual = await saldo(itemId);
  if (atual === alvo) return;
  await db.rpc("register_stock_movement", {
    p_item_id: itemId,
    p_type: "ajuste",
    p_quantity: alvo - atual,
    p_reference_type: "manual",
    p_reference_id: null,
    p_notes: nota,
    p_created_by: null,
  });
}

async function login(page, email) {
  await page.goto(BASE + "/login?next=/conta", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#senha", SENHA);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

async function main() {
  // fixture ------------------------------------------------------------------
  let { data: item } = await db.from("catalog_items").select("id").eq("sku", SKU).maybeSingle();
  if (!item) {
    const { data, error } = await db
      .from("catalog_items")
      .insert({ tenant_id: TENANT, sku: SKU, name: "Item E2E Corporativo", active: true })
      .select("id")
      .single();
    if (error) throw new Error("seed item: " + error.message);
    item = data;
  } else {
    await db.from("catalog_items").update({ active: true }).eq("id", item.id);
  }
  for (const [channel, price] of [["varejo", 10], ["atacado", 7.5]]) {
    await db.from("item_prices").upsert(
      { item_id: item.id, channel, price, min_quantity: 1, valid_from: "1970-01-01T00:00:00Z" },
      { onConflict: "item_id,channel,min_quantity,valid_from" }
    );
  }
  await ajustarSaldo(item.id, SALDO, "seed E2E corporativo-pedido");

  const uA = await db.auth.admin.createUser({ email: EMAIL_ADMIN, password: SENHA, email_confirm: true });
  const uF = await db.auth.admin.createUser({ email: EMAIL_FIN, password: SENHA, email_confirm: true });
  if (uA.error || uF.error) throw new Error("seed usuarios: " + (uA.error ?? uF.error).message);
  const userAdmin = uA.data.user.id;
  const userFin = uF.data.user.id;
  let contaId = null;
  let clienteId = null;
  const browser = await chromium.launch({ headless: true, channel: "msedge" });

  try {
    const { data: cli, error: eCli } = await db
      .from("customers")
      .insert({ tenant_id: TENANT, name: RAZAO, email: EMAIL_ADMIN, documento: CNPJ, auth_user_id: userAdmin, ativo: true })
      .select("id")
      .single();
    if (eCli) throw new Error("seed customers: " + eCli.message);
    clienteId = cli.id;
    const { data: conta, error: eConta } = await db
      .from("corporate_accounts")
      .insert({
        tenant_id: TENANT,
        customer_id: clienteId,
        razao_social: RAZAO,
        cnpj: CNPJ,
        status: "ativa",
        limite_credito: LIMITE,
        prazo_dias: PRAZO,
        aprovado_em: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (eConta) throw new Error("seed conta: " + eConta.message);
    contaId = conta.id;
    const { error: eBuy } = await db.from("corporate_buyers").insert([
      { tenant_id: TENANT, account_id: contaId, auth_user_id: userAdmin, papel: "admin" },
      { tenant_id: TENANT, account_id: contaId, auth_user_id: userFin, papel: "financeiro" },
    ]);
    if (eBuy) throw new Error("seed compradores: " + eBuy.message);

    // G) painel ----------------------------------------------------------------
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await login(pg, EMAIL_ADMIN);
    await pg.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    const kpis = pg.locator('[aria-label="Crédito da empresa"]');
    await kpis.waitFor({ timeout: 20000 });
    const txtK = norm(await kpis.innerText());
    check("G1 painel mostra limite e disponivel", txtK.includes("r$ 100,00") && txtK.includes("28 dias"), txtK.slice(0, 160));
    const form = pg.locator('form[aria-label="Novo pedido corporativo"]');
    check("G2 formulario de pedido aparece para o admin", (await form.count()) === 1);

    // H) pedido pela tela dentro do limite --------------------------------------
    await form.getByLabel("Buscar produto do pedido").fill("E2E Corporativo");
    await form.getByRole("button", { name: `Adicionar ${SKU}` }).click();
    await form.getByLabel(`Quantidade ${SKU}`).fill("4");
    const resumo = norm(await form.locator('[aria-label="Resumo do pedido"]').innerText());
    check("H1 total estimado no atacado (4 x 7,50)", resumo.includes("r$ 30,00"), resumo);
    await form.getByLabel("Observação do pedido").fill("Pedido E2E corporativo");
    await form.getByRole("button", { name: "Fazer pedido" }).click();
    const ok = form.locator('[role="status"]');
    await ok.waitFor({ timeout: 25000 });
    check("H2 tela confirma o pedido", norm(await ok.innerText()).includes("registrado: r$ 30,00"), await ok.innerText());

    const { data: peds } = await db
      .from("orders")
      .select("id, channel, status, origem, total_amount, condicao, user_id, venda_numero, payment_method")
      .eq("corporate_account_id", contaId);
    const p1 = (peds ?? [])[0];
    check(
      "H3 pedido gravado corporativo/atacado/faturado",
      (peds ?? []).length === 1 && p1.origem === "corporativo" && p1.channel === "atacado" && p1.status === "pago" &&
        Number(p1.total_amount) === 30 && p1.condicao === `${PRAZO} dias` && p1.user_id === userAdmin && /^V-/.test(p1.venda_numero ?? ""),
      JSON.stringify(p1)
    );
    const { data: tit } = await db
      .from("financial_titles")
      .select("id, source_type, direction, customer_id, financial_installments(due_date, principal_amount, status)")
      .eq("source_id", p1?.id ?? "")
      .maybeSingle();
    const parc = tit?.financial_installments ?? [];
    const vencEsperado = new Date(Date.now() + PRAZO * 86400000).toISOString().slice(0, 10);
    check(
      "H4 titulo a receber com 1 parcela no prazo",
      tit?.source_type === "corporativo" && tit?.direction === "receivable" && tit?.customer_id === clienteId &&
        parc.length === 1 && Number(parc[0].principal_amount) === 30 && parc[0].due_date === vencEsperado,
      JSON.stringify(tit)
    );
    check("H5 estoque baixou 4", (await saldo(item.id)) === SALDO - 4);
    const { count: aud } = await db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "corporativo.pedido")
      .eq("entity_id", p1?.id ?? "");
    check("H6 auditoria corporativo.pedido", aud === 1);
    // alerta para a loja (etapa 4 - 21/11/2026)
    const { data: alertas } = await db.from("corporate_alerts").select("id, canal, status, erro, account_id").eq("order_id", p1?.id ?? "");
    const al = (alertas ?? [])[0];
    check(
      "H7 um alerta por e-mail gravado (enviado, ou falhou com motivo)",
      (alertas ?? []).length === 1 && al.canal === "email" && al.account_id === contaId &&
        (al.status === "enviado" || (al.status === "falhou" && !!al.erro)),
      JSON.stringify(alertas)
    );
    if (ENV.RESEND_API_KEY) {
      const { data: msgs } = await db.from("email_messages").select("subject").eq("related_entity", "orders").eq("related_id", p1?.id ?? "");
      check(
        "H8 e-mail do alerta registrado com o numero do pedido",
        (msgs ?? []).length === 1 && msgs[0].subject.includes(p1?.venda_numero ?? "??") && msgs[0].subject.includes(RAZAO),
        JSON.stringify(msgs)
      );
    } else {
      check("H8 sem RESEND_API_KEY: nenhum e-mail esperado", true);
    }
    const dup = await db.from("corporate_alerts").insert({ tenant_id: TENANT, order_id: p1?.id, account_id: contaId, canal: "email" });
    check("H9 segundo alerta do mesmo pedido recusado (23505)", dup.error?.code === "23505", dup.error?.code);

    // I) credito consumido -------------------------------------------------------
    const { data: cred } = await db.rpc("corporate_credit", { p_account: contaId });
    check("I1 corporate_credit: em aberto 30, disponivel 70", Number(cred?.em_aberto) === 30 && Number(cred?.disponivel) === 70, JSON.stringify(cred));
    await pg.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    await kpis.waitFor({ timeout: 20000 });
    check("I2 painel mostra disponivel 70,00", norm(await kpis.innerText()).includes("r$ 70,00"));
    const lista = pg.locator('section[aria-label="Pedidos da empresa"]');
    check("I3 pedido na lista da empresa", (await lista.innerText()).includes(p1?.venda_numero ?? "??"));

    // J) pedido acima do limite ----------------------------------------------------
    await form.getByLabel("Buscar produto do pedido").fill(SKU);
    await form.getByRole("button", { name: `Adicionar ${SKU}` }).click();
    await form.getByLabel(`Quantidade ${SKU}`).fill("10");
    check("J1 aviso de credito estourado na tela", norm(await form.innerText()).includes("passa do crédito disponível"));
    await form.getByRole("button", { name: "Fazer pedido" }).click();
    const erro = form.locator('[role="alert"]');
    await erro.waitFor({ timeout: 25000 });
    check("J2 servidor recusa acima do limite", norm(await erro.innerText()).includes("limite de crédito insuficiente"), await erro.innerText());
    const { count: nPed } = await db.from("orders").select("id", { count: "exact", head: true }).eq("corporate_account_id", contaId);
    check("J3 nenhum pedido novo gravado", nPed === 1);
    await ctx.close();

    // K) idempotencia + entrega pela RPC -----------------------------------------
    const chave = `corp:e2e-${EPOCH}`;
    const args = {
      p_user: userAdmin,
      p_items: [{ item_id: item.id, quantity: 2 }],
      p_entrega: { cep: "01310100", logradouro: "Av Paulista", numero: "1000", bairro: "Bela Vista", cidade: "Sao Paulo", uf: "SP" },
      p_observacao: null,
      p_idempotency_key: chave,
    };
    const r1 = await db.rpc("corporate_place_order", args);
    const r2 = await db.rpc("corporate_place_order", args);
    check(
      "K1 mesma chave nao duplica",
      !r1.error && !r2.error && r2.data?.duplicate === true && r2.data?.order_id === r1.data?.order_id,
      JSON.stringify({ e1: r1.error?.message, e2: r2.error?.message, d2: r2.data })
    );
    const { data: ent } = await db.from("entregas").select("status").eq("order_id", r1.data?.order_id ?? "");
    check("K2 entrega aguardando criada", (ent ?? []).length === 1 && ent[0].status === "aguardando", JSON.stringify(ent));
    const { data: cred2 } = await db.rpc("corporate_credit", { p_account: contaId });
    check("K3 credito: disponivel 55", Number(cred2?.disponivel) === 55, JSON.stringify(cred2));
    const { count: alK } = await db.from("corporate_alerts").select("id", { count: "exact", head: true }).eq("order_id", r1.data?.order_id ?? "");
    check("K4 RPC direta nao avisa (alerta mora na action)", alK === 0);

    // L) financeiro so ve -----------------------------------------------------------
    const ctxF = await browser.newContext();
    const pf = await ctxF.newPage();
    await login(pf, EMAIL_FIN);
    await pf.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    await pf.locator('[aria-label="Crédito da empresa"]').waitFor({ timeout: 20000 });
    const secPed = pf.locator('section[aria-label="Novo pedido da empresa"]');
    check(
      "L1 financeiro ve o credito e nao o formulario",
      (await pf.locator('form[aria-label="Novo pedido corporativo"]').count()) === 0 &&
        norm(await secPed.innerText()).includes("acesso é do financeiro")
    );
    const rF = await db.rpc("corporate_place_order", { ...args, p_user: userFin, p_entrega: null, p_idempotency_key: `corp:e2e-fin-${EPOCH}` });
    check("L2 RPC recusa o financeiro", (rF.error?.message ?? "").includes("COMPRADOR_SEM_PERMISSAO"), rF.error?.message);
    await ctxF.close();

    // M) parcela vencida trava ------------------------------------------------------
    await db.from("financial_installments").update({ due_date: "2020-01-01" }).eq("title_id", tit?.id ?? "");
    const rV = await db.rpc("corporate_place_order", { ...args, p_entrega: null, p_idempotency_key: `corp:e2e-venc-${EPOCH}` });
    check("M1 RPC recusa com parcela vencida", (rV.error?.message ?? "").includes("TITULO_VENCIDO"), rV.error?.message);
    const ctxV = await browser.newContext();
    const pv = await ctxV.newPage();
    await login(pv, EMAIL_ADMIN);
    await pv.goto(BASE + "/corporativo", { waitUntil: "domcontentloaded" });
    const secV = pv.locator('section[aria-label="Novo pedido da empresa"]');
    await secV.waitFor({ timeout: 20000 });
    check(
      "M2 painel trava pedido e mostra vencido",
      (await pv.locator('form[aria-label="Novo pedido corporativo"]').count()) === 0 && norm(await secV.innerText()).includes("parcelas vencidas")
    );
    await ctxV.close();
  } finally {
    // limpeza: titulos/parcelas (sem liquidacao) -> pedidos -> empresa -> cliente -> logins
    if (contaId) {
      const { data: peds } = await db.from("orders").select("id").eq("corporate_account_id", contaId);
      const ids = (peds ?? []).map((p) => p.id);
      if (ids.length) {
        const { data: tits } = await db.from("financial_titles").select("id").in("source_id", ids);
        const tIds = (tits ?? []).map((t) => t.id);
        if (tIds.length) {
          await db.from("financial_installments").delete().in("title_id", tIds);
          await db.from("financial_titles").delete().in("id", tIds);
        }
        await db.from("email_messages").delete().eq("related_entity", "orders").in("related_id", ids);
        await db.from("orders").delete().in("id", ids);
      }
      await db.from("corporate_buyers").delete().eq("account_id", contaId);
      await db.from("corporate_accounts").delete().eq("id", contaId);
    }
    if (clienteId) await db.from("customers").delete().eq("id", clienteId);
    await db.auth.admin.deleteUser(userAdmin);
    await db.auth.admin.deleteUser(userFin);
    await ajustarSaldo(item.id, SALDO, "limpeza E2E corporativo-pedido");
    await db.from("catalog_items").update({ active: false }).eq("id", item.id);
    await browser.close();
  }
  const { count: sobra } = await db.from("corporate_accounts").select("id", { count: "exact", head: true }).eq("cnpj", CNPJ);
  check("Z1 limpeza: empresa removida", sobra === 0);
  console.log(`TOTAL ${total} | PASS ${total - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
