import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContaSecao } from "@/components/conta/ContaSecao";

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
  const enderecos = data ?? [];

  return (
    <ContaSecao titulo="Endereços">
      {enderecos.length === 0 ? (
        <p className="conta-vazio">Nenhum endereço salvo. O endereço da sua próxima compra fica guardado aqui.</p>
      ) : (
        <ul className="conta-lista">
          {enderecos.map((e) => (
            <li key={e.id}>
              <strong>{e.recipient_name}</strong>
              <span>
                {e.logradouro}, {e.numero}
                {e.complemento ? ` - ${e.complemento}` : ""} · {e.bairro}
              </span>
              <span>
                {e.cidade}/{e.uf} · CEP {e.cep}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ContaSecao>
  );
}
