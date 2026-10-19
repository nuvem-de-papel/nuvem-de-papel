import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import {
  ConsoleRecuperacao,
  type RecuperacaoLinha,
  type RegraRecuperacao,
} from "@/components/vendas/ConsoleRecuperacao";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recuperação de carrinho — Nuvem de Papel",
  description: "Régua de lembretes para pedidos que ficaram sem pagamento.",
};

const TENANT = "00000000-0000-0000-0000-000000000001";
const DIA_MS = 86400000;

export default async function RecuperacaoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/vendas/recuperacao");

  const admin = createAdminClient();
  const agora = Date.now();

  const [meuRes, regrasRes, pedidosRes] = await Promise.all([
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    admin
      .from("cart_recovery_rules")
      .select("id, dias, ativo, texto")
      .eq("tenant_id", TENANT)
      .order("dias", { ascending: true }),
    admin
      .from("orders")
      .select("id, created_at, total_amount, mp_init_point, customer_id")
      .eq("tenant_id", TENANT)
      .eq("status", "aguardando_pagamento")
      .order("created_at", { ascending: true })
      .limit(300),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const regras: RegraRecuperacao[] = (regrasRes.data ?? []).map((r) => ({
    id: r.id,
    dias: r.dias,
    ativo: r.ativo,
    texto: r.texto,
  }));

  const pedidos = pedidosRes.data ?? [];

  // clientes (join manual customer_id -> customers)
  const idsClientes = [...new Set(pedidos.map((p) => p.customer_id).filter(Boolean) as string[])];
  const clientes = new Map<string, { name: string; email: string | null }>();
  if (idsClientes.length > 0) {
    const { data } = await admin
      .from("customers")
      .select("id, name, email")
      .in("id", idsClientes);
    for (const c of data ?? []) clientes.set(c.id, { name: c.name, email: c.email });
  }

  // ultimo toque por pedido
  const idsPedidos = pedidos.map((p) => p.id);
  const ultimoToque = new Map<string, { dias: number | null; sucesso: boolean }>();
  if (idsPedidos.length > 0) {
    const { data: toques } = await admin
      .from("cart_recovery_sends")
      .select("order_id, enviado_em, sucesso, regra:cart_recovery_rules(dias)")
      .in("order_id", idsPedidos)
      .order("enviado_em", { ascending: false });
    for (const t of toques ?? []) {
      if (!ultimoToque.has(t.order_id)) {
        ultimoToque.set(t.order_id, {
          dias: (t.regra as unknown as { dias: number } | null)?.dias ?? null,
          sucesso: t.sucesso,
        });
      }
    }
  }

  const linhas: RecuperacaoLinha[] = pedidos.map((p) => {
    const cli = p.customer_id ? clientes.get(p.customer_id) : undefined;
    return {
      id: p.id,
      codigo: "#" + p.id.slice(0, 8).toUpperCase(),
      cliente: cli?.name ?? "—",
      email: cli?.email ?? null,
      valor: Number(p.total_amount),
      criadoEm: p.created_at,
      diasParado: Math.floor((agora - new Date(p.created_at).getTime()) / DIA_MS),
      temLink: Boolean(p.mp_init_point),
      ultimaEtapa: ultimoToque.get(p.id)?.dias ?? null,
      ultimoSucesso: ultimoToque.get(p.id)?.sucesso ?? null,
    };
  });

  return <ConsoleRecuperacao linhas={linhas} regras={regras} />;
}
