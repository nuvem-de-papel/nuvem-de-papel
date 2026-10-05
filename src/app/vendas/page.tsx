import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import {
  ConsoleVendas,
  type ConsoleEmitente,
  type DadoEntrega,
  type DadoFunil,
  type NotaEmitida,
  type PedidoCompra,
  type PedidoVenda,
  type PendenteLoja,
} from "@/components/vendas/ConsoleVendas";
import type { LinhaComissao, Vendedor } from "@/app/vendas/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vendas — Nuvem de Papel",
  description: "Pedidos de venda, funil de documentos, expedição e notas fiscais.",
};

function comoObjeto(valor: unknown): Record<string, unknown> | null {
  if (Array.isArray(valor)) return (valor[0] as Record<string, unknown>) ?? null;
  return (valor as Record<string, unknown>) ?? null;
}

export default async function VendasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/vendas");

  const admin = createAdminClient();
  const [
    pedRes,
    itensRes,
    pcRes,
    nfeRes,
    meuRes,
    empRes,
    abertosRes,
    vendasRes,
    notasSaidaRes,
    entregasRes,
    eventosRes,
    pendentesRes,
    vendRes,
    comRes,
  ] = await Promise.all([
    admin
      .from("orders")
      .select(
        "id, status, channel, total_amount, created_at, origem, etapa, pedido_numero, venda_numero, cancelado_em, frete, payment_method, seller_id, customers(id, name, email, documento, uf)"
      )
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("order_items")
      .select("order_id, sku, name, unit_price, quantity, total")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .limit(1000),
    admin
      .from("purchase_orders")
      .select(
        "id, code, status, total, created_at, suppliers(id, name), purchase_order_items(sku_snapshot, name_snapshot, quantity, unit_cost, line_total)"
      )
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("nfe_emissoes")
      .select(
        "id, tipo, numero, serie, status, created_at, natureza_operacao, cfop, destinatario, frete, itens, totais, dados_adicionais, chave, protocolo, recibo, motivo, order:orders(id, customers(name)), purchase_order:purchase_orders(id, code, suppliers(name))"
      )
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("numero", { ascending: false })
      .limit(200),
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    admin
      .from("tenant_company")
      .select("razao_social, fantasia, cnpj, email, endereco")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .maybeSingle(),
    // funil (VD-02): pedidos em aberto
    admin
      .from("orders")
      .select("id, total_amount", { count: "exact" })
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("etapa", "pedido")
      .is("cancelado_em", null)
      .limit(5000),
    // funil: vendas (etapa venda) - "a faturar" = sem nota ativa
    admin
      .from("orders")
      .select("id, total_amount", { count: "exact" })
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("etapa", "venda")
      .is("cancelado_em", null)
      .limit(5000),
    // funil: notas de saida (emitidas x rejeitadas) + quais vendas tem nota
    admin
      .from("nfe_emissoes")
      .select("numero, status, totais, order:orders(id)")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("tipo", "saida")
      .order("numero", { ascending: false })
      .limit(5000),
    admin
      .from("entregas")
      .select("id, order_id, status, transportadora, rastreio, prazo, observacao")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("entrega_eventos")
      .select("entrega_id, para_status, nota, created_at")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(500),
    // "Importar da loja" (secao 4): pagos da loja ainda sem numero P-
    admin
      .from("orders")
      .select("id, payment_method, customers(name, documento, uf)")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("origem", "loja")
      .is("pedido_numero", null)
      .is("cancelado_em", null)
      .order("created_at", { ascending: false })
      .limit(500),
    // Bloco 5 passo 1 (0024): vendedores do tenant e comissao por mes
    admin
      .from("sellers")
      .select("id, name, email, documento, telefone, commission_pct, meta, ativo")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("name", { ascending: true })
      .limit(500),
    admin
      .from("v_comissao")
      .select("seller_id, vendedor, periodo, pedidos, base, pct, comissao")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("periodo", { ascending: false })
      .limit(500),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const itensPorPedido = new Map<string, PedidoVenda["itens"]>();
  for (const i of itensRes.data ?? []) {
    const lista = itensPorPedido.get(i.order_id) ?? [];
    lista.push({
      sku: i.sku,
      nome: i.name,
      qtd: i.quantity,
      unit: Number(i.unit_price),
      total: Number(i.total),
    });
    itensPorPedido.set(i.order_id, lista);
  }

  const vendas: PedidoVenda[] = (pedRes.data ?? []).map((o) => {
    const cliente = comoObjeto(o.customers);
    return {
      id: o.id,
      codigo: `PED-${o.id.slice(0, 8).toUpperCase()}`,
      cliente: (cliente?.name as string) ?? "—",
      email: (cliente?.email as string) ?? "",
      documento: (cliente?.documento as string | null) ?? null,
      canal: o.channel,
      origem: (o.origem as string) ?? "erp",
      etapa: (o.etapa as string | null) ?? null,
      cancelado: !!o.cancelado_em,
      vendedorId: (o.seller_id as string | null) ?? null,
      pedidoNumero: (o.pedido_numero as string | null) ?? null,
      vendaNumero: (o.venda_numero as string | null) ?? null,
      status: o.status,
      data: o.created_at,
      total: Number(o.total_amount),
      itens: itensPorPedido.get(o.id) ?? [],
    };
  });

  const compras: PedidoCompra[] = (pcRes.data ?? []).map((p) => {
    const forn = comoObjeto(p.suppliers);
    return {
      id: p.id,
      codigo: p.code,
      fornecedor: (forn?.name as string) ?? "—",
      status: p.status,
      data: p.created_at,
      total: Number(p.total),
      itens: (p.purchase_order_items ?? []).map((i) => ({
        sku: i.sku_snapshot,
        nome: i.name_snapshot,
        qtd: i.quantity,
        unit: Number(i.unit_cost),
        total: Number(i.line_total),
      })),
    };
  });

  const notas: NotaEmitida[] = (nfeRes.data ?? []).map((n) => {
    const pedido = comoObjeto(n.order);
    const compra = comoObjeto(n.purchase_order);
    const forn = comoObjeto(compra?.suppliers);
    return {
      id: n.id,
      tipo: n.tipo,
      numero: Number(n.numero),
      serie: n.serie,
      status: n.status,
      data: n.created_at,
      natureza: n.natureza_operacao,
      cfop: n.cfop,
      destinatario: (n.destinatario as NotaEmitida["destinatario"]) ?? {},
      frete: (n.frete as NotaEmitida["frete"]) ?? {},
      itens: (Array.isArray(n.itens) ? n.itens : []) as NotaEmitida["itens"],
      totais: (n.totais as NotaEmitida["totais"]) ?? { base: 0, icms: 0, pis: 0, cofins: 0, total: 0 },
      dadosAdicionais: n.dados_adicionais ?? null,
      chave: n.chave ?? null,
      protocolo: n.protocolo ?? null,
      recibo: n.recibo ?? null,
      motivo: n.motivo ?? null,
      vinculo: pedido
        ? `PED-${String(pedido.id).slice(0, 8).toUpperCase()}`
        : (compra?.code as string) ?? "—",
      vinculoNome: pedido
        ? ((comoObjeto(pedido.customers)?.name as string) ?? "—")
        : ((forn?.name as string) ?? "—"),
    };
  });

  // ---------------------------------------------------------------- funil --
  const somaTotal = (linhas: { total_amount: number }[]) =>
    linhas.reduce((s, l) => s + Number(l.total_amount ?? 0), 0);

  const ativas = new Set<string>(); // vendas com nota pendente/transmitida/autorizada
  const emitidasIds: string[] = [];
  const rejeitadasIds: string[] = [];
  let totalEmitidas = 0;
  let totalRejeitadas = 0;
  for (const n of notasSaidaRes.data ?? []) {
    const oid = comoObjeto(n.order)?.id as string | undefined;
    const total = Number((n.totais as { total?: number } | null)?.total ?? 0);
    if (n.status === "rejeitada") {
      if (oid) rejeitadasIds.push(oid);
      totalRejeitadas += total;
    } else if (n.status !== "cancelada") {
      if (oid) {
        emitidasIds.push(oid);
        ativas.add(oid);
      }
      totalEmitidas += total;
    }
  }

  const afaturarIds: string[] = [];
  let totalAfaturar = 0;
  for (const v of vendasRes.data ?? []) {
    if (!ativas.has(v.id)) {
      afaturarIds.push(v.id);
      totalAfaturar += Number(v.total_amount ?? 0);
    }
  }

  const LIMITE_IDS = 2000;
  const funil: DadoFunil = {
    pedidos: {
      qtd: abertosRes.count ?? 0,
      total: somaTotal(abertosRes.data ?? []),
      ids: (abertosRes.data ?? []).map((r) => r.id).slice(0, LIMITE_IDS),
    },
    afaturar: {
      qtd: afaturarIds.length,
      total: totalAfaturar,
      ids: afaturarIds.slice(0, LIMITE_IDS),
    },
    emitidas: {
      qtd: emitidasIds.length,
      total: totalEmitidas,
      ids: emitidasIds.slice(0, LIMITE_IDS),
    },
    rejeitadas: {
      qtd: rejeitadasIds.length,
      total: totalRejeitadas,
      ids: rejeitadasIds.slice(0, LIMITE_IDS),
    },
  };

  // ------------------------------------------------------------ expedicao --
  const pedPorId = new Map(vendas.map((v) => [v.id, v]));
  const notaPorPedido = new Map<string, number>();
  for (const n of notasSaidaRes.data ?? []) {
    const oid = comoObjeto(n.order)?.id as string | undefined;
    // notas vem do mais novo para o mais velho: primeira vence
    if (oid && n.status !== "cancelada" && !notaPorPedido.has(oid)) {
      notaPorPedido.set(oid, Number(n.numero));
    }
  }

  const eventosPorEntrega = new Map<string, { texto: string; em: string }>();
  for (const ev of eventosRes.data ?? []) {
    if (!eventosPorEntrega.has(ev.entrega_id)) {
      eventosPorEntrega.set(ev.entrega_id, {
        texto: [ev.para_status, ev.nota].filter(Boolean).join(" — "),
        em: ev.created_at,
      });
    }
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const expedicao: DadoEntrega[] = [];
  for (const en of entregasRes.data ?? []) {
    const pedido = pedPorId.get(en.order_id);
    if (!pedido) continue; // pedido fora da janela de 200
    const prazo = (en.prazo as string | null) ?? null;
    const concluida = en.status === "entregue" || en.status === "devolvido";
    expedicao.push({
      id: en.id,
      orderId: en.order_id,
      codigo: pedido.codigo,
      cliente: pedido.cliente,
      status: en.status,
      transportadora: (en.transportadora as string | null) ?? null,
      rastreio: (en.rastreio as string | null) ?? null,
      prazo,
      atrasada: !!prazo && !concluida && prazo < hoje,
      nota: notaPorPedido.get(en.order_id) ?? null,
      ultimoEvento: eventosPorEntrega.get(en.id) ?? null,
      concluida,
      observacao: (en.observacao as string | null) ?? null,
    });
  }

  // ----------------------------------------------------- importar da loja --
  const pendentes: PendenteLoja[] = (pendentesRes.data ?? []).map((p) => {
    const c = comoObjeto(p.customers);
    return {
      id: p.id,
      codigo: `PED-${p.id.slice(0, 8).toUpperCase()}`,
      cliente: (c?.name as string) ?? "—",
      documento: (c?.documento as string | null) ?? null,
      uf: (c?.uf as string | null) ?? null,
      itens: itensPorPedido.get(p.id)?.length ?? 0,
      pagamento: (p.payment_method as string | null) ?? null,
    };
  });

  // ------------------------------------------------------- vendedores ----
  const vendedores: Vendedor[] = (vendRes.data ?? []).map((s) => ({
    id: s.id,
    nome: s.name,
    email: s.email ?? "",
    documento: s.documento ?? "",
    telefone: s.telefone ?? "",
    commissionPct: Number(s.commission_pct ?? 0),
    meta: Number(s.meta ?? 0),
    ativo: s.ativo !== false,
  }));

  const comissoes: LinhaComissao[] = (comRes.data ?? []).map((c) => ({
    vendedor: c.vendedor,
    sellerId: c.seller_id,
    periodo: String(c.periodo ?? "").slice(0, 7),
    pedidos: Number(c.pedidos ?? 0),
    base: Number(c.base ?? 0),
    pct: Number(c.pct ?? 0),
    comissao: Number(c.comissao ?? 0),
  }));

  const emp = empRes.data;
  const emitente: ConsoleEmitente | null = emp
    ? {
        razao: emp.razao_social,
        fantasia: emp.fantasia ?? "",
        cnpj: emp.cnpj ?? "",
        email: emp.email ?? "",
        endereco: formatarEndereco(emp.endereco as Record<string, string> | null),
      }
    : null;

  return (
    <ConsoleVendas
      vendas={vendas}
      compras={compras}
      notas={notas}
      funil={funil}
      expedicao={expedicao}
      pendentes={pendentes}
      emitente={emitente}
      vendedores={vendedores}
      comissoes={comissoes}
    />
  );
}

function formatarEndereco(end: Record<string, string> | null): string {
  if (!end) return "";
  const partes = [
    [end.logradouro, end.numero].filter(Boolean).join(", "),
    end.complemento,
    end.bairro,
    [end.cidade, end.uf].filter(Boolean).join("/"),
    end.cep ? `CEP ${end.cep}` : "",
  ].filter(Boolean);
  return partes.join(" - ");
}
