import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsolePrecos } from "@/components/precos/ConsolePrecos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configurações - Tabela de preços - Nuvem de Papel",
  description:
    "Preço por canal (varejo/atacado), por faixa de quantidade e com vigência.",
};

type LinhaPreco = {
  channel: string;
  min_quantity: number;
  price: number | string;
  valid_from: string | null;
  valid_until: string | null;
};

type Bruto = {
  id: string;
  sku: string;
  name: string;
  active: boolean;
  item_prices: LinhaPreco[] | null;
};

export default async function TabelaPrecosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/configuracoes/precos");

  const admin = createAdminClient();
  const [itensRes, meuRes] = await Promise.all([
    admin
      .from("catalog_items")
      .select(
        "id, sku, name, active, item_prices(channel, min_quantity, price, valid_from, valid_until)"
      )
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("sku", { ascending: true })
      .limit(400),
    admin
      .from("profiles")
      .select("id, role, status")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) redirect("/crm");

  // o embed de item_prices volta como a propria chave da tabela; o tipo do
  // Supabase nao resolve coluna embutida de item que nao e fk direta, por isso
  // o cast e a normalizacao explicitas (mesmo padrao de /vendas).
  const bruto = (itensRes.data ?? []) as unknown as Bruto[];
  const produtos = bruto.map((c) => ({
    id: c.id,
    sku: c.sku,
    name: c.name,
    active: c.active,
    precos: c.item_prices ?? [],
  }));

  return (
    <ConsolePrecos
      produtos={produtos}
      erro={itensRes.error ? `Falha ao ler o catalogo: ${itensRes.error.message}` : null}
    />
  );
}
