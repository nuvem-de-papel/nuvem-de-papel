import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsolePlanosClube } from "@/components/clube/ConsolePlanosClube";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configurações - Clube - Nuvem de Papel",
  description: "Planos mensais do Clube de assinantes (preço, desconto e benefícios).",
};

export default async function ClubeConfigPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/configuracoes/clube");

  const admin = createAdminClient();
  const [planosRes, meuRes] = await Promise.all([
    admin
      .from("club_plans")
      .select("id, code, name, description, price_monthly, discount_pct, free_shipping, gift, active, sort")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("sort"),
    admin
      .from("profiles")
      .select("id, role, status")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  return <ConsolePlanosClube planos={planosRes.data ?? []} />;
}
