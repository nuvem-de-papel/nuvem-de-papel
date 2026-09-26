import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsoleUsuarios } from "@/components/usuarios/ConsoleUsuarios";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configurações · Usuários — Nuvem de Papel",
  description: "Gestão de usuários e papéis da equipe (RBAC).",
};

export default async function UsuariosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/configuracoes/usuarios");

  const admin = createAdminClient();
  const [usuariosRes, meuRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, full_name, role, status, created_at")
      .order("created_at", { ascending: true }),
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

  return (
    <ConsoleUsuarios
      usuarios={usuariosRes.data ?? []}
      euId={user.id}
      meuPapel={meu.role}
    />
  );
}
