import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { ContaMenu } from "@/components/conta/ContaMenu";
import { ContaFoto } from "@/components/conta/ContaFoto";

type Corp = { razao_social: string; status: string };

// Area do cliente da loja (19/11/2026): um shell so para a conta PF/PJ e para
// o Clube. Menu lateral + cabecalho "ola, sua conta". Sem sessao, as
// paginas filhas redirecionam para o login (o shell nao aparece).
export default async function ContaLayout({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <>{children}</>;

  const admin = createAdminClient();
  const [{ data: cliente }, { data: assinatura }, { data: vinculoCorp }] = await Promise.all([
    admin
      .from("customers")
      .select("name, documento, foto_url")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    admin
      .from("club_subscriptions")
      .select("status, club_plans (name)")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("profile_id", user.id)
      .in("status", ["ativa", "pendente"])
      .maybeSingle(),
    // 0059: login ligado a empresa = conta corporativa (vence o Clube).
    admin
      .from("corporate_buyers")
      .select("account:corporate_accounts!inner(razao_social, status)")
      .eq("auth_user_id", user.id)
      .eq("ativo", true)
      .maybeSingle(),
  ]);

  const nome = (cliente?.name ?? (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "").split(" ")[0];
  const pj = (cliente?.documento ?? "").replace(/\D/g, "").length === 14;
  const planoRaw = (assinatura as { club_plans?: { name: string } | { name: string }[] } | null)?.club_plans;
  const plano = Array.isArray(planoRaw) ? planoRaw[0]?.name : planoRaw?.name;
  const corpRaw = (vinculoCorp as { account?: Corp | Corp[] } | null)?.account;
  const corp = (Array.isArray(corpRaw) ? corpRaw[0] : corpRaw) ?? null;
  const rotuloCorp = corp
    ? corp.status === "ativa"
      ? `Corporativo · ${corp.razao_social}`
      : `Corporativo · ${corp.status}`
    : null;

  return (
    <div className="conta-shell">
      <header className="conta-topo">
        <ContaFoto fotoUrl={cliente?.foto_url ?? null} nome={nome || "cliente"} />
        <div className="conta-linha">
          <span className="conta-ola">Olá, {nome || "cliente"}</span>
          <span className="display conta-titulo">sua conta</span>
          <span className="conta-etiquetas">
            {rotuloCorp ? (
              <a href="/corporativo" className="conta-etiqueta-clube">{rotuloCorp}</a>
            ) : (
              <span>{pj ? "Conta revenda (PJ)" : "Conta pessoa física"}</span>
            )}
            {plano && <span className="conta-etiqueta-clube">Clube · {plano}</span>}
          </span>
        </div>
      </header>
      <div className="conta-grade">
        <ContaMenu clube={!!plano} />
        <div className="conta-conteudo">{children}</div>
      </div>
    </div>
  );
}
