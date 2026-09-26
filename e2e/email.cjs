/* E2E F6.5 - módulo de e-mail (gate de aceite local).
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Rode tudo juntos com: npm run e2e
 * Sempre: RBAC de /email (307/403), leitura de inbound injetado (marcado
 * como lido), resposta/composição com e sem credencial, webhook 503 sem
 * secret. Condicionais (só com credenciais no .env.local): assinatura svix
 * válida/inválida + idempotência (RESEND_WEBHOOK_SECRET), envio real na API
 * (RESEND_API_KEY) e tratamento 404 da Receiving API. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const SENHA = "E2e#2026Test";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EMAIL_VENDEDOR = "e2e-vend-email-f65@nuvem-de-papel.com.br";
// destinatário sandbox do Resend (nunca entrega em caixa real nem dá bounce)
const EMAIL_SANDBOX = "delivered@resend.dev";
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
const TEM_KEY = !!env.RESEND_API_KEY;
const TEM_SECRET = !!env.RESEND_WEBHOOK_SECRET;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const marcador = `E2E-F65-${EPOCH}`;
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

async function aguardar(fn, cond, tentativas = 25) {
  for (let i = 0; i < tentativas; i++) {
    const v = await fn();
    if (cond(v)) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
  return await fn();
}

function assinarSvix(secret, id, ts, payload) {
  const segredo = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const mac = crypto
    .createHmac("sha256", Buffer.from(segredo, "base64"))
    .update(`${id}.${ts}.${payload}`)
    .digest("base64");
  return `v1,${mac}`;
}

async function postWebhook(body, { secret, assinatura }) {
  const payload = JSON.stringify(body);
  const id = `msg_e2e_${EPOCH}_${Math.floor(Math.random() * 1e6)}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const headers = { "content-type": "application/json" };
  if (assinatura !== false) {
    headers["svix-id"] = id;
    headers["svix-timestamp"] = ts;
    headers["svix-signature"] = assinarSvix(secret, id, ts, payload);
  }
  const resp = await fetch(BASE + "/api/webhooks/resend", {
    method: "POST",
    headers,
    body: payload,
  });
  const corpo = await resp.json().catch(() => null);
  return { status: resp.status, corpo };
}

let vendedorId = null;

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();

    // ---------------------------------------------------------- RBAC/rota --
    const anon = await page.goto(BASE + "/email", { waitUntil: "domcontentloaded" });
    check(
      "S1 /email anônimo redireciona para /login",
      anon && page.url().includes("/login"),
      `url=${page.url()}`
    );

    await login(page, EMAIL_MASTER, SENHA_MASTER);
    const respMaster = await page.goto(BASE + "/email", { waitUntil: "domcontentloaded" });
    check("S2 master abre /email (200)", respMaster && respMaster.status() === 200);
    await page.getByRole("heading", { name: "E-mail" }).waitFor({ timeout: 15000 });
    for (const aba of ["entrada", "enviados", "compor"]) {
      check(
        `S3 aba "${aba}" visível`,
        await page.locator(`button[aria-label="Aba ${aba}"]`).isVisible()
      );
    }

    // vendedor: 403 no middleware (RBAC /email = gestão)
    const criado = await admin.auth.admin.createUser({
      email: EMAIL_VENDEDOR,
      password: SENHA,
      email_confirm: true,
    });
    vendedorId = criado.data?.user?.id ?? null;
    if (!vendedorId && criado.error && /already/i.test(criado.error.message ?? "")) {
      const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 });
      vendedorId =
        (lista?.users || []).find(
          (u) => (u.email || "").toLowerCase() === EMAIL_VENDEDOR
        )?.id ?? null;
    }
    if (vendedorId) {
      await admin.from("profiles").upsert(
        {
          id: vendedorId,
          tenant_id: TENANT,
          email: EMAIL_VENDEDOR,
          full_name: "Vendedor E2E Email",
          role: "vendedor",
          status: "ativo",
        },
        { onConflict: "id" }
      );
      const pageV = await browser.newPage();
      await login(pageV, EMAIL_VENDEDOR, SENHA);
      const respV = await pageV.goto(BASE + "/email", { waitUntil: "domcontentloaded" });
      check(
        "S4 vendedor leva 403 em /email",
        respV && respV.status() === 403,
        `status=${respV && respV.status()}`
      );
      await pageV.close();
    } else {
      check("S4 vendedor leva 403 em /email", false, "createUser falhou");
    }

    // ------------------------------------------------- inbound injetado --
    const { data: inbound, error: erroIn } = await admin
      .from("email_messages")
      .insert({
        tenant_id: TENANT,
        direction: "inbound",
        status: "received",
        source: "system",
        from_email: "remetente-e2e@example.com",
        from_name: "Remetente E2E",
        to_emails: ["contatos@nuvemdepapel.com.br"],
        subject: `${marcador} inbound`,
        html: "<p>Corpo inbound E2E</p>",
        external_message_id: `e2e-${EPOCH}`,
        attachments: [],
      })
      .select("id")
      .single();
    check("S5 inbound de teste injetado", !erroIn && !!inbound, erroIn?.message ?? "");

    await page.goto(BASE + "/email", { waitUntil: "domcontentloaded" });
    const itemIn = page.locator("button", { hasText: marcador }).first();
    await itemIn.waitFor({ timeout: 15000 });
    check("S6 inbound aparece na Entrada", await itemIn.isVisible());
    await itemIn.click();
    const frame = page.frameLocator('iframe[title="Mensagem"]');
    await frame.getByText("Corpo inbound E2E").waitFor({ timeout: 15000 });
    check("S7 leitor renderiza o corpo (iframe sandbox)", true);

    const lida = await aguardar(
      async () => {
        const { data } = await admin
          .from("email_messages")
          .select("read_at")
          .eq("id", inbound.id)
          .maybeSingle();
        return data?.read_at;
      },
      (v) => !!v
    );
    check("S8 mensagem marcada como lida ao abrir", !!lida);

    // resposta: com key envia, sem key feedback de erro claro
    await page.getByRole("button", { name: "Responder" }).click();
    await page.fill('textarea[aria-label="Texto da resposta"]', "Resposta E2E");
    await page.getByRole("button", { name: "Enviar resposta" }).click();
    const fbResp = page.getByRole("status");
    await fbResp.waitFor({ timeout: 15000 });
    const textoResp = (await fbResp.textContent()) ?? "";
    if (TEM_KEY) {
      check("S9a resposta aceita (credencial presente)", textoResp === "Feito.", textoResp);
    } else {
      check(
        "S9b resposta expõe erro sem credencial",
        textoResp.includes("RESEND_API_KEY"),
        textoResp
      );
    }

    // -------------------------------------------------------- composição --
    await page.locator('button[aria-label="Aba compor"]').click();
    await page.fill('input[aria-label="Destinatário"]', TEM_KEY ? EMAIL_SANDBOX : "dest-e2e@example.com");
    await page.fill('input[aria-label="Assunto"]', marcador);
    await page.fill('textarea[aria-label="Mensagem"]', "<p>Composição E2E</p>");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await page.getByRole("status").waitFor({ timeout: 15000 });
    const textoEnv = (await page.getByRole("status").textContent()) ?? "";
    if (TEM_KEY) {
      check("S10a composição envia (credencial presente)", textoEnv === "Mensagem enviada.", textoEnv);
      const enviada = await aguardar(
        async () => {
          const { data } = await admin
            .from("email_messages")
            .select("status, resend_id")
            .eq("direction", "outbound")
            .eq("subject", marcador)
            .maybeSingle();
          return data;
        },
        (v) => !!v && v.status === "sent" && !!v.resend_id
      );
      check(
        "S11a fila local vira sent com resend_id",
        !!enviada && enviada.status === "sent" && !!enviada.resend_id,
        JSON.stringify(enviada)
      );
    } else {
      check(
        "S10b composição expõe erro sem credencial",
        textoEnv.includes("RESEND_API_KEY"),
        textoEnv
      );
    }

    // ----------------------------------------------------------- webhook --
    const semSecret = await postWebhook(
      { type: "email.sent", data: { email_id: `e2e-${EPOCH}` } },
      { secret: "whsec_e2e", assinatura: false }
    );
    if (TEM_SECRET) {
      // secret existe: falta de header → 401 (assinatura inválida)
      check("S12a webhook sem assinatura → 401", semSecret.status === 401, `status=${semSecret.status}`);
      const ruim = await postWebhook(
        { type: "email.sent", data: { email_id: `e2e-ruim-${EPOCH}` } },
        { secret: "whsec_" + Buffer.from("segredo-errado!!").toString("base64"), assinatura: true }
      );
      check("S13 assinatura com secret errado → 401", ruim.status === 401, `status=${ruim.status}`);

      const bom = await postWebhook(
        { type: "email.sent", data: { email_id: `e2e-ok-${EPOCH}` } },
        { secret: env.RESEND_WEBHOOK_SECRET, assinatura: true }
      );
      check(
        "S14 assinatura válida → 200",
        bom.status === 200 && bom.corpo?.status === "processado",
        `status=${bom.status} corpo=${JSON.stringify(bom.corpo)}`
      );
      const deNovo = await postWebhook(
        { type: "email.sent", data: { email_id: `e2e-ok-${EPOCH}` } },
        { secret: env.RESEND_WEBHOOK_SECRET, assinatura: true }
      );
      // mesmo email_id+tipo → idempotência (svix-id novo não importa)
      check(
        "S15 idempotência do webhook",
        deNovo.status === 200 && deNovo.corpo?.status === "duplicado",
        JSON.stringify(deNovo.corpo)
      );
      if (TEM_KEY) {
        const recebido = await postWebhook(
          { type: "email.received", data: { email_id: `e2e-in-${EPOCH}` } },
          { secret: env.RESEND_WEBHOOK_SECRET, assinatura: true }
        );
        check(
          "S16 email.received com id inexistente → 200 (404 tratado)",
          recebido.status === 200 && recebido.corpo?.status === "email_ausente",
          `status=${recebido.status} corpo=${JSON.stringify(recebido.corpo)}`
        );
      }
    } else {
      check("S12b webhook sem secret configurado → 503", semSecret.status === 503, `status=${semSecret.status}`);
      console.log("SKIP - assinatura/idempotência: defina RESEND_WEBHOOK_SECRET no .env.local");
      if (TEM_KEY) console.log("SKIP - email.received: defina também RESEND_WEBHOOK_SECRET");
    }

    // -------------------------------------------------------- nos envia --
    await page.goto(BASE + "/email", { waitUntil: "domcontentloaded" });
    await page.locator('button[aria-label="Aba enviados"]').click();
    const itemOut = page.locator("button", { hasText: marcador }).first();
    if (await itemOut.isVisible({ timeout: 5000 }).catch(() => false)) {
      check("S17 aba Enviados lista a mensagem", true);
      await itemOut.click();
      await page.frameLocator('iframe[title="Mensagem"]').waitFor({ timeout: 15000 });
      check("S18 leitor abre a mensagem enviada", true);
    } else {
      // sem credencial nada foi gravado na fila (no-op por design)
      check("S17 aba Enviados sem mensagens (no-op sem credencial)", !TEM_KEY);
      check("S18 leitor da mensagem enviada pulado", !TEM_KEY);
    }
  } catch (e) {
    check("execução sem exceções", false, e instanceof Error ? e.message : String(e));
  } finally {
    await browser.close();
    try {
      await admin.from("email_messages").delete().or(
        `subject.ilike.%${marcador}%,external_message_id.eq.e2e-${EPOCH}`
      );
      await admin.from("webhook_events").delete().like("external_id", `e2e-%${EPOCH}`);
      await admin.from("email_messages").delete().eq("from_email", "remetente-e2e@example.com");
      if (vendedorId) await admin.auth.admin.deleteUser(vendedorId);
    } catch (e) {
      console.log("aviso cleanup:", e instanceof Error ? e.message : e);
    }
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nE2E F6.5: ${resultados.length - falhas}/${resultados.length} checks`);
  process.exit(falhas === 0 ? 0 : 1);
})();
