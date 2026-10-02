/* E2E SEFAZ - F8.2 (maquina de estados da NF-e + transporte em modo mock).
 * Requisitos: npm run build && npm run start (:3000) + .env.local com
 * SEFAZ_MOCK=1 (o Vercel de producao roda SEM mock = fail-closed).
 * Rode tudo juntos com: npm run e2e
 * Cobre: nota nasce pendente, transmitir -> transmitida (recibo), consultar
 * -> autorizada (chave 44 + protocolo no documento), cancelar via evento da
 * SEFAZ (mock) -> cancelada, invariante do banco e limpeza/restauracao. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EPOCH = Date.now();

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

async function esperarAviso(page, trecho, timeout = 20000) {
  await page.waitForFunction(
    (t) => ((document.querySelector('[role="status"]') || {}).textContent || "").includes(t),
    trecho,
    { timeout }
  );
  return (await page.locator('[role="status"]').first().textContent()) || "";
}

async function main() {
  // emitente: garante CNPJ (a action de transmitir exige) e restaura no fim
  const { data: empAntes } = await admin
    .from("tenant_company")
    .select("*")
    .eq("tenant_id", TENANT)
    .maybeSingle();
  if (!empAntes || (empAntes.cnpj || "").replace(/\D/g, "").length !== 14) {
    await admin.from("tenant_company").upsert(
      {
        tenant_id: TENANT,
        razao_social: "EMPRESA E2E SEFAZ LTDA",
        cnpj: "11222333000181",
        regime: "simples",
        endereco: { uf: "SP", cep: "01000-000" },
      },
      { onConflict: "tenant_id" }
    );
  }

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  let customerId = null;
  let pedidoId = null;
  let notaId = null;
  try {
    const page = await browser.newPage();
    page.on("dialog", (d) => d.accept());
    await login(page, EMAIL_MASTER, SENHA_MASTER);

    if (env.SEFAZ_MOCK !== "1" && env.SEFAZ_MOCK !== "true") {
      check("S0 SEFAZ_MOCK=1 no .env.local", false, `valor=${env.SEFAZ_MOCK}`);
    } else {
      check("S0 SEFAZ_MOCK=1 no .env.local", true);
    }

    // pedido de teste (mesma receita do vendas.cjs)
    const { data: cust } = await admin
      .from("customers")
      .insert({
        tenant_id: TENANT,
        name: `Cliente SEFAZ E2E ${EPOCH}`,
        email: `e2e-sefaz-${EPOCH}@exemplo.com`,
      })
      .select("id")
      .single();
    customerId = cust?.id ?? null;
    const { data: ped } = await admin
      .from("orders")
      .insert({ tenant_id: TENANT, customer_id: customerId, status: "processando", total_amount: 89.9 })
      .select("id")
      .single();
    pedidoId = ped?.id ?? null;
    await admin.from("order_items").insert({
      tenant_id: TENANT,
      order_id: pedidoId,
      sku: "SKU-E2E-SEFAZ",
      name: "Item E2E SEFAZ",
      unit_price: 89.9,
      quantity: 1,
      total: 89.9,
    });
    check("S1 pedido de teste criado", !!pedidoId && !!customerId);

    // emissao pela UI (a nota nasce pendente)
    const codigo = `PED-${String(pedidoId).slice(0, 8).toUpperCase()}`;
    await page.goto(BASE + "/vendas", { waitUntil: "domcontentloaded" });
    await page.getByText(codigo).first().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: `Emitir NF-e ${codigo}` }).click();
    await page.getByRole("dialog", { name: "Emissão de nota fiscal" }).waitFor({ timeout: 10000 });
    await page.getByLabel("CNPJ / CPF").fill("12.345.678/0001-90");
    await page.getByRole("button", { name: "Confirmar emissão" }).click();
    const avisoEmit = await esperarAviso(page, "pendente de transmissão");
    const numero = Number((avisoEmit.match(/NF-e (\d+) série/) || [])[1] || 0);
    check("S2 nota criada e nasce pendente", numero > 0, avisoEmit.trim());

    const { data: nota } = await admin
      .from("nfe_emissoes")
      .select("id, status")
      .eq("order_id", pedidoId)
      .maybeSingle();
    notaId = nota?.id ?? null;
    check("S3 banco: status pendente (nunca emitida)", nota?.status === "pendente", `status=${nota?.status}`);

    // transmissao ---------------------------------------------------------
    await page.getByRole("button", { name: `Transmitir NF-e ${numero}` }).click();
    const avisoTx = await esperarAviso(page, "transmitida");
    check("S4 transmitir devolve recibo", avisoTx.includes("recibo"), avisoTx.trim());
    let temConsultar = true;
    try {
      await page.getByRole("button", { name: `Consultar NF-e ${numero}` }).waitFor({ timeout: 15000 });
    } catch {
      temConsultar = false;
    }
    check("S5 nota vira Transmitida (botao Consultar aparece)", temConsultar);

    // consulta ------------------------------------------------------------
    await page.getByRole("button", { name: `Consultar NF-e ${numero}` }).click();
    const avisoCo = await esperarAviso(page, "autorizada");
    check("S6 consultar autoriza com protocolo", avisoCo.includes("protocolo"), avisoCo.trim());
    let temCancelar = true;
    try {
      await page.getByRole("button", { name: `Cancelar NF-e ${numero}` }).waitFor({ timeout: 15000 });
    } catch {
      temCancelar = false;
    }
    check("S7 nota vira Autorizada (botao Cancelar aparece)", temCancelar);

    // documento com chave + protocolo --------------------------------------
    await page.getByRole("button", { name: `Ver documento NF-e ${numero}` }).click();
    await page.getByRole("dialog", { name: `Documento da NF-e ${numero}` }).waitFor({ timeout: 10000 });
    const docTxt = (await page.getByRole("dialog", { name: `Documento da NF-e ${numero}` }).textContent()) || "";
    const chave = (docTxt.match(/Chave (\d{44})/) || [])[1] || "";
    check(
      "S8 documento mostra chave de 44 digitos e protocolo",
      chave.length === 44 && docTxt.includes("Protocolo"),
      `len=${chave.length} proto=${docTxt.includes("Protocolo")} chave=${chave.slice(0, 16)}`
    );
    await page.getByRole("button", { name: "Fechar documento" }).click();

    // cancelamento via evento SEFAZ (mock) ---------------------------------
    await page.getByRole("button", { name: `Cancelar NF-e ${numero}` }).click();
    const avisoCancel = await esperarAviso(page, "cancelada");
    check("S9 cancelamento de autorizada passa pelo evento (mock)", /NF-e \d+ cancelada\./.test(avisoCancel), avisoCancel.trim());

    const { data: final } = await admin
      .from("nfe_emissoes")
      .select("status, chave, protocolo, recibo, xml, ambiente, cancelada_em")
      .eq("id", notaId)
      .maybeSingle();
    check(
      "S10 banco: cancelada com chave/protocolo/recibo/xml preenchidos",
      final?.status === "cancelada" &&
        (final?.chave || "").length === 44 &&
        !!final?.protocolo &&
        !!final?.recibo &&
        !!final?.xml &&
        final?.ambiente === "homologacao" &&
        !!final?.cancelada_em,
      JSON.stringify({ ...final, xml: final?.xml ? `<${final.xml.length} chars>` : null })
    );
  } finally {
    await browser.close();
  }

  // limpeza ---------------------------------------------------------------
  if (pedidoId) {
    await admin.from("nfe_emissoes").delete().eq("order_id", pedidoId);
    await admin.from("order_items").delete().eq("order_id", pedidoId);
    await admin.from("orders").delete().eq("id", pedidoId);
  }
  if (customerId) await admin.from("customers").delete().eq("id", customerId);
  if (empAntes) {
    await admin.from("tenant_company").upsert(empAntes, { onConflict: "tenant_id" });
  } else {
    await admin.from("tenant_company").delete().eq("tenant_id", TENANT);
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
