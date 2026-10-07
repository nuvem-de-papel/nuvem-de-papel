import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsoleMarketplaces } from "@/components/marketplaces/ConsoleMarketplaces";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configurações - Marketplaces - Nuvem de Papel",
  description:
    "Integração com marketplaces: canais, contas, anúncios e fila de sincronização (M1: kernel).",
};

export type CanalTela = {
  id: string;
  slug: string;
  name: string;
  segmento: "generalista" | "nicho";
  api_docs: string | null;
  ativo: boolean;
};

export type ContaTela = {
  id: string;
  channel_id: string;
  label: string;
  status: string;
  last_ping_at: string | null;
  last_error: string | null;
  canal: { slug: string; name: string } | null;
};

export type JobTela = {
  id: string;
  tipo: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  last_error: string | null;
  result: string | null;
  created_at: string;
  canal: { slug: string } | null;
  conta: { label: string } | null;
};

export type ListingTela = {
  id: string;
  status: string;
  last_error: string | null;
  item: { sku: string; name: string } | null;
  conta: { label: string } | null;
};

export type ProdutoTela = { id: string; sku: string; name: string };

export default async function MarketplacesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "ativo" || !PAPEIS_GESTAO.includes(profile.role)) redirect("/crm");

  const admin = createAdminClient();
  const t = NUVEM_DE_PAPEL_TENANT_ID;

  const [
    { data: canais },
    { data: contas },
    { data: jobs },
    { data: produtos },
    { data: listings },
    { count: totalContas },
    { count: pendentes },
    { count: falhas },
  ] = await Promise.all([
    admin
      .from("marketplace_channels")
      .select("id, slug, name, segmento, api_docs, ativo")
      .order("segmento")
      .order("name"),
    admin
      .from("marketplace_accounts")
      .select(
        "id, channel_id, label, status, last_ping_at, last_error, canal:marketplace_channels!inner(slug, name)"
      )
      .eq("tenant_id", t)
      .order("label"),
    admin
      .from("marketplace_jobs")
      .select(
        "id, tipo, status, attempts, max_attempts, next_run_at, last_error, result, created_at, canal:marketplace_channels!inner(slug), conta:marketplace_accounts(label)"
      )
      .eq("tenant_id", t)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("catalog_items")
      .select("id, sku, name")
      .eq("tenant_id", t)
      .eq("active", true)
      .order("sku")
      .limit(200),
    admin
      .from("marketplace_listings")
      .select(
        "id, status, last_error, item:catalog_items!inner(sku, name), conta:marketplace_accounts!inner(label)"
      )
      .eq("tenant_id", t)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("marketplace_accounts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", t),
    admin
      .from("marketplace_jobs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", t)
      .eq("status", "pendente"),
    admin
      .from("marketplace_jobs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", t)
      .eq("status", "falhou"),
  ]);

  return (
    <ConsoleMarketplaces
      canais={(canais ?? []) as CanalTela[]}
      contas={(contas ?? []) as unknown as ContaTela[]}
      jobs={(jobs ?? []) as unknown as JobTela[]}
      produtos={(produtos ?? []) as ProdutoTela[]}
      listings={(listings ?? []) as unknown as ListingTela[]}
      totalContas={totalContas ?? 0}
      pendentes={pendentes ?? 0}
      falhas={falhas ?? 0}
    />
  );
}
