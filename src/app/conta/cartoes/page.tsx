import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContaEmBreve, ContaSecao } from "@/components/conta/ContaSecao";

export const dynamic = "force-dynamic";

export default async function CartoesPage() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) redirect("/login?next=/conta/cartoes");
  return (
    <ContaSecao titulo="Cartões">
      <ContaEmBreve texto="A loja não guarda dados de cartão: o pagamento é feito no ambiente seguro do Mercado Pago a cada compra." />
    </ContaSecao>
  );
}