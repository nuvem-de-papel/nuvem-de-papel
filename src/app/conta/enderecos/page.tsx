import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContaSecao } from "@/components/conta/ContaSecao";
import { EnderecosEditor } from "@/components/conta/EnderecosEditor";

export const dynamic = "force-dynamic";

export default async function EnderecosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/conta/enderecos");

  const { data } = await supabase
    .from("addresses")
    .select("id, recipient_name, cep, logradouro, numero, complemento, bairro, cidade, uf")
    .order("created_at", { ascending: false });

  return (
    <ContaSecao titulo="Endereços">
      <EnderecosEditor enderecos={(data ?? []).map((e) => ({ ...e, complemento: e.complemento ?? "" }))} />
    </ContaSecao>
  );
}
