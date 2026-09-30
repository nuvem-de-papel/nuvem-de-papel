import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import {
  CadastrosTelaUnica,
  type FornecedorCad,
  type RevendaCad,
} from "@/components/conta/CadastrosTelaUnica";
import { PageHeader } from "@/components/admin/PageHeader";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configurações · Cadastro - Nuvem de Papel",
  description: "Cadastro de cliente, produto, fornecedor, revenda e dados da empresa.",
};

// A tela dentro de /configuracoes/cadastro é escolhida por ?tela=
// (sub-itens do menu lateral: cliente, produto, empresa, fornecedor, revenda).
export default async function CadastroPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/configuracoes/cadastro");

  const admin = createAdminClient();
  const [fornRes, revRes, meuRes] = await Promise.all([
    admin
      .from("suppliers")
      .select("id, name, contact_email, cnpj, active")
      .order("name", { ascending: true }),
    admin
      .from("profiles")
      .select("id, email, full_name, status, created_at")
      .eq("role", "revenda")
      .order("created_at", { ascending: false }),
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const fornecedoresReais: FornecedorCad[] = (fornRes.data ?? []).map((f) => ({
    id: f.id,
    nome: f.name,
    contato: f.contact_email,
    cnpj: f.cnpj,
    ativo: f.active,
  }));

  const revendas: RevendaCad[] = (revRes.data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    status: r.status,
    created_at: r.created_at,
  }));

  return (
    <>
      <PageHeader
        titulo="Cadastros"
        subtitulo="Clientes, produtos, fornecedores, revendas e dados da empresa emitente - tudo em um lugar só."
        voltarPara="/crm"
      />
      <CadastrosTelaUnica fornecedoresReais={fornecedoresReais} revendas={revendas} />
    </>
  );
}
