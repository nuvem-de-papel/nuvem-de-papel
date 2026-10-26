const fs = require("fs");
const path = require("path");

function lerEnv() {
  const texto = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const linha of texto.split(/\r?\n/)) {
    const indice = linha.indexOf("=");
    if (indice > 0 && !linha.startsWith("#")) env[linha.slice(0, indice)] = linha.slice(indice + 1);
  }
  return env;
}

const env = lerEnv();
const email = env.E2E_MASTER_EMAIL;
const password = env.E2E_MASTER_PASSWORD;

if (!email || !password) {
  throw new Error("Defina E2E_MASTER_EMAIL e E2E_MASTER_PASSWORD em .env.local antes de rodar os E2E.");
}

module.exports = { email, password };
