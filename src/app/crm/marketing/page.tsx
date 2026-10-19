import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import {
  ConsoleMarketing,
  type AvaliacaoLinha,
  type MarketingStats,
} from "@/components/marketing/ConsoleMarketing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marketing — Nuvem de Papel",
  description: "Reativação de clientes e coleta de avaliações no Google.",
};

const TENANT = "00000000-0000-0000-0000-000000000001";

export default async function MarketingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/crm/marketing");

  const admin = createAdminClient();
  const meuRes = await admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) redirect("/crm");

  const [cfgRes, revRes] = await Promise.all([
    admin.from("marketing_config").select("*").eq("tenant_id", TENANT).maybeSingle(),
    admin
      .from("review_requests")
      .select("id, order_id, enviado_em, link_clicado_em, reclamacao, resolvida, customer_id, customers(name, email)")
      .eq("tenant_id", TENANT)
      .order("enviado_em", { ascending: false })
      .limit(200),
  ]);

  const reviews = revRes.data ?? [];
  const stats: MarketingStats = {
    enviados: reviews.length,
    cliques: reviews.filter((r) => r.link_clicado_em).length,
    reclamacoes: reviews.filter((r) => r.reclamacao).length,
    resolvidas: reviews.filter((r) => r.reclamacao && r.resolvida).length,
    linkGoogle: Boolean(String(cfgRes.data?.google_review_link ?? "").trim()),
  };

  const linhas: AvaliacaoLinha[] = reviews.map((r) => {
    const cli = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    return {
      id: r.id,
      codigo: "#" + r.order_id.slice(0, 8).toUpperCase(),
      cliente: (cli as { name?: string } | null)?.name ?? "—",
      email: (cli as { email?: string } | null)?.email ?? null,
      enviadoEm: r.enviado_em,
      clicou: Boolean(r.link_clicado_em),
      reclamacao: r.reclamacao,
      resolvida: r.resolvida,
    };
  });

  return <ConsoleMarketing linhas={linhas} stats={stats} />;
}
