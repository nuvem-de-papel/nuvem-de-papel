import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContaEmBreve, ContaSecao } from "@/components/conta/ContaSecao";

export const dynamic = "force-dynamic";

export default async function FavoritosPage() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) redirect("/login?next=/conta/favoritos");
  return (
    <ContaSecao titulo="Favoritos">
      <ContaEmBreve texto="Em breve você poderá guardar produtos favoritos pelo coração na página do produto." />
    </ContaSecao>
  );
}