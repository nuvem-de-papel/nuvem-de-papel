import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { ConsoleCarta, type CartaLinha } from "@/components/crm/ConsoleCarta";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Carta da semana — Nuvem de Papel",
  description: "Resumo com IA: o que melhorou, o que piorou e o que fazer, gerado sobre os números do seu painel.",
};

const TENANT = "00000000-0000-0000-0000-000000000001";

type TextoCarta = {
  resumo: string;
  melhorou: string[];
  piorou: string[];
  atencao: string[];
  faltam_dados: string[];
  acoes: { texto: string; prazo: string }[];
};

export default async function CartaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/crm/carta");

  const admin = createAdminClient();
  const meu = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  const perfil = meu.data;
  if (!perfil || perfil.status !== "ativo" || !PAPEIS_GESTAO.includes(perfil.role)) redirect("/crm");

  const { data } = await admin
    .from("insight_cartas")
    .select("id, tipo, periodo_inicio, periodo_fim, texto, status, created_at")
    .eq("tenant_id", TENANT)
    .order("created_at", { ascending: false })
    .limit(30);

  const linhas: CartaLinha[] = (data ?? []).map((c) => ({
    id: c.id,
    tipo: c.tipo,
    periodoInicio: String(c.periodo_inicio).slice(0, 10),
    periodoFim: String(c.periodo_fim).slice(0, 10),
    status: c.status,
    criadaEm: c.created_at,
    texto: c.texto as TextoCarta,
  }));

  return <ConsoleCarta cartas={linhas} />;
}
