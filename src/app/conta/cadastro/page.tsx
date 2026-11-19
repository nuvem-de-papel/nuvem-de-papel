import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { ContaSecao } from "@/components/conta/ContaSecao";

export const dynamic = "force-dynamic";

function telefone(v: string | null) {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || "—";
}

export default async function MeuCadastroPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/conta/cadastro");

  const { data: c } = await createAdminClient()
    .from("customers")
    .select("name, email, documento, telefone, whatsapp, nascimento, created_at")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const linhas: [string, string][] = [
    ["Nome", c?.name ?? "—"],
    ["E-mail", c?.email ?? user.email ?? "—"],
    ["CPF/CNPJ", c?.documento || "—"],
    ["Telefone", telefone(c?.telefone ?? null)],
    ["WhatsApp", telefone(c?.whatsapp ?? null)],
    ["Nascimento", c?.nascimento ? new Date(`${c.nascimento}T12:00:00`).toLocaleDateString("pt-BR") : "—"],
    ["Cliente desde", c?.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—"],
  ];

  return (
    <ContaSecao titulo="Meu cadastro">
      <dl className="conta-dados">
        {linhas.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="conta-vazio">Para corrigir algum dado, fale com a loja pelo WhatsApp.</p>
    </ContaSecao>
  );
}
