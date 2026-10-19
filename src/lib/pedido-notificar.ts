// Aviso automático ao cliente quando o pedido muda de status (entrega 2
// "Notificação automática de clientes"). Best-effort: nunca derruba a action
// que chamou — se o Resend falhar ou não houver email, só loga. Idempotência
// vem de graça do guard de transição: quem chama já só chama quando o status
// MUDOU de verdade (update com .in("status",[de])), então um retry não re-avisa.
// Só mensagem de serviço (status do pedido), sem propaganda — CDC. O pedido
// do PDV (cliente balcao@) é descartado: não é gente para avisar.

import type { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import {
  enviarEmail,
  codigoPedido,
  templatePedidoSeparado,
  templatePedidoEnviado,
  templatePedidoEntregue,
  templatePedidoCancelado,
} from "@/lib/email";

type Admin = ReturnType<typeof createAdminClient>;

export type EventoPedido = "processando" | "em_rota" | "entregue" | "cancelado";

// cliente interno do PDV (0015) — não recebe aviso
const EMAIL_BALCAO = "balcao@nuvemdepapel.com.br";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TEMPLATES: Record<
  EventoPedido,
  (nome: string, codigo: string) => { assunto: string; html: string }
> = {
  processando: templatePedidoSeparado,
  em_rota: templatePedidoEnviado,
  entregue: templatePedidoEntregue,
  cancelado: templatePedidoCancelado,
};

export async function notificarStatusPedido(
  admin: Admin,
  pedidoId: string,
  evento: EventoPedido,
  actorUserId?: string | null
): Promise<void> {
  try {
    const template = TEMPLATES[evento];
    if (!template) return;

    const { data: pedido } = await admin
      .from("orders")
      .select("id, customer_id, customers(name, email)")
      .eq("id", pedidoId)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .maybeSingle();
    if (!pedido) return;

    // a relacao to-one volta como objeto ou array conforme os tipos gerados
    const clientes = (pedido as { customers?: unknown }).customers;
    const cli = (Array.isArray(clientes) ? clientes[0] : clientes) as
      | { name?: string | null; email?: string | null }
      | null
      | undefined;

    const email = String(cli?.email ?? "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email) || email === EMAIL_BALCAO) return;

    const t = template(String(cli?.name ?? "").trim(), codigoPedido(pedidoId));
    await enviarEmail(email, t.assunto, t.html, {
      fonte: "system",
      actorUserId: actorUserId ?? null,
      relatedEntity: "orders",
      relatedId: pedidoId,
    });
  } catch (e) {
    console.error("[pedido-notificar] aviso falhou (best-effort):", e);
  }
}
