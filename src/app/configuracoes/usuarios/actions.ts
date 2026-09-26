"use server";

import { revalidatePath } from "next/cache";
import { PAPEIS, PAPEIS_GESTAO, podeGerenciar } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { enviarEmail, templateConvite, templateRevendaAprovada, templateRevendaRejeitada } from "@/lib/email";

// Console de usuários (Fase 2). Toda escrita:
//  1) revalida a sessão + papel de gestão no servidor (fail-closed);
//  2) grava via service_role (único que escreve em profiles/audit_log);
//  3) registra o antes/depois em audit_log (trilha — migration 0005).

export type ResultadoAcao = { ok: true; aviso?: string } | { ok: false; erro: string };

type Gestor = { id: string; role: string };

async function gestorAtual(): Promise<Gestor | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "ativo" || !PAPEIS_GESTAO.includes(profile.role)) {
    return null;
  }
  return profile;
}

function ehEmail(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

async function auditar(
  gestor: Gestor,
  action: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: gestor.id,
    action,
    entity: "profiles",
    entity_id: entityId,
    before,
    after,
  });
  return !error;
}

function atualizarTelas() {
  revalidatePath("/configuracoes/usuarios");
  revalidatePath("/configuracoes/auditoria");
}

export async function criarUsuario(input: {
  email: string;
  fullName: string;
  role: string;
  senha: string;
}): Promise<ResultadoAcao> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };

  const email = (input.email ?? "").trim().toLowerCase();
  const fullName = (input.fullName ?? "").trim();
  const role = (input.role ?? "").trim();
  const senha = input.senha ?? "";

  if (!ehEmail(email)) return { ok: false, erro: "E-mail inválido." };
  if (!PAPEIS.includes(role)) return { ok: false, erro: "Papel inválido." };
  if (!podeGerenciar(gestor.role, role)) {
    return { ok: false, erro: `Seu papel não pode criar usuários com papel "${role}".` };
  }
  if (senha.length < 8) return { ok: false, erro: "Senha mínima: 8 caracteres." };

  const admin = createAdminClient();
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true, // SMTP ainda não configurado — confirmação manual (Fase 3)
  });
  if (erroAuth || !criado.user) {
    return { ok: false, erro: erroAuth?.message ?? "Falha ao criar usuário no Auth." };
  }

  const { error: erroProfile } = await admin.from("profiles").insert({
    id: criado.user.id,
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    email,
    full_name: fullName || null,
    role,
    status: "ativo",
  });
  if (erroProfile) {
    // compensação: não deixa usuário órfão no Auth
    await admin.auth.admin.deleteUser(criado.user.id);
    return { ok: false, erro: `Falha ao criar perfil: ${erroProfile.message}` };
  }

  const auditOk = await auditar(gestor, "usuario.criado", criado.user.id, null, {
    email,
    full_name: fullName,
    role,
    status: "ativo",
  });

  try {
    const t = templateConvite(fullName, email);
    await enviarEmail(email, t.assunto, t.html);
  } catch {
    // e-mail é best-effort: nunca derruba a criação
  }

  atualizarTelas();
  return auditOk ? { ok: true } : { ok: true, aviso: "Usuário criado, mas a auditoria falhou." };
}

export async function alterarPapel(input: {
  userId: string;
  novoRole: string;
}): Promise<ResultadoAcao> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  if (input.userId === gestor.id) {
    return { ok: false, erro: "Você não pode alterar o próprio papel." };
  }
  if (!PAPEIS.includes(input.novoRole)) return { ok: false, erro: "Papel inválido." };
  if (!podeGerenciar(gestor.role, input.novoRole)) {
    return { ok: false, erro: `Seu papel não pode definir "${input.novoRole}".` };
  }

  const admin = createAdminClient();
  const { data: alvo } = await admin
    .from("profiles")
    .select("id, email, full_name, role, status")
    .eq("id", input.userId)
    .maybeSingle();
  if (!alvo) return { ok: false, erro: "Usuário não encontrado." };
  if (alvo.role === "master" && gestor.role !== "master") {
    return { ok: false, erro: "Apenas master altera usuários master." };
  }
  if (alvo.role === input.novoRole) return { ok: true };

  const { error } = await admin
    .from("profiles")
    .update({ role: input.novoRole })
    .eq("id", input.userId);
  if (error) return { ok: false, erro: `Falha ao alterar papel: ${error.message}` };

  const auditOk = await auditar(
    gestor,
    "usuario.papel_alterado",
    input.userId,
    { role: alvo.role },
    { role: input.novoRole }
  );

  atualizarTelas();
  return auditOk
    ? { ok: true }
    : { ok: true, aviso: "Papel alterado, mas a auditoria falhou." };
}

export async function alternarStatus(input: {
  userId: string;
  novoStatus: "ativo" | "inativo";
}): Promise<ResultadoAcao> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  if (input.userId === gestor.id) {
    return { ok: false, erro: "Você não pode alterar o próprio status." };
  }
  if (input.novoStatus !== "ativo" && input.novoStatus !== "inativo") {
    return { ok: false, erro: "Status inválido." };
  }

  const admin = createAdminClient();
  const { data: alvo } = await admin
    .from("profiles")
    .select("id, email, full_name, role, status")
    .eq("id", input.userId)
    .maybeSingle();
  if (!alvo) return { ok: false, erro: "Usuário não encontrado." };
  if (alvo.role === "master" && gestor.role !== "master") {
    return { ok: false, erro: "Apenas master altera usuários master." };
  }
  if (alvo.status === input.novoStatus) return { ok: true };

  if (input.novoStatus === "inativo" && alvo.role === "master") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "master")
      .eq("status", "ativo")
      .neq("id", input.userId);
    if ((count ?? 0) === 0) {
      return { ok: false, erro: "É preciso manter ao menos um master ativo." };
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ status: input.novoStatus })
    .eq("id", input.userId);
  if (error) return { ok: false, erro: `Falha ao alterar status: ${error.message}` };

  // aprovação de pedido de revenda (F6) tem trilha propria
  const auditAction =
    alvo.status === "pendente"
      ? input.novoStatus === "ativo"
        ? "revenda.aprovada"
        : "revenda.rejeitada"
      : input.novoStatus === "inativo"
        ? "usuario.desativado"
        : "usuario.reativado";
  const auditOk = await auditar(gestor, auditAction, input.userId, { status: alvo.status }, {
    status: input.novoStatus,
  });

  // notificação da trilha de revenda (F6.5, best-effort)
  if (auditAction === "revenda.aprovada" || auditAction === "revenda.rejeitada") {
    const nomeAlvo = alvo.full_name || alvo.email;
    const tRevenda =
      auditAction === "revenda.aprovada"
        ? templateRevendaAprovada(nomeAlvo)
        : templateRevendaRejeitada(nomeAlvo);
    await enviarEmail(alvo.email, tRevenda.assunto, tRevenda.html, {
      actorUserId: gestor.id,
      relatedEntity: "profiles",
      relatedId: input.userId,
    });
  }

  atualizarTelas();
  return auditOk
    ? { ok: true }
    : { ok: true, aviso: "Status alterado, mas a auditoria falhou." };
}
