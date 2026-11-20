"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { cnpjValido } from "@/lib/documento";

// Conta corporativa (0059 - 20/11/2026). A empresa nasce 'pendente' e so
// compra depois que a gestao aprova em Cadastros > Revenda. O login que
// solicita vira o 'admin' da empresa (corporate_buyers). Escrita so pela
// service_role, sempre com audit_log.

export type ResultadoCorporativo = { ok: true; destino: string } | { ok: false; erro: string; jaCadastrado?: true };

type Entrada = {
  razaoSocial: string;
  cnpj: string;
  contato: string;
  email: string;
  telefone: string;
  senha: string;
};

const soDigitos = (v: string) => (v ?? "").replace(/\D/g, "");

function validar(e: Entrada, logado: boolean): string | null {
  const razao = (e.razaoSocial ?? "").trim();
  if (razao.length < 3 || razao.length > 160) return "Razão social deve ter de 3 a 160 caracteres.";
  if (!cnpjValido(e.cnpj)) return "CNPJ inválido (confira os dígitos).";
  const tel = soDigitos(e.telefone);
  if (tel.length < 10 || tel.length > 11) return "Telefone inválido (DDD + número).";
  if (logado) return null;
  if ((e.contato ?? "").trim().length < 3) return "Informe o nome de quem vai comprar (mínimo 3 letras).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e.email ?? "").trim())) return "E-mail inválido.";
  if (!e.senha || e.senha.length < 6) return "A senha deve ter pelo menos 6 caracteres.";
  return null;
}

async function cnpjJaUsado(admin: ReturnType<typeof createAdminClient>, cnpj: string): Promise<boolean> {
  const { data } = await admin
    .from("corporate_accounts")
    .select("id")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("cnpj", cnpj)
    .maybeSingle();
  return !!data;
}

async function criarEmpresa(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  customerId: string,
  razao: string,
  cnpj: string
): Promise<{ ok: true; accountId: string } | { ok: false; erro: string }> {
  const { data: conta, error } = await admin
    .from("corporate_accounts")
    .insert({ tenant_id: NUVEM_DE_PAPEL_TENANT_ID, customer_id: customerId, razao_social: razao, cnpj })
    .select("id")
    .single();
  if (error || !conta) {
    if (error?.code === "23505") return { ok: false, erro: "Este CNPJ já tem conta corporativa. Peça acesso ao administrador da empresa." };
    console.error("corporate_accounts insert:", error);
    return { ok: false, erro: "Não foi possível registrar a empresa agora. Tente novamente." };
  }
  const { error: errBuyer } = await admin
    .from("corporate_buyers")
    .insert({ tenant_id: NUVEM_DE_PAPEL_TENANT_ID, account_id: conta.id, auth_user_id: userId, papel: "admin" });
  if (errBuyer) {
    await admin.from("corporate_accounts").delete().eq("id", conta.id);
    console.error("corporate_buyers insert:", errBuyer);
    return { ok: false, erro: "Não foi possível vincular seu login à empresa. Tente novamente." };
  }
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "corporativo.solicitado",
    entity: "corporate_accounts",
    entity_id: conta.id,
    after: { razao_social: razao, cnpj, customer_id: customerId, status: "pendente" },
  });
  return { ok: true, accountId: conta.id };
}

export async function solicitarContaCorporativa(entrada: Entrada): Promise<ResultadoCorporativo> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const erro = validar(entrada, !!user);
  if (erro) return { ok: false, erro };

  const admin = createAdminClient();
  const razao = entrada.razaoSocial.trim();
  const cnpj = soDigitos(entrada.cnpj);
  const telefone = soDigitos(entrada.telefone);
  if (await cnpjJaUsado(admin, cnpj)) {
    return { ok: false, erro: "Este CNPJ já tem conta corporativa. Peça acesso ao administrador da empresa." };
  }

  // Caso 1: ja logado como cliente da loja -> a empresa usa o cadastro dele.
  if (user) {
    const [{ data: vinculo }, { data: perfil }, { data: cliente }] = await Promise.all([
      admin.from("corporate_buyers").select("id").eq("auth_user_id", user.id).maybeSingle(),
      admin.from("profiles").select("id").eq("id", user.id).maybeSingle(),
      admin
        .from("customers")
        .select("id, documento, telefone")
        .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
        .eq("auth_user_id", user.id)
        .maybeSingle(),
    ]);
    if (vinculo) return { ok: false, erro: "Seu login já está ligado a uma empresa." };
    if (perfil) return { ok: false, erro: "Login da equipe não pode solicitar conta corporativa. Use um e-mail de cliente." };
    if (!cliente) return { ok: false, erro: "Cadastro de cliente não encontrado. Saia e cadastre a empresa com um e-mail novo." };
    const doc = soDigitos(cliente.documento ?? "");
    if (doc && doc !== cnpj) {
      return {
        ok: false,
        erro: "Seu cadastro já tem outro CPF/CNPJ. Para a empresa, saia e cadastre com outro e-mail.",
      };
    }
    const { error: errUp } = await admin
      .from("customers")
      .update({ documento: cnpj, telefone: cliente.telefone ?? telefone })
      .eq("id", cliente.id);
    if (errUp) {
      console.error("customers update corporativo:", errUp);
      return { ok: false, erro: "Não foi possível atualizar seu cadastro. Tente novamente." };
    }
    const r = await criarEmpresa(admin, user.id, cliente.id, razao, cnpj);
    return r.ok ? { ok: true, destino: "/corporativo" } : r;
  }

  // Caso 2: visitante -> cria login + cadastro da empresa + vinculo admin.
  const email = entrada.email.toLowerCase().trim();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: entrada.senha,
    email_confirm: true,
    user_metadata: { full_name: entrada.contato.trim() },
  });
  if (authError || !authData.user) {
    if (authError?.code === "email_exists" || /already (been )?registered/i.test(authError?.message ?? "")) {
      return { ok: false, jaCadastrado: true, erro: "Este e-mail já tem cadastro. Entre com sua senha e solicite a conta da empresa." };
    }
    console.error("createUser corporativo:", authError);
    return { ok: false, erro: "Não foi possível criar seu acesso agora. Tente novamente." };
  }
  const userId = authData.user.id;

  const { data: cliente, error: errCli } = await admin
    .from("customers")
    .insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      auth_user_id: userId,
      name: razao,
      email,
      telefone,
      documento: cnpj,
      tier: "bronze",
      points: 0,
      ativo: true,
    })
    .select("id")
    .single();
  if (errCli || !cliente) {
    await admin.auth.admin.deleteUser(userId);
    console.error("customers insert corporativo:", errCli);
    return { ok: false, erro: "Não foi possível criar o cadastro da empresa. Tente novamente." };
  }

  const r = await criarEmpresa(admin, userId, cliente.id, razao, cnpj);
  if (!r.ok) {
    await admin.from("customers").delete().eq("id", cliente.id);
    await admin.auth.admin.deleteUser(userId);
    return r;
  }

  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password: entrada.senha });
  if (loginError) return { ok: false, erro: "Empresa cadastrada. Entre com seu e-mail e senha para acompanhar." };
  return { ok: true, destino: "/corporativo" };
}
