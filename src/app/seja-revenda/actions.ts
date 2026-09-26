"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { emailAvisos, enviarEmail, templateRevendaSolicitada } from "@/lib/email";

// Pedido de conta de revenda (F6): cria o usuário no Auth já confirmado e o
// perfil em status 'pendente' — o master aprova no console de usuários
// (trilha: revenda.pedido → revenda.aprovada/revenda.rejeitada).

export type ResultadoPedido = { ok: true } | { ok: false; erro: string };

function ehEmail(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

export async function pedirRevenda(input: {
  nome: string;
  email: string;
  senha: string;
}): Promise<ResultadoPedido> {
  const nome = (input.nome ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const senha = input.senha ?? "";

  if (nome.length < 3) return { ok: false, erro: "Informe seu nome completo." };
  if (!ehEmail(email)) return { ok: false, erro: "E-mail inválido." };
  if (senha.length < 8) return { ok: false, erro: "Senha mínima: 8 caracteres." };

  const admin = createAdminClient();
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true, // SMTP ausente — confirmação manual (mesma F3)
  });
  if (erroAuth || !criado.user) {
    const msg = erroAuth?.message ?? "";
    if (/already/i.test(msg)) {
      return { ok: false, erro: "Já existe uma conta com este e-mail." };
    }
    return { ok: false, erro: "Não foi possível criar a conta. Tente outro e-mail." };
  }

  const { error: erroProfile } = await admin.from("profiles").insert({
    id: criado.user.id,
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    email,
    full_name: nome,
    role: "revenda",
    status: "pendente",
  });
  if (erroProfile) {
    // compensação: não deixa usuário órfão no Auth
    await admin.auth.admin.deleteUser(criado.user.id);
    return { ok: false, erro: `Falha ao criar perfil: ${erroProfile.message}` };
  }

  const { error: erroAudit } = await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: null,
    action: "revenda.pedido",
    entity: "profiles",
    entity_id: criado.user.id,
    before: null,
    after: { email, full_name: nome, role: "revenda", status: "pendente" },
  });
  if (erroAudit) {
    // trilha é best-effort: pedido já criado
    console.error("pedirRevenda audit:", erroAudit.message);
  }

  // aviso ao time (F6.5, best-effort): novo pedido de revenda pendente
  const tRevenda = templateRevendaSolicitada(nome, email);
  await enviarEmail(emailAvisos(), tRevenda.assunto, tRevenda.html, {
    relatedEntity: "profiles",
    relatedId: criado.user.id,
  });

  return { ok: true };
}
