import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  ConsoleFornecedor,
  type PedidoFornecedor,
} from "@/components/portal/ConsoleFornecedor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal do Fornecedor — Nuvem de Papel",
  description: "Pedidos de compra em aberto e registro de recebimento.",
};

export default async function PortalFornecedorPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/portal/fornecedor");

  const admin = createAdminClient();
  const [meuRes, fornRes] = await Promise.all([
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    admin.from("suppliers").select("id, name").eq("user_id", user.id).maybeSingle(),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || meu.role !== "fornecedor") {
    redirect("/login");
  }

  const fornecedor = fornRes.data;

  if (!fornecedor) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 32px 72px" }}>
        <h1 className="display" style={{ fontSize: 32, marginBottom: 8, color: "var(--ink)" }}>
          Portal do Fornecedor
        </h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 15 }}>
          Nenhum fornecedor vinculado ao seu usuário. Peça ao administrador para
          vincular seu e-mail em <strong>Compras → Novo fornecedor</strong>.
        </p>
      </main>
    );
  }

  const [poRes, recRes] = await Promise.all([
    admin
      .from("purchase_orders")
      .select(
        "id, code, status, total, notes, expected_at, created_at, purchase_order_items(id, sku_snapshot, name_snapshot, quantity, unit_cost)"
      )
      .eq("supplier_id", fornecedor.id)
      .order("created_at", { ascending: false }),
    admin
      .from("purchase_receipts")
      .select(
        "id, code, status, received_at, purchase_order_id, purchase_receipt_items(purchase_order_item_id, quantity)"
      )
      .eq("status", "postado"),
  ]);

  const recebidoPorItem = new Map<string, number>();
  for (const r of recRes.data ?? []) {
    for (const ri of r.purchase_receipt_items ?? []) {
      recebidoPorItem.set(
        ri.purchase_order_item_id,
        (recebidoPorItem.get(ri.purchase_order_item_id) ?? 0) + Number(ri.quantity)
      );
    }
  }

  const pedidos: PedidoFornecedor[] = (poRes.data ?? []).map((p) => ({
    id: p.id,
    codigo: p.code,
    status: p.status,
    total: Number(p.total),
    notas: p.notes,
    criadoEm: p.created_at,
    itens: (p.purchase_order_items ?? []).map((i) => ({
      id: i.id,
      sku: i.sku_snapshot,
      nome: i.name_snapshot,
      quantidade: i.quantity,
      recebido: recebidoPorItem.get(i.id) ?? 0,
      custo: Number(i.unit_cost),
    })),
  }));

  return <ConsoleFornecedor fornecedor={fornecedor.name} pedidos={pedidos} />;
}
