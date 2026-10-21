import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import {
  ConsoleVendaManual,
  type ClienteLista,
  type ItemLista,
} from "@/components/vendas/ConsoleVendaManual";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nova venda — Nuvem de Papel",
  description: "Venda de telefone/balcão: PF/PJ, todas as formas de pagamento, entrega ou retirada.",
};

export default async function NovaVendaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/vendas/nova");

  const admin = createAdminClient();
  const [itensRes, clientesRes, meuRes] = await Promise.all([
    admin
      .from("catalog_items")
      .select(
        "id, sku, name, item_stock(stock_available), item_prices(channel, price, min_quantity, valid_from, valid_until)"
      )
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("active", true)
      .order("name", { ascending: true }),
    admin
      .from("customers")
      .select("id, name, documento, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("ativo", true)
      .order("name", { ascending: true })
      .limit(1000),
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const agoraMs = Date.now();
  const itens: ItemLista[] = (itensRes.data ?? [])
    .map((r) => {
      const estRaw = r.item_stock as unknown;
      const est = (Array.isArray(estRaw) ? estRaw[0] : estRaw) as { stock_available: number } | null;
      const precos = (r.item_prices ?? []) as {
        channel: string;
        price: number | string;
        min_quantity: number;
        valid_from: string | null;
        valid_until: string | null;
      }[];
      // mesma regra do PDV (pdv/page.tsx:152-160): base vigente por canal
      const vigente = (p: (typeof precos)[number]) => {
        const vf = p.valid_from ? Date.parse(p.valid_from) : 0;
        const vt = p.valid_until ? Date.parse(p.valid_until) : Number.POSITIVE_INFINITY;
        return vf <= agoraMs && vt > agoraMs;
      };
      const base = (canal: string) =>
        precos
          .filter((p) => p.channel === canal && vigente(p))
          .sort((a, b) => a.min_quantity - b.min_quantity)[0] ?? null;
      const varejo = base("varejo");
      const atacado = base("atacado");
      const pVarejo = varejo ? Number(varejo.price) : null;
      const pAtacado = atacado ? Number(atacado.price) : pVarejo;
      if (pVarejo === null && pAtacado === null) return null;
      return {
        id: r.id,
        sku: r.sku,
        name: r.name,
        precoVarejo: pVarejo ?? pAtacado!,
        precoAtacado: pAtacado,
        estoque: est ? Number(est.stock_available) : null,
      };
    })
    .filter((i): i is ItemLista => i !== null);

  const clientes: ClienteLista[] = (clientesRes.data ?? []).map((c) => ({
    id: c.id,
    nome: c.name,
    documento: c.documento ?? null,
    telefone: c.telefone ?? null,
    cep: c.cep ?? null,
    logradouro: c.logradouro ?? null,
    numero: c.numero ?? null,
    complemento: c.complemento ?? null,
    bairro: c.bairro ?? null,
    cidade: c.cidade ?? null,
    uf: c.uf ?? null,
  }));

  return <ConsoleVendaManual itens={itens} clientes={clientes} />;
}
