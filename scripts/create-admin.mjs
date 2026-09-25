import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";

// Uso: node scripts/create-admin.mjs [caminho/.env.local]
// Cria o usuario master admin@nuvemdepapel.com.br no Supabase Auth + linha em
// profiles (role master). SENHA EXIBIDA UMA VEZ - anote e guarde fora do repo.
// Rodar APOS aplicar a migration 0004 no banco alvo (staging primeiro!).

const envPath = process.argv[2] ?? ".env.local";
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (line && !line.startsWith("#") && line.includes("=")) {
    const i = line.indexOf("=");
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em " + envPath);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const EMAIL = "admin@nuvemdepapel.com.br";
const TENANT = "00000000-0000-0000-0000-000000000001"; // Nuvem de Papel (tenant.ts)
const PASSWORD =
  process.env.ADMIN_PASSWORD ?? crypto.randomBytes(18).toString("base64url") + "!7";

const { data, error } = await supabase.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});

let userId = data?.user?.id;

if (error) {
  if (error.message.includes("already")) {
    const { data: list, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error("Erro ao listar usuarios:", listError.message);
      process.exit(1);
    }
    userId = list.users.find((u) => u.email === EMAIL)?.id;
    if (!userId) {
      console.error("Usuario ja existe mas nao foi encontrado:", error.message);
      process.exit(1);
    }
    console.log("Usuario ja existia - mantendo a senha atual.\n");
  } else {
    console.error("Erro ao criar usuario:", error.message);
    process.exit(1);
  }
}

const { error: profileError } = await supabase
  .from("profiles")
  .upsert({ id: userId, tenant_id: TENANT, email: EMAIL, role: "master" }, { onConflict: "id" });

if (profileError) {
  console.error("Erro ao gravar profiles:", profileError.message);
  process.exit(1);
}

console.log("MASTER ADMIN PRONTO");
console.log("  e-mail: " + EMAIL);
console.log("  senha:  " + (process.env.ADMIN_PASSWORD ? "(a que voce passou em ADMIN_PASSWORD)" : PASSWORD));
console.log("\nAnote a senha agora - ela nao sera exibida de novo.");
