import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_OPERACIONAIS } from "@/lib/rbac";
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
  const [filaRes, estoqueRes, meuRes] = await Promise.all([
    admin
      .from("orders")
      .select(
        "id, status, total_amount, created_at, payment_method, customers(name), order_items(count)"
      )
      .in("status", ["aguardando_pagamento", "pago", "processando", "em_rota"])
      .order("created_at", { ascending: true }),
    admin
      .from("catalog_items")
      .select("id, sku, name, item_stock(stock_available, stock_on_hand), item_commercial_data(min_stock)")
      .eq("active", true)
      .order("name", { ascending: true }),
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_OPERACIONAIS.includes(meu.role)) {
    redirect("/crm");
  }

  const fila: PedidoFila[] = (filaRes.data ?? []).map((o) => ({
    id: o.id,
    status: o.status,
    total_amount: Number(o.total_amount),
    created_at: o.created_at,
    payment_method: o.payment_method ?? null,
    cliente: o.customers && "name" in o.customers ? (o.customers as { name: string }).name : "—",
    itens: Array.isArray(o.order_items) ? (o.order_items[0]?.count ?? 0) : 0,
  }));

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

  return <ConsoleLogistica fila={fila} estoque={estoque} />;
}
