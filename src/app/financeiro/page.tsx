import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import {
  ConsoleFinanceiro,
  type ParcelaPendente,
  type ResumoFinanceiro,
  type FaturamentoCanal,
} from "@/components/financeiro/ConsoleFinanceiro";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Financeiro — Nuvem de Papel",
  description: "Contas a receber, liquidações e faturamento por canal.",
};

export default async function FinanceiroPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/financeiro");

  const admin = createAdminClient();
  const [meuRes, parcelasRes, liqRes, pedidosRes, custosRes] = await Promise.all([
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    admin
      .from("financial_installments")
      .select(
        "id, number, status, due_date, principal_amount, paid_amount, financial_titles(code, status, customer_id)"
      )
      .order("due_date", { ascending: true })
      .limit(200),
    admin
      .from("financial_settlements")
      .select("amount, created_at")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    admin
      .from("orders")
      .select("channel, total_amount, created_at")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      .neq("status", "cancelado")
      .limit(2000),
    admin
      .from("order_items")
      .select("total, quantity, catalog_items(item_commercial_data(cost_price))")
      .limit(2000),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  // customer_id de financial_titles não tem FK (design imutável) — busca nomes à parte.
  const idsClientes = [
    ...new Set(
      (parcelasRes.data ?? [])
        .map((p) => {
          const tRaw = p.financial_titles as unknown;
          const t = (Array.isArray(tRaw) ? tRaw[0] : tRaw) as { customer_id?: string | null } | null;
          return t?.customer_id ?? null;
        })
        .filter((v): v is string => !!v)
    ),
  ];
  const clientesRes = idsClientes.length
    ? await admin.from("customers").select("id, name").in("id", idsClientes)
    : null;
  const nomesClientes = new Map((clientesRes?.data ?? []).map((c) => [c.id, c.name]));

  const parcelas: ParcelaPendente[] = (parcelasRes.data ?? []).map((p) => {
    const tRaw = p.financial_titles as unknown;
    const t = (Array.isArray(tRaw) ? tRaw[0] : tRaw) as
      | { code: string; status: string; customer_id: string | null }
      | null;
    const principal = Number(p.principal_amount);
    const pago = Number(p.paid_amount);
    return {
      id: p.id,
      numero: p.number,
      status: p.status,
      vencimento: p.due_date,
      valor: principal,
      saldo: principal - pago,
      titulo: t?.code ?? "—",
      tituloStatus: t?.status ?? "aberto",
      cliente: (t?.customer_id ? nomesClientes.get(t.customer_id) : null) ?? "Cliente Balcão",
    };
  });

  const emAberto = parcelas.filter((p) => p.status !== "liquidado" && p.status !== "cancelado");
  const hoje = new Date().toISOString().slice(0, 10);
  const receber = emAberto.reduce((a, p) => a + p.saldo, 0);
  const vencidos = emAberto
    .filter((p) => p.vencimento < hoje)
    .reduce((a, p) => a + p.saldo, 0);
  const liquidadoMes = (liqRes.data ?? []).reduce((a, r) => a + Number(r.amount), 0);

  const faixas = [
    { faixa: "1-30 dias", valor: 0 },
    { faixa: "31-60 dias", valor: 0 },
    { faixa: "60+ dias", valor: 0 },
  ];
  for (const p of emAberto.filter((p) => p.vencimento < hoje)) {
    const dias = Math.floor(
      (Date.now() - new Date(p.vencimento + "T12:00:00").getTime()) / 86400000
    );
    if (dias <= 30) faixas[0].valor += p.saldo;
    else if (dias <= 60) faixas[1].valor += p.saldo;
    else faixas[2].valor += p.saldo;
  }

  const porCanal = new Map<string, { total: number; pedidos: number }>();
  let faturamento = 0;
  for (const o of pedidosRes.data ?? []) {
    faturamento += Number(o.total_amount);
    const atual = porCanal.get(o.channel) ?? { total: 0, pedidos: 0 };
    atual.total += Number(o.total_amount);
    atual.pedidos += 1;
    porCanal.set(o.channel, atual);
  }
  const faturamentoCanais: FaturamentoCanal[] = [...porCanal.entries()].map(([canal, v]) => ({
    canal,
    total: v.total,
    pedidos: v.pedidos,
  }));

  let custo = 0;
  let margemBase = 0;
  for (const it of custosRes.data ?? []) {
    const cRaw = (it as { catalog_items: unknown }).catalog_items;
    const c = (Array.isArray(cRaw) ? cRaw[0] : cRaw) as
      | { item_commercial_data: unknown }
      | null;
    const dRaw = c?.item_commercial_data;
    const d = (Array.isArray(dRaw) ? dRaw[0] : dRaw) as { cost_price: number | string } | null;
    if (d) {
      const un = Number(d.cost_price);
      custo += un * Number(it.quantity);
      margemBase += Number(it.total);
    }
  }

  const resumo: ResumoFinanceiro = {
    receber,
    vencidos,
    liquidadoMes,
    faturamento30d: faturamento,
    margem30d: margemBase - custo,
    faixasVencidas: faixas,
  };

  return (
    <ConsoleFinanceiro resumo={resumo} parcelas={emAberto} faturamento={faturamentoCanais} />
  );
}
