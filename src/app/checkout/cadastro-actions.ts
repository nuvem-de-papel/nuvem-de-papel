"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

/**
 * Cadastro básico na compra (Opção C).
 * Cria usuário no Supabase Auth + customer e já abre a sessão do cliente
 * no servidor (o /login é da equipe e recusa quem não tem profile).
 */

export type ResultadoCadastroBasico =
  | { ok: true; destino: string }
  | { ok: false; erro: string };

export async function entrarParaCompra(input: {
  email: string;
  senha: string;
}): Promise<ResultadoCadastroBasico> {
  const email = (input.email ?? "").toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, erro: "E-mail inválido." };
  }
  if (!input.senha) {
    return { ok: false, erro: "Informe sua senha." };
  }
  const supa = createClient();
  const { error } = await supa.auth.signInWithPassword({ email, password: input.senha });
  if (error) {
    return { ok: false, erro: "E-mail ou senha incorretos." };
  }
  return { ok: true, destino: "/checkout" };
}

export async function cadastrarBasicoParaCompra(input: {
  nome: string;
  email: string;
  telefone: string;
  senha: string;
}): Promise<ResultadoCadastroBasico> {
  const { nome, email, telefone, senha } = input;

  // Validações
  if (!nome || nome.trim().length < 3) {
    return { ok: false, erro: "Nome deve ter pelo menos 3 caracteres." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, erro: "E-mail inválido." };
  }
  if (!telefone || telefone.replace(/\D/g, "").length < 10) {
    return { ok: false, erro: "Telefone inválido. Mínimo 10 dígitos." };
  }
  if (!senha || senha.length < 6) {
    return { ok: false, erro: "Senha deve ter pelo menos 6 caracteres." };
  }

  const admin = createAdminClient();

  // 1. Criar usuário no Supabase Auth
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password: senha,
    email_confirm: true, // auto-confirma (não envia email)
    user_metadata: {
      full_name: nome.trim(),
    },
  });

  if (authError || !authData.user) {
    if (authError?.message?.includes("already registered")) {
      return { ok: false, erro: "Este e-mail já está cadastrado. Faça login para continuar." };
    }
    console.error("Erro ao criar usuário:", authError);
    return { ok: false, erro: "Não foi possível criar sua conta agora. Tente novamente." };
  }

  const userId = authData.user.id;

  try {
    // 2. NÃO criar profile para cliente da loja
    // Profile é só para usuários do painel (master, gerente, operador, etc)
    // Cliente da loja tem apenas: Auth user + customer

    // 3. Criar customer (vinculado ao user_id)
    const { error: customerError } = await admin.from("customers").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      auth_user_id: userId,
      name: nome.trim(),
      email: email.toLowerCase().trim(),
      telefone: telefone.replace(/\D/g, ""),
      tier: "bronze",
      points: 0,
      ativo: true,
    });

    if (customerError) {
      console.error("Erro ao criar customer:", customerError);
      // Rollback: remover usuário
      await admin.auth.admin.deleteUser(userId);
      return { ok: false, erro: "Erro ao criar cadastro de cliente. Tente novamente." };
    }

    // 4. Audit log (cadastro.criado_na_compra)
    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: userId,
      action: "cadastro.criado_na_compra",
      entity: "customers",
      entity_id: userId,
      after: {
        email: email.toLowerCase().trim(),
        nome: nome.trim(),
        telefone: telefone.replace(/\D/g, ""),
      },
    });

    // 5. Abrir a sessão do cliente (cookies) e voltar ao checkout
    const supa = createClient();
    const { error: loginError } = await supa.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password: senha,
    });
    if (loginError) {
      console.error("Erro ao abrir sessão do cliente:", loginError);
      return { ok: false, erro: "Conta criada. Entre com seu e-mail e senha para continuar." };
    }
    return { ok: true, destino: "/checkout" };
  } catch (erro) {
    console.error("Erro no cadastro básico:", erro);
    // Rollback: remover tudo
    try {
      await admin.from("customers").delete().eq("auth_user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    } catch (rollbackError) {
      console.error("Erro no rollback:", rollbackError);
    }
    return { ok: false, erro: "Erro inesperado. Entre em contato com o suporte." };
  }
}
