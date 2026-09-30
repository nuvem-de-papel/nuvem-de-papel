/* E2E Vendas - menu lateral do painel + módulo /vendas (Vendas Detalhada)
 * + emissão/cancelamento de NF-e (emissão interna) + FloatingSocial novo.
 * Requisitos: npm run build && npm run start (:3000) + .env.local preenchido.
 * Rode tudo juntos com: npm run e2e
 * Cobre: menu lateral com engrenagem Configurações (Usuários/Auditoria),
 * PageHeader (título - subtítulo + Voltar) em /crm e /pdv, cores novas do
 * flutuante, RBAC de /vendas (403 p/ vendedor), emissão de NF-e pela UI a
 * partir de um pedido criado no banco, documento e cancelamento. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const SENHA = "E2e#2026Test";
const TENANT = "00000000-0000-0000-0000-000000000001";
const EMAIL_VENDEDOR = "e2e-vend-vendas@nuvem-de-papel.com.br";
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

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  let vendedorId = null;
  let customerId = null;
  let pedidoId = null;
  let itemId = null;
  let notaIds = [];

  try {
    const page = await browser.newPage();
    page.on("dialog", (d) => d.accept());

    // ---------------------------------------------- N) menu lateral / UI ----
    await login(page, EMAIL_MASTER, SENHA_MASTER);
    await page.goto(BASE + "/crm", { waitUntil: "domcontentloaded" });
    await page.locator("nav[aria-label='Navegação do painel']").waitFor({ timeout: 15000 });
    check("N1 menu lateral visível", await page.locator("nav[aria-label='Navegação do painel']").isVisible());
    check(
      "N2 link PDV no menu lateral",
      await page.getByRole("link", { name: "PDV", exact: true }).isVisible()
    );
    check(
      "N3 link Vendas Detalhada no menu",
      await page.getByRole("link", { name: "Vendas Detalhada" }).isVisible()
    );
    check(
      "N4 engrenagem Configurações no rodapé do menu",
      await page.getByRole("button", { name: "Configurações" }).isVisible()
    );
    const usuariosAntes = await page
      .getByRole("link", { name: "Usuários" })
      .isVisible()
      .catch(() => false);
    await page.getByRole("button", { name: "Configurações" }).click();
    check(
      "N5 engrenagem abre Usuários e Auditoria",
      !usuariosAntes &&
        (await page.getByRole("link", { name: "Usuários" }).isVisible()) &&
        (await page.getByRole("link", { name: "Auditoria" }).isVisible())
    );
    const ativo = await page.locator("a.admin-link--on").first().textContent();
    check("N6 item ativo destacado (Painel CRM)", (ativo || "").includes("Painel CRM"), ativo || "");
    check(
      "N7 /crm com título e botão Voltar",
      (await page.getByRole("heading", { name: "Painel CRM" }).isVisible()) &&
        (await page.getByRole("button", { name: "Voltar" }).isVisible())
    );

    await page.goto(BASE + "/pdv", { waitUntil: "domcontentloaded" });
    check(
      "N8 /pdv com título e botão Voltar",
      (await page.getByRole("heading", { name: "PDV" }).isVisible()) &&
        (await page.getByRole("button", { name: "Voltar" }).isVisible())
    );

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    const estilo = await page.evaluate(() => {
      const btns = [...document.querySelectorAll(".floating-social a")];
      if (!btns.length) return null;
      const cs = getComputedStyle(btns[0]);
      const zap = getComputedStyle(btns[btns.length - 1]);
      const foot = document.querySelector("footer");
      return {
        bg: cs.backgroundColor,
        cor: cs.color,
        zap: zap.backgroundColor,
        rodapeVisivel: !!foot && foot.getBoundingClientRect().height > 0,
        coluna: getComputedStyle(btns[0].parentElement).flexDirection,
      };
    });
    check(
      "N9 flutuante no padrão do rodapé (círculo cinza + zap verde, vertical)",
      estilo &&
        estilo.bg === "rgb(77, 77, 77)" &&
        estilo.cor === "rgb(255, 255, 255)" &&
        estilo.zap === "rgb(37, 211, 102)" &&
        estilo.coluna === "column",
      JSON.stringify(estilo)
    );
    check("N9b rodapé da loja visível na home", estilo && estilo.rodapeVisivel);

    // área administrativa: sem rodapé e sem flutuante (pedido do cliente)
    await page.goto(BASE + "/crm", { waitUntil: "domcontentloaded" });
    const visivel = await page.evaluate(() => {
      const foot = document.querySelector("footer");
      const flut = document.querySelector(".floating-social");
      return {
        rodape: !!foot && foot.getBoundingClientRect().height > 0,
        flutuante: !!flut && flut.getBoundingClientRect().height > 0,
      };
    });
    check(
      "N10 sem rodapé e sem flutuante no painel (/crm)",
      !visivel.rodape && !visivel.flutuante,
      JSON.stringify(visivel)
    );

    // sub-itens do Cadastros no menu lateral
    check(
      "N11 sub-itens Cadastros no menu (cliente, produto, empresa, fornecedor, revenda)",
      (await page.getByRole("link", { name: "Cadastro Cliente" }).isVisible()) &&
        (await page.getByRole("link", { name: "Cadastro Produto" }).isVisible()) &&
        (await page.getByRole("link", { name: "Dados Cadastrais Empresa" }).isVisible()) &&
        (await page.getByRole("link", { name: "Fornecedor", exact: true }).isVisible()) &&
        (await page.getByRole("link", { name: "Revenda", exact: true }).isVisible())
    );
    await page.getByRole("link", { name: "Cadastro Produto" }).click();
    await page.waitForURL(/\/configuracoes\/cadastro\?tela=produto/, { timeout: 15000 });
    check(
      "N12 sub-item abre a tela certa (produto)",
      await page.getByRole("heading", { name: "Cadastros" }).isVisible()
    );
    await page.goto(BASE + "/configuracoes/cadastro?tela=fornecedor", { waitUntil: "domcontentloaded" });
    check(
      "N13 tela Fornecedor com lista e formulário",
      (await page.getByRole("heading", { name: "Fornecedores", exact: true }).isVisible()) &&
        (await page.getByRole("heading", { name: "Novo fornecedor", exact: true }).isVisible())
    );
    await page.goto(BASE + "/configuracoes/cadastro?tela=revenda", { waitUntil: "domcontentloaded" });
    check(
      "N14 tela Revenda de pé",
      await page.getByRole("heading", { name: "Cadastro de revendas" }).isVisible()
    );

    // ------------------------------------------------ V) módulo /vendas ----
    const respV = await page.goto(BASE + "/vendas", { waitUntil: "domcontentloaded" });
    check("V1 master abre /vendas (200)", !!respV && respV.status() === 200, `status=${respV && respV.status()}`);
    await page.getByRole("heading", { name: "Vendas Detalhada" }).waitFor({ timeout: 15000 });
    check("V2 título Vendas Detalhada na página", true);
    for (const aba of ["Vendas", "Compras", "Notas emitidas"]) {
      check(`V3 aba "${aba}" visível`, await page.locator(`button[aria-label="Aba ${aba}"]`).isVisible());
    }
    check("V4 botão Voltar em /vendas", await page.getByRole("button", { name: "Voltar" }).isVisible());

    // vendedor: 403 no middleware (RBAC /vendas = gestão)
    const criado = await admin.auth.admin.createUser({
      email: EMAIL_VENDEDOR,
      password: SENHA,
      email_confirm: true,
    });
    vendedorId = criado.data?.user?.id ?? null;
    if (!vendedorId && criado.error && /already/i.test(criado.error.message ?? "")) {
      const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 });
      vendedorId =
        (lista?.users || []).find((u) => (u.email || "").toLowerCase() === EMAIL_VENDEDOR)?.id ?? null;
    }
    if (vendedorId) {
      await admin.from("profiles").upsert(
        {
          id: vendedorId,
          tenant_id: TENANT,
          email: EMAIL_VENDEDOR,
          full_name: "Vendedor E2E Vendas",
          role: "vendedor",
          status: "ativo",
        },
        { onConflict: "id" }
      );
      const pageV = await browser.newPage();
      await login(pageV, EMAIL_VENDEDOR, SENHA);
      const respVend = await pageV.goto(BASE + "/vendas", { waitUntil: "domcontentloaded" });
      check(
        "V5 vendedor leva 403 em /vendas",
        !!respVend && respVend.status() === 403,
        `status=${respVend && respVend.status()}`
      );
      await pageV.close();
    } else {
      check("V5 vendedor leva 403 em /vendas", false, "createUser falhou");
    }

    // pedido de venda de teste (banco direto, como os demais E2E)
    const { data: cust, error: eCust } = await admin
      .from("customers")
      .insert({
        tenant_id: TENANT,
        name: `Cliente Vendas E2E ${EPOCH}`,
        email: `e2e-vendas-${EPOCH}@exemplo.com`,
      })
      .select("id")
      .single();
    customerId = cust?.id ?? null;
    check("V6 pedido de teste: cliente criado", !!customerId, eCust ? eCust.message : "");

    const { data: ped, error: ePed } = await admin
      .from("orders")
      .insert({ tenant_id: TENANT, customer_id: customerId, status: "processando", total_amount: 45.9 })
      .select("id")
      .single();
    pedidoId = ped?.id ?? null;
    check("V7 pedido de teste criado", !!pedidoId, ePed ? ePed.message : "");

    const { data: it, error: eIt } = await admin
      .from("order_items")
      .insert({
        tenant_id: TENANT,
        order_id: pedidoId,
        sku: "SKU-E2E-NFE",
        name: "Caderno E2E NF-e",
        unit_price: 22.95,
        quantity: 2,
        total: 45.9,
      })
      .select("id")
      .single();
    itemId = it?.id ?? null;
    check("V8 item do pedido criado", !!itemId, eIt ? eIt.message : "");

    const codigo = `PED-${String(pedidoId).slice(0, 8).toUpperCase()}`;
    await page.goto(BASE + "/vendas", { waitUntil: "domcontentloaded" });
    await page.getByText(codigo).first().waitFor({ timeout: 15000 });
    check("V9 pedido aparece na aba Vendas", true, codigo);

    // emissão ------------------------------------------------------------
    await page.getByRole("button", { name: `Emitir NF-e ${codigo}` }).click();
    await page.getByRole("dialog", { name: "Emissão de nota fiscal" }).waitFor({ timeout: 10000 });
    check("V10 modal de emissão abriu", true);
    const nomeDest = await page
      .getByLabel("Destinatário (nome / razão social)")
      .inputValue()
      .catch(() => "");
    check("V11 destinatário pré-preenchido com o cliente", nomeDest.includes("Cliente Vendas E2E"), nomeDest);
    await page.getByLabel("CNPJ / CPF").fill("12.345.678/0001-90");
    await page.getByRole("button", { name: "Confirmar emissão" }).click();

    let aviso = "";
    try {
      await page.getByText(/emitida com sucesso/).waitFor({ timeout: 25000 });
      aviso = (await page.getByRole("status").textContent()) || "";
    } catch {
      aviso = (await page.getByRole("status").textContent().catch(() => "")) || "";
    }
    const numero = Number((aviso.match(/NF-e (\d+) série/) || [])[1] || 0);
    check("V12 emissão confirmada com número", numero > 0, aviso || "sem aviso");

    // documento ------------------------------------------------------------
    if (numero > 0) {
      await page.getByRole("button", { name: `Ver documento NF-e ${numero}` }).click();
      await page.getByRole("dialog", { name: `Documento da NF-e ${numero}` }).waitFor({ timeout: 10000 });
      const docTxt = (await page.getByRole("dialog", { name: `Documento da NF-e ${numero}` }).textContent()) || "";
      check(
        "V13 documento mostra emitente e destinatário",
        docTxt.includes("49.163.008/0001-68") && docTxt.includes("Cliente Vendas E2E"),
        ""
      );
      await page.getByRole("button", { name: "Fechar documento" }).click();

      // cancelamento -------------------------------------------------------
      await page.getByRole("button", { name: `Cancelar NF-e ${numero}` }).click();
      try {
        await page.getByText(/NF-e \d+ cancelada\./).waitFor({ timeout: 15000 });
        check("V14 nota cancelada pela UI", true);
      } catch {
        check("V14 nota cancelada pela UI", false, "sem aviso de cancelamento");
      }
    } else {
      check("V13 documento mostra emitente e destinatário", false, "emissão falhou");
      check("V14 nota cancelada pela UI", false, "emissão falhou");
    }

    const { data: notasDoPedido } = await admin
      .from("nfe_emissoes")
      .select("id")
      .eq("order_id", pedidoId ?? "00000000-0000-0000-0000-000000000000");
    notaIds = (notasDoPedido || []).map((n) => n.id);
    check("V15 nota persistida no banco", notaIds.length >= 1, `n=${notaIds.length}`);
  } finally {
    // limpeza ---------------------------------------------------------------
    try {
      for (const id of notaIds) await admin.from("nfe_emissoes").delete().eq("id", id);
      if (itemId) await admin.from("order_items").delete().eq("id", itemId);
      if (pedidoId) await admin.from("orders").delete().eq("id", pedidoId);
      if (customerId) await admin.from("customers").delete().eq("id", customerId);
      if (vendedorId) {
        await admin.from("profiles").delete().eq("id", vendedorId);
        await admin.auth.admin.deleteUser(vendedorId);
      }
    } catch (e) {
      console.log("cleanup:", e && e.message);
    }
    await browser.close();
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${resultados.length} | PASS ${resultados.length - falhas} | FAIL ${falhas}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
