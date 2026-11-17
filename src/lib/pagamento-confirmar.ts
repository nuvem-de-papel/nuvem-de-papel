import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { buscarPagamentosDoPedido } from "@/lib/mercadopago";
import { enviarEmail, templatePedidoPago, codigoPedido } from "@/lib/email";

// Confirmação de pagamento aprovado (17/11/2026) — um único caminho para os
// três gatilhos: webhook do MP, volta do cliente ao site (/conta/pedidos) e
// botão "Conferir pagamento" da logística. Antes a regra morava só no
// webhook; quando o aviso falhava, o pedido pago ficava em
// aguardando_pagamento para sempre (2 Pix de 16/11).
//
// Seguro para rodar N vezes: a troca de status só acontece a partir de
// aguardando_pagamento (o e-mail sai 1x, na transição real) e o
// settle_order_stock é idempotente (marcadores no ledger — 0007).

type Admin = ReturnType<typeof createAdminClient>;

export type ResultadoConfirmacao =
  | { ok: true; transicionou: boolean }
  | { ok: false; motivo: string };

export async function confirmarPagamentoAprovado(
  admin: Admin,
  pedidoId: string,
  paymentId: string
): Promise<ResultadoConfirmacao> {
  const { data: transicionado, error } = await admin
    .from("orders")
    .update({ status: "pago", mp_payment_id: paymentId })
    .eq("id", pedidoId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .in("status", ["aguardando_pagamento"])
    .select("id, customer_id");
  if (error) return { ok: false, motivo: `pedido_pago: ${error.message}` };

  const transicionou = !!transicionado && transicionado.length === 1;
  // aviso de pagamento confirmado (F6.5): só na transição real, 1x
  // (best-effort: nunca derruba quem chamou)
  if (transicionou) {
    try {
      const { data: cliente } = await admin
        .from("customers")
        .select("name, email")
        .eq("id", transicionado[0].customer_id)
        .maybeSingle();
      if (cliente?.email) {
        const tPago = templatePedidoPago(cliente.name ?? "", codigoPedido(pedidoId));
        await enviarEmail(cliente.email, tPago.assunto, tPago.html, {
          relatedEntity: "orders",
          relatedId: pedidoId,
        });
      }
    } catch (e) {
      console.error(`[pagamento] e-mail de pago falhou pedido=${pedidoId}:`, e);
    }
  }

  // settle só quando o pedido chegou (ou já está) em fase pós-pagamento —
  // cobre retry após falha parcial (status ok, estoque falhou antes)
  const { data: pedido } = await admin
    .from("orders")
    .select("id, status")
    .eq("id", pedidoId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (pedido && ["pago", "processando", "em_rota", "entregue"].includes(pedido.status)) {
    const { error: erroBaixa } = await admin.rpc("settle_order_stock", { p_order_id: pedidoId });
    if (erroBaixa) return { ok: false, motivo: `baixa_estoque: ${erroBaixa.message}` };
  }
  return { ok: true, transicionou };
}

export type ResultadoReconciliacao =
  | { situacao: "pago"; transicionou: boolean; paymentId: string }
  | { situacao: "sem_pagamento_aprovado"; statusMp: string[] }
  | { situacao: "falha"; motivo: string };

// Pergunta ao MP se o pedido tem pagamento aprovado e, se tiver, confirma.
// NUNCA cancela: pagamento recusado não encerra o pedido (o cliente pode
// tentar de novo) — cancelamento continua sendo do webhook ou da logística.
export async function reconciliarPedido(
  admin: Admin,
  pedidoId: string
): Promise<ResultadoReconciliacao> {
  const busca = await buscarPagamentosDoPedido(pedidoId);
  if (busca.motivo) return { situacao: "falha", motivo: busca.motivo };

  const aprovado = busca.pagamentos.find((p) => p.status === "approved");
  if (!aprovado) {
    return {
      situacao: "sem_pagamento_aprovado",
      statusMp: busca.pagamentos.map((p) => p.status ?? "?"),
    };
  }
  const r = await confirmarPagamentoAprovado(admin, pedidoId, aprovado.id);
  if (!r.ok) return { situacao: "falha", motivo: r.motivo };
  return { situacao: "pago", transicionou: r.transicionou, paymentId: aprovado.id };
}
