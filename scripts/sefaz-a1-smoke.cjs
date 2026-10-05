/* Smoke do certificado A1 (Bloco 3) - roda FORA do E2E e fora da CI.
 *
 * Replica exatamente carregarCertificado() + soap() de src/lib/sefaz.ts e
 * bate no status de servico da SEFAZ-SP homologacao com mTLS. Serve para
 * provar que o .pfx da emitente carrega e autentica antes de ligar a
 * emissao de verdade. O E2E continua com SEFAZ_MOCK=1 (suíte determinística).
 *
 * Uso:  node scripts/sefaz-a1-smoke.cjs
 * O arquivo .pfx NUNCA entra no git: ele vem de SEFAZ_A1_PFX (base64) no
 * .env.local / env vars da Vercel, e a senha de SEFAZ_A1_SENHA.
 */
const fs = require("fs");
const https = require("https");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const ENV = path.join(RAIZ, ".env.local");
const SEFAZ = path.join(RAIZ, "src", "lib", "sefaz.ts");

const env = {};
if (fs.existsSync(ENV)) {
  for (const linha of fs.readFileSync(ENV, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
}
for (const k of ["SEFAZ_A1_PFX", "SEFAZ_A1_SENHA"]) {
  if (process.env[k]) env[k] = process.env[k];
}

if (!env.SEFAZ_A1_PFX || !env.SEFAZ_A1_SENHA) {
  console.log("AUSENTE: defina SEFAZ_A1_PFX (base64 do .pfx) e SEFAZ_A1_SENHA.");
  process.exit(1);
}

const forge = require(path.join(RAIZ, "node_modules", "node-forge"));
const CA_PEM = fs
  .readFileSync(SEFAZ, "utf8")
  .match(/const CA_PEM = `([\s\S]*?)`;/)[1]
  .trim();

console.log("SEFAZ_MOCK      = " + (env.SEFAZ_MOCK ?? "(nao definido)"));
console.log("SEFAZ_A1_PFX    = " + env.SEFAZ_A1_PFX.length + " chars");
console.log("SEFAZ_A1_SENHA  = " + "preenchida (" + env.SEFAZ_A1_SENHA.length + " chars)");
console.log("--- carregarCertificado() ---");

let tls;
try {
  const der = Buffer.from(env.SEFAZ_A1_PFX, "base64");
  if (der.length < 100) throw new Error("base64 curto");
  console.log("der bytes       = " + der.length);
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString("latin1")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, env.SEFAZ_A1_SENHA);
  const bags = p12.getBags({ bagType: "1.2.840.113549.1.12.10.1.2" });
  const keyBags = bags["1.2.840.113549.1.12.10.1.2"] ?? bags["1.2.840.113549.1.12.10.1.1"];
  const key = keyBags?.[0]?.key;
  if (!key) throw new Error("Chave privada nao encontrada no SEFAZ_A1_PFX.");
  const certBags = p12.getBags({ bagType: "1.2.840.113549.1.12.10.1.3" })["1.2.840.113549.1.12.10.1.3"];
  const leaf = certBags?.[0]?.cert;
  if (!leaf) throw new Error("Certificado nao encontrado no SEFAZ_A1_PFX.");
  tls = {
    chavePem: forge.pki.privateKeyToPem(key),
    certPem: forge.pki.certificateToPem(leaf),
  };
  console.log("chave privada   = OK (forge privateKeyToPem)");
  console.log(
    "leaf            = " + leaf.subject.attributes.map((a) => a.shortName + "=" + a.value).join(", ")
  );
} catch (e) {
  console.log("FALHA em carregarCertificado(): " + e.message);
  process.exit(1);
}

const dados = `<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><cUF>35</cUF><xServ>STATUS</xServ></consStatServ>`;
const action = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServico";
const body =
  `<?xml version="1.0" encoding="utf-8"?>` +
  `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
  `xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
  `<soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">${dados}</nfeDadosMsg>` +
  `</soap12:Body></soap12:Envelope>`;

console.log("--- soap() ---");
const req = https.request(
  {
    hostname: "homologacao.nfe.fazenda.sp.gov.br",
    path: "/ws/nfestatusservico4.asmx",
    method: "POST",
    key: tls.chavePem,
    cert: tls.certPem,
    ca: CA_PEM,
    rejectUnauthorized: true,
    timeout: 45000,
    headers: {
      "Content-Type": `application/soap+xml;charset=UTF-8;action="${action}"`,
      SOAPAction: `"${action}"`,
      "Content-Length": Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      console.log("HTTP            = " + res.statusCode);
      for (const t of ["cStat", "xMotivo", "verAplic", "tpAmb", "dhRecbto"]) {
        const mm = data.match(new RegExp(`<${t}>([^<]*)</${t}>`));
        if (mm) console.log(t.padEnd(15) + " = " + mm[1]);
      }
      const ok = res.statusCode === 200 && /<cStat>107<\/cStat>/.test(data);
      console.log(
        ok
          ? "RESULTADO       : PROVA - a mesma funcao do app autenticou na SEFAZ"
          : "RESULTADO       : ver resposta acima"
      );
      process.exit(ok ? 0 : 1);
    });
  }
);
req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
req.on("error", (e) => {
  console.log("FALHA soap(): " + e.message + (e.code ? " [" + e.code + "]" : ""));
  process.exit(1);
});
req.write(body);
req.end();
