import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsoleImportar } from "@/components/importar/ConsoleImportar";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configurações · Exportar/Importar Dados — Nuvem de Papel",
  description: "Exporta dados e importa arquivos de fornecedores (XML).",
};

export default async function ImportarPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/configuracoes/importar");

  const admin = createAdminClient();
  const meuRes = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  return <ConsoleImportar />;
}
