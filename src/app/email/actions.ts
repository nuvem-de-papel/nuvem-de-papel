"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { enviarEmail } from "@/lib/email";

// Server actions da caixa de e-mail (F6.5). Toda escrita revalida o perfil
// (fail-closed, mesma fórmula do console de usuários) e usa service_role.

export type ResultadoAcao = { ok: true; aviso?: string } | { ok: false; erro: string };

async function gestorAtual(): Promise<{ id: string; role: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || data.status !== "ativo" || !PAPEIS_GESTAO.includes(data.role)) return null;
  return { id: user.id, role: data.role };
}

function erroEnvio(motivo?: string): string {
  if (motivo === "resend_ausente") return "E-mail não configurado (RESEND_API_KEY ausente).";
  if (motivo === "destinatario_invalido") return "Destinatário inválido.";
  if (motivo === "fila_falhou") return "Falha ao registrar na caixa.";
  return `Falha ao enviar${motivo ? `: ${motivo}` : ""}.`;
}

export async function enviarManual(input: {
  destinatario: string;
  assunto: string;
  html: string;
}): Promise<ResultadoAcao> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };

  const destinatario = (input.destinatario ?? "").trim();
  const assunto = (input.assunto ?? "").trim();
  const html = (input.html ?? "").trim();
  if (!destinatario || !assunto) return { ok: false, erro: "Informe destinatário e assunto." };
  if (html.length > 500000) return { ok: false, erro: "Mensagem muito grande." };

  const r = await enviarEmail(destinatario, assunto, html, {
    fonte: "manual",
    actorUserId: gestor.id,
  });
  if (!r.ok) return { ok: false, erro: erroEnvio(r.motivo) };

  revalidatePath("/email");
  return { ok: true };
}

export async function responder(input: {
  originalId: string;
  html: string;
}): Promise<ResultadoAcao> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };

  const html = (input.html ?? "").trim();
  if (!html) return { ok: false, erro: "Escreva a resposta." };
  if (html.length > 500000) return { ok: false, erro: "Mensagem muito grande." };

  const admin = createAdminClient();
  const { data: original } = await admin
    .from("email_messages")
    .select("id, from_email, subject, external_message_id, thread_id")
    .eq("id", input.originalId)
    .eq("direction", "inbound")
    .maybeSingle();
  if (!original) return { ok: false, erro: "Mensagem não encontrada." };

  const assunto = /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`;
  const r = await enviarEmail(original.from_email, assunto, html, {
    fonte: "manual",
    actorUserId: gestor.id,
    threadId: original.thread_id || original.external_message_id || original.id,
    inReplyTo: original.external_message_id,
    relatedEntity: "email_messages",
    relatedId: original.id,
  });
  if (!r.ok) return { ok: false, erro: erroEnvio(r.motivo) };

  revalidatePath("/email");
  return { ok: true };
}

export async function marcarLido(id: string): Promise<ResultadoAcao> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) return { ok: false, erro: "Mensagem inválida." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("email_messages")
    .update({ read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("direction", "inbound")
    .is("read_at", null);
  if (error) return { ok: false, erro: `Falha ao marcar: ${error.message}` };
  revalidatePath("/email");
  return { ok: true };
}

export async function baixarAnexo(
  id: string,
  storagePath: string
): Promise<{ ok: boolean; url?: string; erro?: string }> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };

  const admin = createAdminClient();
  const { data: msg } = await admin
    .from("email_messages")
    .select("attachments")
    .eq("id", id)
    .maybeSingle();
  const lista = (msg?.attachments ?? []) as { storage_path?: string }[];
  if (!lista.some((a) => a.storage_path === storagePath)) {
    return { ok: false, erro: "Anexo não encontrado." };
  }

  const { data: signed, error } = await admin.storage
    .from("email-attachments")
    .createSignedUrl(storagePath, 3600);
  if (error || !signed) return { ok: false, erro: "Falha ao gerar o link." };
  return { ok: true, url: signed.signedUrl };
}
