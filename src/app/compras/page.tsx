import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { ConsoleCompras, type Fornecedor, type PedidoCompra, type ItemCatalogo } from "@/components/compras/ConsoleCompras";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compras — Nuvem de Papel",
  description: "Pedidos de compra ao fornecedor (atacado).",
};

export default async function ComprasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/compras");

  const admin = createAdminClient();
  const [fornRes, poRes, itensRes, meuRes] = await Promise.all([
    admin
      .from("suppliers")
      .select("id, name, contact_email, cnpj, user_id, active")
      .order("name", { ascending: true }),
    admin
      .from("purchase_orders")
      .select(
        "id, code, status, total, notes, created_at, expected_at, suppliers(id, name), purchase_order_items(id, sku_snapshot, name_snapshot, quantity, unit_cost, line_total)"
      )
      .order("created_at", { ascending: false }),
    admin
      .from("catalog_items")
      .select("id, sku, name")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("active", true)
      .order("name", { ascending: true }),
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const fornecedores: Fornecedor[] = (fornRes.data ?? []).map((f) => ({
    id: f.id,
    nome: f.name,
    contato: f.contact_email,
    cnpj: f.cnpj,
    vinculado: !!f.user_id,
    ativo: f.active,
  }));

  const pedidos: PedidoCompra[] = (poRes.data ?? []).map((p) => {
    const fornRaw = p.suppliers as unknown;
    const forn = (Array.isArray(fornRaw) ? fornRaw[0] : fornRaw) as { name?: string } | null;
    return {
      id: p.id,
      codigo: p.code,
      status: p.status,
      total: Number(p.total),
      notas: p.notes,
      criadoEm: p.created_at,
      fornecedor: forn?.name ?? "—",
      itens: (p.purchase_order_items ?? []).map((i) => ({
        id: i.id,
        sku: i.sku_snapshot,
        nome: i.name_snapshot,
        quantidade: i.quantity,
        custo: Number(i.unit_cost),
        total: Number(i.line_total),
      })),
    };
  });

  const catalogo: ItemCatalogo[] = (itensRes.data ?? []).map((i) => ({
    id: i.id,
    sku: i.sku,
    nome: i.name,
  }));

  return <ConsoleCompras fornecedores={fornecedores} pedidos={pedidos} catalogo={catalogo} />;
}
