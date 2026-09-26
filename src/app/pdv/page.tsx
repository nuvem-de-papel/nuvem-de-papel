import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_OPERACIONAIS } from "@/lib/rbac";
import { ConsolePdv, type ItemPdv, type SessaoCaixa, type MovimentoCaixa } from "@/components/pdv/ConsolePdv";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PDV — Nuvem de Papel",
  description: "Frente de caixa: abertura, vendas, suprimento/sangria e fechamento.",
};

export default async function PdvPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/pdv");

  const admin = createAdminClient();
  const [sessaoRes, itensRes, movRes, meuRes] = await Promise.all([
    admin
      .from("caixa_sessions")
      .select("id, opening_amount, opened_at, operator_id")
      .eq("status", "aberto")
      .maybeSingle(),
    admin
      .from("catalog_items")
      .select(
        "id, sku, name, item_stock(stock_available), item_prices(channel, price)"
      )
      .eq("active", true)
      .order("name", { ascending: true }),
    admin
      .from("caixa_movements")
      .select("id, movement_type, direction, amount, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(12),
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_OPERACIONAIS.includes(meu.role)) {
    redirect("/crm");
  }

  const sessao: SessaoCaixa | null = sessaoRes.data
    ? {
        id: sessaoRes.data.id,
        abertura: Number(sessaoRes.data.opening_amount),
        aberta_em: sessaoRes.data.opened_at,
      }
    : null;

  const itens: ItemPdv[] = (itensRes.data ?? [])
    .map((r) => {
      const estRaw = r.item_stock as unknown;
      const est = (Array.isArray(estRaw) ? estRaw[0] : estRaw) as { stock_available: number } | null;
      const precos = (r.item_prices ?? []) as { channel: string; price: number | string }[];
      const varejo = precos.find((p) => p.channel === "varejo");
      const atacado = precos.find((p) => p.channel === "atacado");
      const pVarejo = varejo ? Number(varejo.price) : null;
      const pAtacado = atacado ? Number(atacado.price) : pVarejo;
      if (pVarejo === null && pAtacado === null) return null;
      return {
        id: r.id,
        sku: r.sku,
        name: r.name,
        precoVarejo: pVarejo ?? pAtacado!,
        precoAtacado: pAtacado,
        estoque: est ? Number(est.stock_available) : null,
      };
    })
    .filter((i): i is ItemPdv => i !== null);

  const movimentos: MovimentoCaixa[] = (movRes.data ?? []).map((m) => ({
    id: m.id,
    tipo: m.movement_type,
    direcao: m.direction,
    valor: Number(m.amount),
    motivo: m.reason ?? null,
    criado_em: m.created_at,
  }));

  return <ConsolePdv sessao={sessao} itens={itens} movimentos={movimentos} />;
}
