/* Smoke visual do /crm (entrega 8): loga, tira print da home do painel em
   1440x900 e no modo estreito (900px) para conferir o colapso da grade. */
const { chromium } = require("playwright-core");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = "http://localhost:3000";
const EMAIL = "admin@nuvemdepapel.com.br";
const SENHA = "@@748596Jmsc##";
const SAIDA = (nome) => path.join(os.tmpdir(), `painel-crm-${nome}.png`);

function lerEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", EMAIL);
  await page.fill("#senha", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await page.goto(BASE + "/crm", { waitUntil: "domcontentloaded" });
  await page.locator("section[aria-label='Indicadores do negócio']").waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: SAIDA("wide"), fullPage: true });

  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: SAIDA("estreito"), fullPage: true });

  console.log("prints gravados");
  await browser.close();
}

main().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
