/* E2E Carta com IA (entrega 6 - 0039): carta de insights gerada pelo Gemini.
 * Requisitos: npm run build && npm run start (:3000) + .env.local com GEMINI_API_KEY.
 * Rode: node e2e/carta-ia.cjs
 *
 * Cobre o ciclo (regra de ouro: a IA só escreve, os números vem do código):
 *  1. Abre /crm/carta (guard gestão - master loga).
 *  2. Clica "Gerar carta da semana" -> server action calcula indicadores + chama Gemini.
 *  3. Espera a carta aparecer na tela com resumo preenchido.
 *  4. Confere no banco que insight_cartas gravou (indicadores + texto + status).
 *  5. REGRA DE OURO: o texto da carta NÃO pode conter etiqueta sobra ({...})
 *     e, se tiver número, tem de ser R$ formatado (não número solto da IA).
 *  6. Limpa as cartas de teste (nao deixa lixo).
 * Se a IA falhar (sem chave), o status vem "incompleta" - o teste reporta. */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL_MASTER = "admin@nuvemdepapel.com.br";
const SENHA_MASTER = "@@748596Jmsc##";
const TENANT = "00000000-0000-0000-0000-000000000001";

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

// junta todo o texto das cartas exibidas pra validar a regra de ouro
function textoDasCartas(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    return main ? main.innerText : "";
  });
}

async function main() {
  // começa do zero: apaga cartas de rodadas anteriores
  await admin.from("insight_cartas").delete().eq("tenant_id", TENANT);

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    page.on("dialog", (d) => d.accept());

    await login(page, EMAIL_MASTER, SENHA_MASTER);
    await page.goto(BASE + "/crm/carta", { waitUntil: "domcontentloaded" });
    check("K1 abre /crm/carta", (await page.getByRole("heading", { name: /Carta com IA/ }).count()) === 1);

    const antes = await admin.from("insight_cartas").select("id").eq("tenant_id", TENANT);
    check("K2 começa sem cartas", (antes.data ?? []).length === 0);

    // espera o React hidratar (clique cedo = handler ausente, nada acontece)
    await page.waitForLoadState("networkidle");
    await page.locator(".carta-feed").count(); // garante que a página estabilizou

    // gerar carta com retry robusto:
    //  - seletor ESTÁVEL por data-testid (não muda com "Gerando...");
    //  - msg "Gerando..." é urgente no app (aparece na hora = sinal de handler);
    //  - desfecho = botão liberado + texto terminal no feed;
    //  - se falhar por transitório da IA, repete (fora).
    const btnGerar = page.locator('[data-testid="btn-gerar-semanal"]');
    const lerFeed = async () =>
      ((await page.locator(".carta-feed").textContent().catch(() => "")) || "").trim();

    async function gerarSemana() {
      let clickErr = "";
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        const prev = await lerFeed();
        try {
          await btnGerar.waitFor({ state: "visible", timeout: 8000 });
          await btnGerar.click({ timeout: 10000 });
        } catch (e) {
          clickErr = String(e).split("\n")[0].slice(0, 120);
          await page.waitForTimeout(1500);
          continue;
        }
        // ciclo aceito quando: pend (botão disabled) OU feed mudou de texto
        let aceito = false;
        const fim = Date.now() + 20000;
        while (Date.now() < fim && !aceito) {
          const disabled = await btnGerar.isDisabled().catch(() => false);
          if (disabled || (await lerFeed()) !== prev) aceito = true;
          else await page.waitForTimeout(250);
        }
        if (!aceito) {
          clickErr = "clique nao disparou (sem hydration?)";
          continue;
        }
        // desfecho: botão liberado (ciclo terminou) + texto terminal no feed
        const fim2 = Date.now() + 180000;
        while (Date.now() < fim2) {
          const disabled = await btnGerar.isDisabled().catch(() => false);
          const txt = await lerFeed();
          if (!disabled && /gerada|falhou|falha|ia_falhou|erro/i.test(txt)) {
            const ok = /gerada/i.test(txt) && !/falhou|falha|ia_falhou/i.test(txt);
            return { gerou: ok, feed: txt };
          }
          await page.waitForTimeout(400);
        }
        return { gerou: false, feed: "(desfecho nao chegou em 180s) " + (await lerFeed()).slice(0, 100) };
      }
      const diag = await page
        .evaluate(() => ({
          url: location.href,
          botoes: [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim().slice(0, 40)),
          feed: document.querySelector(".carta-feed")?.textContent || null,
        }))
        .catch(() => null);
      console.log("DIAG handler:", clickErr, JSON.stringify(diag));
      return { gerou: false, feed: "(handler nunca rodou) " + clickErr };
    }

    let res = await gerarSemana();
    for (let t = 0; t < 2 && !res.gerou && /ia_falhou|high demand|timeout|aborted|falhou|handler/i.test(res.feed); t++) {
      await page.waitForTimeout(4000);
      res = await gerarSemana();
    }
    const gerou = res.gerou;
    const feedFinal = res.feed;
    check("K3 geração devolveu sucesso (feedback 'gerada')", gerou, "feedback: " + feedFinal.slice(0, 100));

    if (gerou) {
      // confere no banco
      const { data } = await admin
        .from("insight_cartas")
        .select("id, tipo, indicadores, texto, status")
        .eq("tenant_id", TENANT)
        .order("created_at", { ascending: false })
        .limit(1);
      const carta = (data ?? [])[0];
      check("K4 gravou em insight_cartas", Boolean(carta), carta ? carta.status : "sem linha");
      check("K5 guardou os indicadores (foto dos números)", Boolean(carta && Object.keys(carta.indicadores || {}).length > 0));
      check("K6 status e completa ou incompleta", carta && ["completa", "incompleta"].includes(carta.status), carta?.status);

      // REGRA DE OURO: confere o TEXTO DA IA (seções do banco), não a página
      // inteira (que tem datas do período renderizadas pelo sistema).
      const secoes = carta?.texto
        ? [carta.texto.resumo, ...(carta.texto.melhorou || []), ...(carta.texto.piorou || []), ...(carta.texto.atencao || []), ...(carta.texto.acoes || []).map((a) => `${a.texto} ${a.prazo}`)].join(" ")
        : "";
      const sobraEtiquetaDb = /\{[a-z_]+\}/i.test(secoes);
      check("K7 nenhuma etiqueta {chave} sobrou na carta (substituída)", !sobraEtiquetaDb);
      // REGRA DE OURO no texto FINAL: cada dinheiro (R$ X,YY) exibido tem de ser
      // um dos números que o SISTEMA calculou (indicadores). Se algum R$ não bater
      // com nenhum indicador, a IA inventou -> falha. (A validação de produção já
      // roda antes da substituição; aqui é a confirmação independente no resultado.)
      const parseBRL = (s) => {
        const m = s.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/); // pt-BR: 1.234,56
        return m ? Number(m[0].replace(/\./g, "").replace(",", ".")) : NaN;
      };
      const dinheiroNaCarta = (secoes.match(/R\$\s?[0-9][0-9.,]*/g) || [])
        .map(parseBRL)
        .filter((v) => !Number.isNaN(v));
      const valsIndicador = Object.values(carta?.indicadores || {}).map((v) => Number(v));
      const inventado = dinheiroNaCarta.filter(
        (v) => !valsIndicador.some((i) => Math.abs(i - v) < 0.01)
      );
      const temNaN = /\bNaN\b/.test(secoes); // indicador quebrado vazando pro texto
      check(
        "K8 todo dinheiro da carta vem dos indicadores do sistema (nada inventado)",
        inventado.length === 0 && !temNaN,
        temNaN ? "texto contém NaN" : inventado.length ? "fora do sistema: " + inventado.join(", ") : `${dinheiroNaCarta.length} valores conferem`
      );
      check("K9 a carta tem um resumo não vazio", (carta?.texto?.resumo || "").length > 5, (carta?.texto?.resumo || "").slice(0, 60));
    }
  } finally {
    await browser.close();
    await admin.from("insight_cartas").delete().eq("tenant_id", TENANT); // limpa
  }

  const total = resultados.length;
  const pass = resultados.filter((r) => r.ok).length;
  console.log(`resumo: ${pass}/${total} checks`);
  process.exit(pass === total ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
