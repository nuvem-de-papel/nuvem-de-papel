import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import {
  ConsoleDespesas,
  type CentroCusto,
  type ContaDespesa,
  type DespesaRow,
} from "@/components/financeiro/ConsoleDespesas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Despesas — Nuvem de Papel",
  description: "Lançamento de despesas e rateio por centro de custo.",
};

export default async function DespesasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/financeiro/despesas");

  const admin = createAdminClient();
  const [meuRes, contasRes, centrosRes, despesasRes] = await Promise.all([
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    admin
      .from("account_catalog")
      .select("code, name, dre_grupo")
      .eq("classe", 6)
      .eq("aceita_lancamento", true)
      .order("code"),
    admin.from("cost_centers").select("id, code, name").eq("ativo", true).order("code"),
    admin
      .from("expenses")
      .select("id, competencia, description, account_code, cost_center_id, amount, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const contas: ContaDespesa[] = (contasRes.data ?? []).map((c) => ({
    code: c.code,
    name: c.name,
    grupo: c.dre_grupo ?? "",
  }));
  const centros: CentroCusto[] = (centrosRes.data ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
  }));
  const despesas: DespesaRow[] = (despesasRes.data ?? []).map((d) => ({
    id: d.id,
    competencia: String(d.competencia).slice(0, 10),
    descricao: d.description,
    conta: d.account_code,
    centroId: d.cost_center_id,
    valor: Number(d.amount),
    pagoEm: d.paid_at ? String(d.paid_at).slice(0, 10) : null,
  }));

  return <ConsoleDespesas contas={contas} centros={centros} despesas={despesas} />;
}
