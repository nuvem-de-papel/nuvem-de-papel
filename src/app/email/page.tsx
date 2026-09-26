import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CaixaEmail, type Mensagem } from "@/components/email/CaixaEmail";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "E-mail - Nuvem de Papel",
  description: "Caixa de e-mail da empresa: entrada, enviados e composição.",
};

export default async function EmailPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/email");

  const admin = createAdminClient();
  const [meuRes, entradaRes, enviadosRes] = await Promise.all([
    admin
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .from("email_messages")
      .select("*")
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("email_messages")
      .select("*")
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  return (
    <CaixaEmail
      entrada={(entradaRes.data ?? []) as Mensagem[]}
      enviados={(enviadosRes.data ?? []) as Mensagem[]}
    />
  );
}
