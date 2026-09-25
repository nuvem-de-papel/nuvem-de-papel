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

export type CrmSummary = {
  receitaMes: number;
  pedidosMes: number;
  novosClientesMes: number;
  ticketMedio: number;
  clientesRecentes: ClienteRecente[];
  pedidosPorStatus: PedidoStatusResumo[];
  campanhasAtivas: CampanhaAtiva[];
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

export async function getCrmSummary(): Promise<CrmSummary> {
  const tenantId = getCurrentTenantId();
  const supabase = createAdminClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [ordersRes, customersRes, campaignsRes] = await Promise.all([
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
  ]);

  if (ordersRes.error) console.error("getCrmSummary orders:", ordersRes.error.message);
  if (customersRes.error) console.error("getCrmSummary customers:", customersRes.error.message);
  if (campaignsRes.error) console.error("getCrmSummary campaigns:", campaignsRes.error.message);

  const orders = ordersRes.data ?? [];
  const customers = customersRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];

  const ordersMes = orders.filter((o) => new Date(o.created_at) >= startOfMonth);
  const receitaMes = ordersMes.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const novosClientesMes = customers.filter((c) => new Date(c.created_at) >= startOfMonth).length;
  const ticketMedio = ordersMes.length > 0 ? receitaMes / ordersMes.length : 0;

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
    existing.totalGasto += Number(o.total_amount);
    porCliente.set(o.customer_id, existing);
  }
  const clientesRecentes = Array.from(porCliente.values())
    .sort((a, b) => b.totalGasto - a.totalGasto)
    .slice(0, 5);

  const statusOrder = ["entregue", "em_rota", "processando", "cancelado"];
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
  };
}
