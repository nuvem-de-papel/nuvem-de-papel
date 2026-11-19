import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContaEmBreve, ContaSecao } from "@/components/conta/ContaSecao";

export const dynamic = "force-dynamic";

export default async function PedidosAntigosPage() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) redirect("/login?next=/conta/pedidos-antigos");
  return (
    <ContaSecao titulo="Pedidos antigos">
      <ContaEmBreve texto="Pedidos com mais de 30 dias aparecem aqui. Os pedidos recentes ficam em Pedidos." />
    </ContaSecao>
  );
}