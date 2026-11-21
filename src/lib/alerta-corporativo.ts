import type { SupabaseClient } from "@supabase/supabase-js";
import { emailAvisos, enviarEmail, templateAlertaPedidoCorporativo } from "@/lib/email";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

// Aviso de pedido corporativo para a loja (etapa 4 - 21/11/2026).
// Trilha em corporate_alerts (0059): unique por pedido, entao o mesmo pedido
// nunca avisa duas vezes (reenvio/idempotencia da RPC caem no 23505).
// Best-effort: nunca derruba o pedido; devolve o que aconteceu para o teste.
export type ResultadoAlerta = "enviado" | "falhou" | "repetido" | "erro";

export async function alertarPedidoCorporativo(
  admin: SupabaseClient,
  args: { orderId: string; accountId: string | null; comprador: string; observacao: string | null; actorUserId: string | null }
): Promise<ResultadoAlerta> {
  try {
    const { data: alerta, error: errIns } = await admin
      .from("corporate_alerts")
      .insert({ tenant_id: NUVEM_DE_PAPEL_TENANT_ID, order_id: args.orderId, account_id: args.accountId, canal: "email" })
      .select("id")
      .single();
    if (errIns) return errIns.code === "23505" ? "repetido" : "erro";

    const marcar = async (status: "enviado" | "falhou", erro: string | null) => {
      await admin.from("corporate_alerts").update({ status, erro }).eq("id", alerta.id);
      return status;
    };

    const [{ data: pedido }, { data: itens }, { data: conta }, { data: entrega }] = await Promise.all([
      admin.from("orders").select("id, venda_numero, total_amount, condicao").eq("id", args.orderId).single(),
      admin.from("order_items").select("sku, name, quantity, total").eq("order_id", args.orderId),
      args.accountId
        ? admin.from("corporate_accounts").select("razao_social, cnpj").eq("id", args.accountId).single()
        : Promise.resolve({ data: null }),
      admin.from("entregas").select("endereco").eq("order_id", args.orderId).maybeSingle(),
    ]);
    const { data: titulo } = await admin
      .from("financial_titles")
      .select("due_date")
      .eq("source_type", "corporativo")
      .eq("source_id", args.orderId)
      .maybeSingle();
    if (!pedido || !conta) return await marcar("falhou", "pedido_ou_conta_nao_encontrado");

    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
    const { assunto, html } = templateAlertaPedidoCorporativo({
      razaoSocial: conta.razao_social,
      cnpj: conta.cnpj,
      comprador: args.comprador,
      vendaNumero: pedido.venda_numero,
      pedidoId: pedido.id,
      total: Number(pedido.total_amount),
      condicao: pedido.condicao,
      vencimento: titulo?.due_date ?? null,
      itens: (itens ?? []).map((i) => ({ sku: i.sku, nome: i.name, quantidade: i.quantity, total: Number(i.total) })),
      entrega: (entrega?.endereco as Record<string, string | null> | null) ?? null,
      observacao: args.observacao,
      linkPainel: base ? `${base}/vendas` : null,
    });

    const r = await enviarEmail(emailAvisos(), assunto, html, {
      fonte: "system",
      actorUserId: args.actorUserId,
      relatedEntity: "orders",
      relatedId: args.orderId,
    });
    return await marcar(r.ok ? "enviado" : "falhou", r.ok ? null : (r.motivo ?? "falha").slice(0, 500));
  } catch {
    return "erro";
  }
}
