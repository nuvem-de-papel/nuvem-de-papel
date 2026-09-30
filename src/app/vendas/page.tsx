import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import {
  ConsoleVendas,
  type NotaEmitida,
  type PedidoCompra,
  type PedidoVenda,
} from "@/components/vendas/ConsoleVendas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vendas — Nuvem de Papel",
  description: "Pedidos de venda e compra em detalhe, com emissão de nota fiscal.",
};

function comoObjeto(valor: unknown): Record<string, unknown> | null {
  if (Array.isArray(valor)) return (valor[0] as Record<string, unknown>) ?? null;
  return (valor as Record<string, unknown>) ?? null;
}

export default async function VendasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/vendas");

  const admin = createAdminClient();
  const [pedRes, itensRes, pcRes, nfeRes, meuRes] = await Promise.all([
    admin
      .from("orders")
      .select("id, status, channel, total_amount, created_at, customers(id, name, email)")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("order_items")
      .select("order_id, sku, name, unit_price, quantity, total")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .limit(1000),
    admin
      .from("purchase_orders")
      .select(
        "id, code, status, total, created_at, suppliers(id, name), purchase_order_items(sku_snapshot, name_snapshot, quantity, unit_cost, line_total)"
      )
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("nfe_emissoes")
      .select(
        "id, tipo, numero, serie, status, created_at, natureza_operacao, cfop, destinatario, frete, itens, totais, dados_adicionais, order:orders(id, customers(name)), purchase_order:purchase_orders(id, code, suppliers(name))"
      )
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("numero", { ascending: false })
      .limit(200),
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const itensPorPedido = new Map<string, PedidoVenda["itens"]>();
  for (const i of itensRes.data ?? []) {
    const lista = itensPorPedido.get(i.order_id) ?? [];
    lista.push({
      sku: i.sku,
      nome: i.name,
      qtd: i.quantity,
      unit: Number(i.unit_price),
      total: Number(i.total),
    });
    itensPorPedido.set(i.order_id, lista);
  }

  const vendas: PedidoVenda[] = (pedRes.data ?? []).map((o) => {
    const cliente = comoObjeto(o.customers);
    return {
      id: o.id,
      codigo: `PED-${o.id.slice(0, 8).toUpperCase()}`,
      cliente: (cliente?.name as string) ?? "—",
      email: (cliente?.email as string) ?? "",
      canal: o.channel,
      status: o.status,
      data: o.created_at,
      total: Number(o.total_amount),
      itens: itensPorPedido.get(o.id) ?? [],
    };
  });

  const compras: PedidoCompra[] = (pcRes.data ?? []).map((p) => {
    const forn = comoObjeto(p.suppliers);
    return {
      id: p.id,
      codigo: p.code,
      fornecedor: (forn?.name as string) ?? "—",
      status: p.status,
      data: p.created_at,
      total: Number(p.total),
      itens: (p.purchase_order_items ?? []).map((i) => ({
        sku: i.sku_snapshot,
        nome: i.name_snapshot,
        qtd: i.quantity,
        unit: Number(i.unit_cost),
        total: Number(i.line_total),
      })),
    };
  });

  const notas: NotaEmitida[] = (nfeRes.data ?? []).map((n) => {
    const pedido = comoObjeto(n.order);
    const compra = comoObjeto(n.purchase_order);
    const forn = comoObjeto(compra?.suppliers);
    return {
      id: n.id,
      tipo: n.tipo,
      numero: Number(n.numero),
      serie: n.serie,
      status: n.status,
      data: n.created_at,
      natureza: n.natureza_operacao,
      cfop: n.cfop,
      destinatario: (n.destinatario as NotaEmitida["destinatario"]) ?? {},
      frete: (n.frete as NotaEmitida["frete"]) ?? {},
      itens: (Array.isArray(n.itens) ? n.itens : []) as NotaEmitida["itens"],
      totais: (n.totais as NotaEmitida["totais"]) ?? { base: 0, icms: 0, pis: 0, cofins: 0, total: 0 },
      dadosAdicionais: n.dados_adicionais ?? null,
      vinculo: pedido
        ? `PED-${String(pedido.id).slice(0, 8).toUpperCase()}`
        : (compra?.code as string) ?? "—",
      vinculoNome: pedido
        ? ((comoObjeto(pedido.customers)?.name as string) ?? "—")
        : ((forn?.name as string) ?? "—"),
    };
  });

  return <ConsoleVendas vendas={vendas} compras={compras} notas={notas} />;
}
