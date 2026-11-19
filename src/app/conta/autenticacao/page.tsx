import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContaEmBreve, ContaSecao } from "@/components/conta/ContaSecao";

export const dynamic = "force-dynamic";

export default async function AutenticacaoPage() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) redirect("/login?next=/conta/autenticacao");
  return (
    <ContaSecao titulo="Autenticação">
      <ContaEmBreve texto="Seu acesso é feito com e-mail e senha. Esqueceu a senha? Use &quot;Esqueci minha senha&quot; na tela de entrar." />
    </ContaSecao>
  );
}