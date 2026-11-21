/* E2E Acessibilidade (20/11/2026): painel proprio + VLibras.
 * Padrao comum: I:\Projetos\_libras\PADRAO-ACESSIBILIDADE-VLIBRAS.md
 * (A) botao e painel abrem/fecham pelo teclado
 * (B) cada opcao liga a classe no <html> e muda a tela
 * (C) preferencia sobrevive ao reload ANTES da hidratacao (script do <head>)
 * (D) restaurar padrao limpa tudo
 * (E) VLibras carrega e fica no lado ESQUERDO (o direito e do atendimento)
 * (F) celular 390px sem rolagem lateral · (G) painel administrativo sem os botoes
 * So leitura: nao grava nada no banco. (E) depende de internet (vlibras.gov.br).
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { email: EMAIL_MASTER, password: SENHA_MASTER } = require("./_credenciais-e2e.cjs");

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
  throw new Error("acessibilidade.cjs so roda contra o Supabase de staging");
}
const BASE = process.argv[2] || "http://localhost:3000";
const resultados = [];
function check(nome, ok, extra) {
  resultados.push({ nome, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${nome}${extra !== undefined ? ` (${extra})` : ""}`);
}

const classes = (page) => page.evaluate(() => [...document.documentElement.classList]);

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });

    // (A) botao e painel
    const botao = page.locator('button[aria-label="Acessibilidade"]');
    await botao.waitFor({ state: "visible", timeout: 20000 });
    check("A1 botao Acessibilidade visivel na home", await botao.isVisible());
    const caixa = await botao.boundingBox();
    check("A2 botao no canto inferior esquerdo", caixa && caixa.x < 100 && caixa.y > 800 - 120, caixa && `${Math.round(caixa.x)},${Math.round(caixa.y)}`);
    check("A3 painel nasce fechado", (await botao.getAttribute("aria-expanded")) === "false");
    await botao.focus();
    await page.keyboard.press("Enter");
    const painel = page.locator('section[aria-label="Opções de acessibilidade"]');
    await painel.waitFor({ state: "visible", timeout: 5000 });
    check("A4 Enter abre o painel", (await botao.getAttribute("aria-expanded")) === "true");
    await page.keyboard.press("Escape");
    await painel.waitFor({ state: "detached", timeout: 5000 });
    const focoNoBotao = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Acessibilidade");
    check("A5 Esc fecha e devolve o foco ao botao", focoNoBotao);
    await botao.click();
    await painel.waitFor({ state: "visible", timeout: 5000 });

    // (B) opcoes
    const fonteAntes = await page.evaluate(() => document.querySelector("h1, h2")?.getBoundingClientRect().height ?? 0);
    await page.click('button[aria-label="Aumentar texto"]');
    await page.click('button[aria-label="Aumentar texto"]');
    await page.waitForFunction(() => document.documentElement.classList.contains("a11y-zoom"));
    const zoomTxt = await page.locator(".a11y-linha output").first().innerText();
    const zoomVar = await page.evaluate(() => document.documentElement.style.getPropertyValue("--a11y-zoom"));
    check("B1 aumentar texto 2x = 120%", zoomTxt.trim() === "120%" && zoomVar === "1.2", `${zoomTxt} / ${zoomVar}`);
    const fonteDepois = await page.evaluate(() => document.querySelector("h1, h2")?.getBoundingClientRect().height ?? 0);
    check("B2 texto da pagina cresceu de verdade", fonteDepois > fonteAntes, `${fonteAntes.toFixed(1)} -> ${fonteDepois.toFixed(1)}`);
    const painelBox = await painel.boundingBox();
    check("B3 painel continua dentro da tela com zoom", painelBox && painelBox.x >= 0 && painelBox.y >= 0);

    const alternar = (rotulo) => page.click(`button.a11y-alternar:has-text("${rotulo}")`);
    await alternar("Alto contraste");
    await page.waitForFunction(() => document.documentElement.classList.contains("a11y-contraste"));
    const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const pressed = await page.locator('button.a11y-alternar:has-text("Alto contraste")').getAttribute("aria-pressed");
    check("B4 alto contraste: fundo preto e aria-pressed", fundo === "rgb(0, 0, 0)" && pressed === "true", fundo);

    await alternar("Destacar links");
    await page.waitForFunction(() => document.documentElement.classList.contains("a11y-links"));
    const sublinhado = await page.evaluate(() => getComputedStyle(document.querySelector("main a, a") || document.body).textDecorationLine);
    check("B5 destacar links sublinha", sublinhado.includes("underline"), sublinhado);

    await alternar("Espaçamento entre linhas");
    await page.waitForFunction(() => document.documentElement.classList.contains("a11y-espaco-linhas"));
    const entrelinha = await page.evaluate(() => {
      const p = document.querySelector("main p") || document.querySelector("p");
      const cs = getComputedStyle(p);
      return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
    });
    check("B6 espacamento entre linhas 1.8", Math.abs(entrelinha - 1.8) < 0.05, entrelinha.toFixed(2));

    await alternar("Guia de leitura");
    await page.mouse.move(600, 400);
    const guia = page.locator(".a11y-guia-barra");
    await guia.waitFor({ state: "attached", timeout: 5000 });
    await page.mouse.move(600, 300);
    await page.waitForTimeout(150);
    const guiaY = await guia.boundingBox();
    check("B7 guia de leitura acompanha o ponteiro", guiaY && Math.abs(guiaY.y + 14 - 300) < 6, guiaY && Math.round(guiaY.y));

    await alternar("Pausar animações");
    await page.waitForFunction(() => document.documentElement.classList.contains("a11y-sem-animacao"));
    await page.waitForTimeout(400);
    const videos = await page.evaluate(() => [...document.querySelectorAll("video")].map((v) => v.paused));
    check("B8 pausar animacoes para o video do hero", videos.every(Boolean), `${videos.length} video(s)`);
    const animacao = await page.evaluate(() => {
      const s = document.querySelector(".fundo-rotativo-camadas span");
      return s ? getComputedStyle(s).animationPlayState : "paused";
    });
    check("B9 pausar animacoes para o fundo rotativo", animacao.split(",").every((x) => x.trim() === "paused"), animacao);

    const salvo = await page.evaluate(() => localStorage.getItem("np-a11y"));
    check("B10 preferencia salva no navegador", !!salvo && JSON.parse(salvo).contraste === true);

    // (C) reload: classes chegam pelo script do <head>, antes do React
    await page.goto(BASE + "/produtos", { waitUntil: "commit" });
    await page.waitForSelector("body", { state: "attached" });
    const cedo = await page.evaluate(() => [...document.documentElement.classList]);
    check(
      "C1 classes aplicadas antes da hidratacao",
      ["a11y-zoom", "a11y-contraste", "a11y-links", "a11y-espaco-linhas", "a11y-guia", "a11y-sem-animacao"].every((c) => cedo.includes(c)),
      cedo.join(" ")
    );
    await page.waitForLoadState("load");
    const erroHidratacao = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /hydrat/i.test(m.text())) erroHidratacao.push(m.text());
    });
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(800);
    check("C2 sem erro de hidratacao com as classes", erroHidratacao.length === 0, erroHidratacao[0]);

    // (D) restaurar
    await page.click('button[aria-label="Acessibilidade"]');
    await page.click('button:has-text("Restaurar padrão")');
    await page.waitForFunction(() => !document.documentElement.className.includes("a11y-"));
    const depois = await classes(page);
    const chave = await page.evaluate(() => localStorage.getItem("np-a11y"));
    check("D1 restaurar padrao limpa classes e storage", !depois.some((c) => c.startsWith("a11y-")) && chave === null, depois.join(" "));
    check("D2 restaurar fica desabilitado no padrao", await page.locator('button:has-text("Restaurar padrão")').isDisabled());

    // (E) VLibras
    await page.goto(BASE + "/", { waitUntil: "load" });
    let vlibras = null;
    try {
      await page.waitForFunction(() => !!document.getElementById("vlibras-access-wrapper"), null, { timeout: 20000 });
      vlibras = await page.evaluate(() => {
        const w = document.getElementById("vlibras-access-wrapper");
        const b = w.shadowRoot?.getElementById("vlibras-button") || null;
        const r = (b || w).getBoundingClientRect();
        return { temVLibras: typeof window.VLibras === "object", x: r.x, w: r.width, visivel: r.width > 0 };
      });
    } catch {
      vlibras = null;
    }
    check("E1 VLibras carregou (script do gov.br)", vlibras && vlibras.temVLibras, vlibras ? "ok" : "sem rede ou bloqueado");
    check("E2 botao do VLibras no lado esquerdo", vlibras && vlibras.visivel && vlibras.x < 120, vlibras && Math.round(vlibras.x));
    // VLibras usa z-index maximo: o painel aberto nao pode ficar embaixo dele
    await page.click('button[aria-label="Acessibilidade"]');
    await painel.waitFor({ state: "visible", timeout: 5000 });
    const pAberto = await painel.boundingBox();
    check(
      "E3 painel aberto nao fica embaixo do botao do VLibras",
      vlibras && pAberto && pAberto.x >= vlibras.x + vlibras.w,
      pAberto && vlibras && `${Math.round(vlibras.x + vlibras.w)} <= ${Math.round(pAberto.x)}`
    );
    await page.keyboard.press("Escape");

    // (F) celular
    const cel = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    const pc = await cel.newPage();
    await pc.goto(BASE + "/", { waitUntil: "load" });
    await pc.locator('button[aria-label="Acessibilidade"]').click();
    await pc.locator('section[aria-label="Opções de acessibilidade"]').waitFor({ state: "visible" });
    const larg = await pc.evaluate(() => document.documentElement.scrollWidth);
    const pBox = await pc.locator('section[aria-label="Opções de acessibilidade"]').boundingBox();
    check("F1 celular 390px: painel cabe e sem rolagem lateral", larg <= 390 && pBox && pBox.x >= 0 && pBox.x + pBox.width <= 390, `${larg}px`);
    await cel.close();

    // (G) painel administrativo sem os botoes
    await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
    await page.fill("#email", EMAIL_MASTER);
    await page.fill("#senha", SENHA_MASTER);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    await page.goto(BASE + "/crm", { waitUntil: "load" });
    await page.waitForSelector(".admin-shell", { timeout: 20000 });
    await page.waitForTimeout(1500);
    const admin = await page.evaluate(() => {
      const vis = (el) => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
      return { botao: vis(document.querySelector(".a11y-botao")), vlibras: vis(document.getElementById("vlibras-access-wrapper")) };
    });
    check("G1 painel administrativo sem botao de acessibilidade", !admin.botao);
    check("G2 painel administrativo sem VLibras", !admin.vlibras);
  } catch (e) {
    check("EXCECAO", false, e.message);
  } finally {
    await browser.close();
  }
  const pass = resultados.filter((r) => r.ok).length;
  console.log(`TOTAL ${resultados.length} | PASS ${pass} | FAIL ${resultados.length - pass}`);
  process.exit(pass === resultados.length ? 0 : 1);
})();
