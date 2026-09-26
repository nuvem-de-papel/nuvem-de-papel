import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuditLista, type Linha } from "@/components/auditoria/AuditLista";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configurações · Auditoria — Nuvem de Papel",
  description: "Trilha de auditoria: quem fez o quê e quando.",
};

export default async function AuditoriaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/configuracoes/auditoria");

  const admin = createAdminClient();
  const [linhasRes, meuRes] = await Promise.all([
    admin
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const linhas = (linhasRes.data ?? []) as Linha[];
  const atores = [
    ...new Set(linhas.map((l) => l.actor_user_id).filter((id): id is string => id !== null)),
  ];

  let emails = new Map<string, string>();
  if (atores.length > 0) {
    const { data } = await admin.from("profiles").select("id, email").in("id", atores);
    emails = new Map((data ?? []).map((p) => [String(p.id), String(p.email)]));
  }

  const comAtores: Linha[] = linhas.map((l) => ({
    ...l,
    actor_email: l.actor_user_id ? (emails.get(l.actor_user_id) ?? null) : null,
  }));

  return <AuditLista linhas={comAtores} />;
}
