// Camada de e-mail da empresa (F6.5) — envio via API do Resend com trilha
// em email_messages (0010): fila local ANTES do envio (Idempotency-Key = id
// da linha) e status evolui queued → sent → (webhook) delivered/opened/
// bounced. Sem RESEND_API_KEY continua no-op (dev sem credencial): nada é
// gravado nem enviado. Recebimento entra na mesma tabela via
// /api/webhooks/resend (Etapa 3). Segredos só em env do servidor.

import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

type ResultadoEnvio = { ok: boolean; motivo?: string; id?: string };

export type OpcoesEnvio = {
  replyTo?: string;
  fonte?: "system" | "manual";
  actorUserId?: string | null;
  relatedEntity?: string | null;
  relatedId?: string | null;
  inReplyTo?: string | null;
  threadId?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMETENTE_PADRAO = "Nuvem de Papel <contatos@nuvemdepapel.com.br>";

export function resendConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function remetenteBruto(): string {
  return process.env.RESEND_FROM || REMETENTE_PADRAO;
}

function remetente(): { email: string; nome: string | null } {
  const bruto = remetenteBruto().trim();
  const m = /^(.*)<([^>]+)>$/.exec(bruto);
  if (m) {
    const nome = m[1].trim().replace(/^"|"$/g, "");
    return { email: m[2].trim(), nome: nome || null };
  }
  return { email: bruto, nome: null };
}

// Caixa de avisos internos (ex.: novo pedido de revenda para o master).
export function emailAvisos(): string {
  return process.env.EMAIL_AVISOS || "admin@nuvemdepapel.com.br";
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function codigoPedido(pedidoId: string): string {
  return "#" + pedidoId.slice(0, 8).toUpperCase();
}

function rodape(): string {
  return (
    '<p style="color:#8A8296;font-size:12px;margin-top:24px">' +
    "Nuvem de Papel — esta é uma mensagem automática.</p>"
  );
}

export async function enviarEmail(
  destinatario: string,
  assunto: string,
  html: string,
  opcoes: OpcoesEnvio = {}
): Promise<ResultadoEnvio> {
  const para = (destinatario ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(para)) return { ok: false, motivo: "destinatario_invalido" };

  if (!resendConfigurado()) {
    console.info(
      `[email] RESEND_API_KEY ausente — nada enviado. para=${para} assunto="${assunto}" (${html.length}b)`
    );
    return { ok: false, motivo: "resend_ausente" };
  }

  const admin = createAdminClient();
  const de = remetente();

  // 1) fila local: sem trilha não envia (idempotência + auditoria da caixa)
  const { data: linha, error: erroInsert } = await admin
    .from("email_messages")
    .insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      direction: "outbound",
      status: "queued",
      source: opcoes.fonte ?? "system",
      from_email: de.email,
      from_name: de.nome,
      to_emails: [para],
      reply_to: opcoes.replyTo ? [opcoes.replyTo] : [],
      subject: assunto,
      html,
      actor_user_id: opcoes.actorUserId ?? null,
      related_entity: opcoes.relatedEntity ?? null,
      related_id: opcoes.relatedId ?? null,
      in_reply_to: opcoes.inReplyTo ?? null,
      thread_id: opcoes.threadId ?? null,
    })
    .select("id")
    .single();
  if (erroInsert || !linha) {
    console.error("[email] fila local falhou:", erroInsert?.message);
    return { ok: false, motivo: "fila_falhou" };
  }

  const falhar = async (motivo: string): Promise<ResultadoEnvio> => {
    await admin
      .from("email_messages")
      .update({ status: "failed", error: motivo, updated_at: new Date().toISOString() })
      .eq("id", linha.id);
    return { ok: false, motivo, id: linha.id };
  };

  // 2) envio na API do Resend (Idempotency-Key = id da fila local)
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": linha.id,
      },
      body: JSON.stringify({
        from: remetenteBruto(),
        to: [para],
        subject: assunto,
        html,
        ...(opcoes.replyTo ? { reply_to: [opcoes.replyTo] } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const corpo = (await resp.json().catch(() => null)) as {
      data?: { id?: string };
      message?: string;
      name?: string;
    } | null;
    if (!resp.ok || !corpo?.data?.id) {
      const motivo = corpo?.name || corpo?.message || `http_${resp.status}`;
      return await falhar(motivo);
    }
    await admin
      .from("email_messages")
      .update({
        status: "sent",
        resend_id: corpo.data.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", linha.id);
    return { ok: true, id: linha.id };
  } catch (e) {
    return await falhar(e instanceof Error ? e.message.slice(0, 200) : "falha_rede");
  }
}

// --------------------------------------------------------------- templates --
export function templateConvite(
  nome: string,
  email: string
): { assunto: string; html: string } {
  const nomeSeguro = escaparHtml(nome || email);
  const emailSeguro = escaparHtml(email);
  return {
    assunto: "Seu acesso à equipe Nuvem de Papel foi criado",
    html: [
      `<p>Olá ${nomeSeguro},</p>`,
      `<p>Seu acesso à área da equipe Nuvem de Papel foi criado com o e-mail <strong>${emailSeguro}</strong>.</p>`,
      `<p>Use a senha que foi informada fora deste e-mail. Se precisar redefini-la, use “Esqueci a senha” na tela de login.</p>`,
      rodape(),
    ].join(""),
  };
}

export function templatePedidoCriado(
  nome: string,
  codigo: string,
  total: number
): { assunto: string; html: string } {
  const nomeSeguro = escaparHtml(nome || "cliente");
  return {
    assunto: `Pedido ${codigo} recebido`,
    html: [
      `<p>Olá ${nomeSeguro},</p>`,
      `<p>Recebemos o seu pedido <strong>${codigo}</strong> no valor de <strong>${brl(total)}</strong>.</p>`,
      "<p>Assim que o pagamento for confirmado, ele entra em separação. Você pode acompanhar em Minha conta → Meus pedidos.</p>",
      rodape(),
    ].join(""),
  };
}

export function templatePedidoPago(
  nome: string,
  codigo: string
): { assunto: string; html: string } {
  const nomeSeguro = escaparHtml(nome || "cliente");
  return {
    assunto: `Pagamento do pedido ${codigo} confirmado`,
    html: [
      `<p>Olá ${nomeSeguro},</p>`,
      `<p>O pagamento do pedido <strong>${codigo}</strong> foi confirmado — ele já está sendo separado.</p>`,
      "<p>Acompanhe o status em Minha conta → Meus pedidos.</p>",
      rodape(),
    ].join(""),
  };
}

export function templateRevendaSolicitada(
  nome: string,
  email: string
): { assunto: string; html: string } {
  const nomeSeguro = escaparHtml(nome);
  const emailSeguro = escaparHtml(email);
  return {
    assunto: "Novo pedido de revenda aguardando aprovação",
    html: [
      "<p>Olá,</p>",
      `<p><strong>${nomeSeguro}</strong> (${emailSeguro}) pediu conta de revenda e está <strong>pendente</strong> de aprovação.</p>`,
      "<p>Aprove ou rejeite em Configurações → Usuários.</p>",
      rodape(),
    ].join(""),
  };
}

export function templateRevendaAprovada(
  nome: string
): { assunto: string; html: string } {
  const nomeSeguro = escaparHtml(nome);
  return {
    assunto: "Sua revenda foi aprovada",
    html: [
      `<p>Olá ${nomeSeguro},</p>`,
      "<p>Sua conta de revenda foi <strong>aprovada</strong> — a tabela de atacado já está liberada na vitrine.</p>",
      "<p>Entre com o seu e-mail e senha para comprar com preço de revenda.</p>",
      rodape(),
    ].join(""),
  };
}

export function templateRevendaRejeitada(
  nome: string
): { assunto: string; html: string } {
  const nomeSeguro = escaparHtml(nome);
  return {
    assunto: "Atualização sobre o seu pedido de revenda",
    html: [
      `<p>Olá ${nomeSeguro},</p>`,
      "<p>Não foi possível aprovar o seu pedido de revenda neste momento. Se quiser reenviar a solicitação ou falar com a equipe, responda este e-mail.</p>",
      rodape(),
    ].join(""),
  };
}

export function templatePedidoCompra(
  codigo: string,
  total: number
): { assunto: string; html: string } {
  return {
    assunto: `Novo pedido de compra ${codigo}`,
    html: [
      "<p>Olá,</p>",
      `<p>Emitimos o pedido de compra <strong>${codigo}</strong> no valor de <strong>${brl(total)}</strong>.</p>`,
      "<p>O acompanhamento (recebimentos e saldo a pagar) está no Portal do Fornecedor.</p>",
      rodape(),
    ].join(""),
  };
}
