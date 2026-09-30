import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

// Regras do Clube de assinantes (F7). A assinatura "ativa" e a fonte da
// verdade para o beneficio no checkout; ativacao/cancelamento vem das
// server actions e do webhook do Mercado Pago (topico preapproval).

export type AssinaturaAtiva = {
  id: string;
  plan_id: string;
  discount_pct: number;
};

// mock local = mesma regra do webhook (MP_MOCK so fora da Vercel)
export function clubeEmModoMock(): boolean {
  return process.env.MP_MOCK === "1" && process.env.VERCEL !== "1";
}

// beneficio vigente do usuario no checkout; null = nao e assinante
export async function beneficioClube(userId: string): Promise<AssinaturaAtiva | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("club_subscriptions")
    .select("id, plan_id, club_plans!inner(discount_pct)")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("profile_id", userId)
    .eq("status", "ativa")
    .maybeSingle();
  if (!data) return null;
  const plano = data.club_plans as unknown as { discount_pct: number | string } | { discount_pct: number | string }[];
  const pct = Number(Array.isArray(plano) ? plano[0]?.discount_pct ?? 0 : plano.discount_pct ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return { id: data.id as string, plan_id: data.plan_id as string, discount_pct: pct };
}
