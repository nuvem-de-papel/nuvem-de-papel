"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

/**
 * Cadastro básico na compra (Opção C).
 * Cria usuário no Supabase Auth + profile + customer.
 * Retorna URL de login com next=/checkout para continuar a compra.
 */

export type ResultadoCadastroBasico =
  | { ok: true; loginUrl: string }
  | { ok: false; erro: string };

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
    // 2. Criar profile (papel 'cliente', status 'ativo')
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      full_name: nome.trim(),
      role: "cliente",
      status: "ativo",
    });

    if (profileError) {
      console.error("Erro ao criar profile:", profileError);
      // Rollback: remover usuário do Auth
      await admin.auth.admin.deleteUser(userId);
      return { ok: false, erro: "Erro ao criar perfil. Tente novamente." };
    }

    // 3. Criar customer (vinculado ao user_id)
    const { error: customerError } = await admin.from("customers").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      user_id: userId,
      name: nome.trim(),
      email: email.toLowerCase().trim(),
      phone: telefone.replace(/\D/g, ""),
      tier: "bronze",
      points: 0,
      active: true,
    });

    if (customerError) {
      console.error("Erro ao criar customer:", customerError);
      // Rollback: remover profile e usuário
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
      return { ok: false, erro: "Erro ao criar cadastro de cliente. Tente novamente." };
    }

    // 4. Audit log (cadastro.criado_na_compra)
    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      event_type: "cadastro.criado_na_compra",
      actor_id: userId,
      event_data: {
        email: email.toLowerCase().trim(),
        nome: nome.trim(),
        telefone: telefone.replace(/\D/g, ""),
      },
    });

    // 5. Retornar URL de login com redirect para checkout
    const loginUrl = `/login?next=/checkout&email=${encodeURIComponent(email)}`;
    return { ok: true, loginUrl };
  } catch (erro) {
    console.error("Erro no cadastro básico:", erro);
    // Rollback: remover tudo
    try {
      await admin.from("customers").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    } catch (rollbackError) {
      console.error("Erro no rollback:", rollbackError);
    }
    return { ok: false, erro: "Erro inesperado. Entre em contato com o suporte." };
  }
}
