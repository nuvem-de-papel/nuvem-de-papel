import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_OPERACIONAIS } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { ConsoleLogistica, type ItemEstoque, type PedidoFila } from "@/components/logistica/ConsoleLogistica";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Logística — Nuvem de Papel",
  description: "Fila de expedição, estoque e movimentos manuais.",
};

export default async function LogisticaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/logistica");

  const admin = createAdminClient();
  const SELECT_PEDIDO =
    "id, status, total_amount, created_at, payment_method, customers(name), order_items(count)";
  // Kanban (22/11/2026): a coluna "Entregue" mostra o que foi entregue nos
  // ultimos 7 dias. `orders` nao guarda quando mudou de status — a data vem
  // da trilha `logistica.avancar` (para = entregue) do audit_log.
  const seteDias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [filaRes, estoqueRes, meuRes, entreguesAuditRes] = await Promise.all([
    admin
      .from("orders")
      .select(SELECT_PEDIDO)
      .in("status", ["aguardando_pagamento", "pago", "processando", "em_rota"])
      .order("created_at", { ascending: true }),
    admin
      .from("catalog_items")
      .select("id, sku, name, item_stock(stock_available, stock_on_hand), item_commercial_data(min_stock)")
      .eq("active", true)
      .order("name", { ascending: true }),
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    admin
      .from("audit_log")
      .select("entity_id, created_at")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("action", "logistica.avancar")
      .eq("after->>para", "entregue")
      .gte("created_at", seteDias)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_OPERACIONAIS.includes(meu.role)) {
    redirect("/crm");
  }

  type LinhaPedido = NonNullable<typeof filaRes.data>[number];
  const paraFila = (o: LinhaPedido): PedidoFila => {
    const cli = (Array.isArray(o.customers) ? o.customers[0] : o.customers) as { name?: string } | null;
    return {
      id: o.id,
      status: o.status,
      total_amount: Number(o.total_amount),
      created_at: o.created_at,
      payment_method: o.payment_method ?? null,
      cliente: cli?.name ?? "—",
      itens: Array.isArray(o.order_items) ? (o.order_items[0]?.count ?? 0) : 0,
    };
  };
  const fila: PedidoFila[] = (filaRes.data ?? []).map(paraFila);

  // entregues: ordem = entrega mais recente primeiro; so os que continuam
  // `entregue` (a trilha pode citar pedido que mudou depois)
  const entregueEm = new Map<string, string>();
  for (const a of entreguesAuditRes.data ?? []) {
    if (a.entity_id && !entregueEm.has(a.entity_id)) entregueEm.set(a.entity_id, a.created_at);
  }
  let entregues: PedidoFila[] = [];
  if (entregueEm.size > 0) {
    const { data } = await admin
      .from("orders")
      .select(SELECT_PEDIDO)
      .in("id", [...entregueEm.keys()])
      .eq("status", "entregue");
    entregues = (data ?? [])
      .map((o) => ({ ...paraFila(o), entregue_em: entregueEm.get(o.id) ?? null }))
      .sort((a, b) => String(b.entregue_em).localeCompare(String(a.entregue_em)));
  }

  const estoque: ItemEstoque[] = (estoqueRes.data ?? []).map((r) => {
    const estRaw = r.item_stock as unknown;
    const comRaw = r.item_commercial_data as unknown;
    const est = (Array.isArray(estRaw) ? estRaw[0] : estRaw) as {
      stock_available: number;
      stock_on_hand: number;
    } | null;
    const com = (Array.isArray(comRaw) ? comRaw[0] : comRaw) as { min_stock: number } | null;
    return {
      id: r.id,
      sku: r.sku,
      name: r.name,
      min_stock: com ? Number(com.min_stock) : 0,
      disponivel: est ? Number(est.stock_available) : null,
      fisico: est ? Number(est.stock_on_hand) : null,
    };
  });

  return <ConsoleLogistica fila={fila} entregues={entregues} estoque={estoque} />;
}
