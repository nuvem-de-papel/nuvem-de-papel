import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenantId } from "@/lib/tenant";

export type ClienteRecente = {
  id: string;
  name: string;
  tier: string;
  pedidos: number;
  totalGasto: number;
};

export type PedidoStatusResumo = {
  status: string;
  count: number;
};

export type CampanhaAtiva = {
  id: string;
  name: string;
  status: string;
  info: string | null;
};

// Indicadores ao vivo da home do painel (entrega 8 — console de balcao).
export type VendasHoje = {
  pedidos: number;
  total: number;
  pedidosOntem: number;
  totalOntem: number;
};

export type FaixaResumo = {
  qtd: number;
  valor: number;
};

export type CaixaResumo = {
  aberto: boolean;
  desde: string | null;
};

export type EntregasResumo = {
  abertas: number;
  prazoHoje: number;
};

export type EstoqueResumo = {
  semSaldo: number;
  baixo: number;
};

export type CrmSummary = {
  receitaMes: number;
  pedidosMes: number;
  novosClientesMes: number;
  ticketMedio: number;
  clientesRecentes: ClienteRecente[];
  pedidosPorStatus: PedidoStatusResumo[];
  campanhasAtivas: CampanhaAtiva[];
  vendasHoje: VendasHoje;
  receber7d: FaixaResumo;
  vencidos: FaixaResumo;
  caixa: CaixaResumo;
  entregas: EntregasResumo;
  estoque: EstoqueResumo;
  skusAtivos: number;
  clientesAtivos: number;
  novosClientesSemana: number;
};

type OrderRow = {
  id: string;
  status: string;
  total_amount: number | string;
  created_at: string;
  customer_id: string;
  customers: { name: string; tier: string } | { name: string; tier: string }[] | null;
};

type CustomerRow = {
  id: string;
  name: string;
  tier: string;
  created_at: string;
};

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  info: string | null;
};

type ParcelaRow = {
  status: string;
  due_date: string;
  principal_amount: number | string;
  paid_amount: number | string;
};

type CaixaRow = {
  status: string;
  opened_at: string;
};

type EntregaRow = {
  prazo: string | null;
};

type EstoqueRow = {
  item_stock: { stock_available: number | string } | { stock_available: number | string }[] | null;
  item_commercial_data: { min_stock: number | string } | { min_stock: number | string }[] | null;
};

const num = (v: number | string) => Number(v);

// Coluna `date` vem "YYYY-MM-DD": parse ao meio-dio evita o shift de fuso
// que subtrai um dia (mesma armadilha do vencimento da regua de cobranca).
function dataCampo(txt: string): Date {
  return new Date(`${txt}T12:00:00`);
}

export async function getCrmSummary(): Promise<CrmSummary> {
  const tenantId = getCurrentTenantId();
  const supabase = createAdminClient();

  const hoje00 = new Date();
  hoje00.setHours(0, 0, 0, 0);
  const ontem00 = new Date(hoje00);
  ontem00.setDate(ontem00.getDate() - 1);
  const semana00 = new Date(hoje00);
  semana00.setDate(semana00.getDate() - 7);
  const fimHoje = new Date(hoje00);
  fimHoje.setDate(fimHoje.getDate() + 1);
  fimHoje.setMilliseconds(-1);
  const seteDias = new Date(hoje00);
  seteDias.setDate(seteDias.getDate() + 7);
  seteDias.setHours(23, 59, 59, 999);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [ordersRes, customersRes, campaignsRes, parcelasRes, caixaRes, entregasRes, estoqueRes, skusRes] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id, status, total_amount, created_at, customer_id, customers(name, tier)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .returns<OrderRow[]>(),
      supabase
        .from("customers")
        .select("id, name, tier, created_at")
        .eq("tenant_id", tenantId)
        .returns<CustomerRow[]>(),
      supabase
        .from("campaigns")
        .select("id, name, status, info")
        .eq("tenant_id", tenantId)
        .in("status", ["ativa", "agendada"])
        .order("created_at", { ascending: false })
        .returns<CampaignRow[]>(),
      // parcelas a receber em aberto (vencidas + as dos proximos 7 dias)
      supabase
        .from("financial_installments")
        .select("status, due_date, principal_amount, paid_amount, financial_titles!inner(direction)")
        .eq("tenant_id", tenantId)
        .eq("financial_titles.direction", "receivable")
        .in("status", ["aberto", "parcial", "vencido"])
        .order("due_date", { ascending: true })
        .limit(1000)
        .returns<ParcelaRow[]>(),
      // uma unica sessao aberta por tenant (indice caixa_sessions_one_open)
      supabase
        .from("caixa_sessions")
        .select("status, opened_at")
        .eq("tenant_id", tenantId)
        .eq("status", "aberto")
        .maybeSingle()
        .returns<CaixaRow | null>(),
      supabase
        .from("entregas")
        .select("status, prazo")
        .eq("tenant_id", tenantId)
        .in("status", ["aguardando", "separado", "em_transito"])
        .limit(1000)
        .returns<EntregaRow[]>(),
      // estoque: item_stock e item_commercial_data sao irmaos (ambos com PK
      // item_id em catalog_items) — nao existe FK entre eles, entao a query
      // parte do catalogo e embute os dois lados.
      supabase
        .from("catalog_items")
        .select("id, item_stock(stock_available), item_commercial_data(min_stock)")
        .eq("tenant_id", tenantId)
        .limit(5000)
        .returns<EstoqueRow[]>(),
      supabase
        .from("catalog_items")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ]);

  if (ordersRes.error) console.error("getCrmSummary orders:", ordersRes.error.message);
  if (customersRes.error) console.error("getCrmSummary customers:", customersRes.error.message);
  if (campaignsRes.error) console.error("getCrmSummary campaigns:", campaignsRes.error.message);
  if (parcelasRes.error) console.error("getCrmSummary parcelas:", parcelasRes.error.message);
  if (caixaRes.error) console.error("getCrmSummary caixa:", caixaRes.error.message);
  if (entregasRes.error) console.error("getCrmSummary entregas:", entregasRes.error.message);
  if (estoqueRes.error) console.error("getCrmSummary estoque:", estoqueRes.error.message);
  if (skusRes.error) console.error("getCrmSummary skus:", skusRes.error.message);

  const orders = ordersRes.data ?? [];
  const customers = customersRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];
  const parcelas = parcelasRes.data ?? [];
  const caixaAberta = caixaRes.data ?? null;
  const entregas = entregasRes.data ?? [];
  const estoque = estoqueRes.data ?? [];

  const ordersMes = orders.filter((o) => new Date(o.created_at) >= startOfMonth);
  // receita/ticket contam so pedido que virou dinheiro (nao cancelado, nao pendente)
  const receitaveis = ordersMes.filter(
    (o) => o.status !== "cancelado" && o.status !== "aguardando_pagamento"
  );
  const receitaMes = receitaveis.reduce((sum, o) => sum + num(o.total_amount), 0);
  const novosClientesMes = customers.filter((c) => new Date(c.created_at) >= startOfMonth).length;
  const ticketMedio = receitaveis.length > 0 ? receitaMes / receitaveis.length : 0;

  // vendas de hoje vs ontem (mesmo corte de faturamento: cancelado nao conta)
  const doPeriodo = (de: Date, ate: Date) =>
    orders.filter((o) => {
      const d = new Date(o.created_at);
      return d >= de && d < ate && o.status !== "cancelado";
    });
  const pedidosHoje = doPeriodo(hoje00, fimHoje);
  const pedidosOntem = doPeriodo(ontem00, hoje00);

  // parcelas: saldo em aberto > 0; vencida = status 'vencido' ou vencimento
  // anterior a hoje ainda em aberto/parcial (a regua pode nao ter rodado ainda)
  const emAberto = (p: ParcelaRow) => p.status === "aberto" || p.status === "parcial";
  const saldoDe = (p: ParcelaRow) => num(p.principal_amount) - num(p.paid_amount);
  const vencidas = parcelas.filter(
    (p) => saldoDe(p) > 0 && (p.status === "vencido" || (emAberto(p) && dataCampo(p.due_date) < hoje00))
  );
  const vencer7d = parcelas.filter((p) => {
    if (saldoDe(p) <= 0 || !emAberto(p)) return false;
    const v = dataCampo(p.due_date);
    return v >= hoje00 && v <= seteDias;
  });

  const entregasPrazoHoje = entregas.filter(
    (e) => e.prazo !== null && dataCampo(e.prazo) <= fimHoje
  ).length;

  // embed 1:1 pode chegar como objeto ou array (mesmo padrao do pdv/vendas)
  const primeiro = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const semSaldo = estoque.filter((r) => {
    const est = primeiro(r.item_stock);
    return est !== null && num(est.stock_available) === 0;
  }).length;
  const baixo = estoque.filter((r) => {
    const est = primeiro(r.item_stock);
    const com = primeiro(r.item_commercial_data);
    if (est === null) return false;
    const disp = num(est.stock_available);
    const min = com ? num(com.min_stock) : 0;
    return disp > 0 && min > 0 && disp <= min;
  }).length;

  const porCliente = new Map<string, ClienteRecente>();
  for (const o of orders) {
    const cust = Array.isArray(o.customers) ? o.customers[0] : o.customers;
    if (!cust) continue;
    const existing = porCliente.get(o.customer_id) ?? {
      id: o.customer_id,
      name: cust.name,
      tier: cust.tier,
      pedidos: 0,
      totalGasto: 0,
    };
    existing.pedidos += 1;
    existing.totalGasto += num(o.total_amount);
    porCliente.set(o.customer_id, existing);
  }
  const clientesRecentes = Array.from(porCliente.values())
    .sort((a, b) => b.totalGasto - a.totalGasto)
    .slice(0, 5);

  const statusOrder = ["aguardando_pagamento", "pago", "entregue", "em_rota", "processando", "cancelado"];
  const pedidosPorStatus: PedidoStatusResumo[] = statusOrder.map((status) => ({
    status,
    count: orders.filter((o) => o.status === status).length,
  }));

  return {
    receitaMes,
    pedidosMes: ordersMes.length,
    novosClientesMes,
    ticketMedio,
    clientesRecentes,
    pedidosPorStatus,
    campanhasAtivas: campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status, info: c.info })),
    vendasHoje: {
      pedidos: pedidosHoje.length,
      total: pedidosHoje.reduce((sum, o) => sum + num(o.total_amount), 0),
      pedidosOntem: pedidosOntem.length,
      totalOntem: pedidosOntem.reduce((sum, o) => sum + num(o.total_amount), 0),
    },
    receber7d: {
      qtd: vencer7d.length,
      valor: vencer7d.reduce((sum, p) => sum + saldoDe(p), 0),
    },
    vencidos: {
      qtd: vencidas.length,
      valor: vencidas.reduce((sum, p) => sum + saldoDe(p), 0),
    },
    caixa: {
      aberto: caixaAberta !== null,
      desde: caixaAberta?.opened_at ?? null,
    },
    entregas: {
      abertas: entregas.length,
      prazoHoje: entregasPrazoHoje,
    },
    estoque: { semSaldo, baixo },
    skusAtivos: skusRes.count ?? 0,
    clientesAtivos: customers.length,
    novosClientesSemana: customers.filter((c) => new Date(c.created_at) >= semana00).length,
  };
}
