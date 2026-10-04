import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import {
  ConsoleCompras,
  type EnvioPedido,
  type Fornecedor,
  type ImportacaoPedido,
  type ItemCatalogo,
  type NotaEntrada,
  type NotaRecebida,
  type ParcelaCompra,
  type PedidoCompra,
  type TransportePedido,
} from "@/components/compras/ConsoleCompras";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compras — Nuvem de Papel",
  description: "Pedidos, notas de entrada, recebimento e pagamento (atacado).",
};

function comoObjeto(valor: unknown): Record<string, unknown> | null {
  if (Array.isArray(valor)) return (valor[0] as Record<string, unknown>) ?? null;
  return (valor as Record<string, unknown>) ?? null;
}

// O select com embeds faz o supabase-js devolver GenericStringError no parser;
// as linhas cruas são tratadas aqui com tipos próprios.
type LinhaPo = {
  id: string;
  code: string;
  status: string;
  total: number | string;
  notes: string | null;
  created_at: string;
  expected_at: string | null;
  origem: string;
  tipo: string;
  frete: number | string | null;
  desconto: number | string | null;
  condicao: string | null;
  conferido_em: string | null;
  concluida_em: string | null;
  cancelada_em: string | null;
  supplier_id: string;
  suppliers: unknown;
  purchase_order_items:
    | {
        id: string;
        item_id: string;
        sku_snapshot: string;
        name_snapshot: string;
        quantity: number;
        unit_cost: number | string;
        line_total: number | string;
        qtd_recebida: number | null;
      }[]
    | null;
  notas_entrada: unknown;
  compra_transporte: unknown;
  compra_transporte_eventos:
    | { status: string; texto: string; local: string | null; ocorrido_em: string }[]
    | null;
  compra_envios: { para: string; enviado_em: string }[] | null;
  compra_importacao: unknown;
};

type LinhaNotaVinculo = {
  purchase_order_id: string;
  nfe_recebida_id: string | null;
  numero: string;
  status: string;
};

type LinhaNfe = {
  id: string;
  chave: string;
  numero: string;
  serie: string;
  emitente_cnpj: string;
  emitente_nome: string;
  emitente_uf: string | null;
  emitida_em: string;
  valor_total: number | string;
  manifestacao: string;
  purchase_order_id: string | null;
  itens: unknown;
};

export default async function ComprasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/compras");

  const admin = createAdminClient();
  const [
    fornRes,
    poRes,
    itensRes,
    meuRes,
    nfeRes,
    notasRes,
    recRes,
  ] = await Promise.all([
    admin
      .from("suppliers")
      .select("id, name, contact_email, cnpj, user_id, active, uf, pais")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("name", { ascending: true }),
    admin
      .from("purchase_orders")
      .select(
        "id, code, status, total, notes, created_at, expected_at, origem, tipo, frete, desconto, condicao, conferido_em, concluida_em, cancelada_em, supplier_id, " +
          "suppliers(id, name, cnpj, uf, pais, contact_email, user_id), " +
          "purchase_order_items(id, item_id, sku_snapshot, name_snapshot, quantity, unit_cost, line_total, qtd_recebida), " +
          "notas_entrada(id, tipo, numero, serie, chave, cfop, status, divergencias, aceita_com, emitida_em, nfe_recebida_id), " +
          "compra_transporte(transportadora, codigo, previsao, status), " +
          "compra_transporte_eventos(status, texto, local, ocorrido_em), " +
          "compra_envios(para, enviado_em), " +
          "compra_importacao(moeda, cambio, di, frete_int, seguro, aliq_ii, aliq_ipi, aliq_pis, aliq_cofins, aliq_icms, despesas)"
      )
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("catalog_items")
      .select("id, sku, name")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("active", true)
      .order("name", { ascending: true }),
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    // NE-01/NE-02: distribuição DF-e (notas emitidas contra o CNPJ da loja)
    admin
      .from("nfe_recebidas")
      .select(
        "id, chave, numero, serie, emitente_cnpj, emitente_nome, emitente_uf, emitida_em, valor_total, manifestacao, purchase_order_id, itens"
      )
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("emitida_em", { ascending: false })
      .limit(200),
    // vínculos existentes (para o badge "a tratar" e o rótulo da nota)
    admin
      .from("notas_entrada")
      .select("id, purchase_order_id, nfe_recebida_id, numero, status")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .limit(500),
    // recebimentos → títulos → parcelas (5.6 "Contas a pagar")
    admin
      .from("purchase_receipts")
      .select("id, purchase_order_id, received_at")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("received_at", { ascending: false })
      .limit(1000),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const recIds = (recRes.data ?? []).map((r) => r.id);
  const [titRes, parRes] = await Promise.all([
    recIds.length
      ? admin
          .from("financial_titles")
          .select("id, source_id")
          .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
          .eq("source_type", "purchase_receipt")
          .eq("direction", "payable")
          .in("source_id", recIds)
      : Promise.resolve({ data: [] as { id: string; source_id: string }[] }),
    admin
      .from("financial_installments")
      .select("id, title_id, number, status, due_date, principal_amount, paid_amount")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("due_date", { ascending: true })
      .limit(2000),
  ]);

  // parcelas agrupadas por PO (via título → receipt → pedido)
  const recPorId = new Map((recRes.data ?? []).map((r) => [r.id, r.purchase_order_id]));
  const poPorTitulo = new Map<string, string>();
  for (const t of titRes.data ?? []) {
    const poId = recPorId.get(t.source_id);
    if (poId) poPorTitulo.set(t.id, poId);
  }
  const parcelasPorPo = new Map<string, ParcelaCompra[]>();
  for (const p of parRes.data ?? []) {
    const poId = poPorTitulo.get(p.title_id);
    if (!poId) continue;
    const lista = parcelasPorPo.get(poId) ?? [];
    lista.push({
      id: p.id,
      numero: p.number,
      status: p.status,
      vencimento: p.due_date,
      valor: Number(p.principal_amount),
      pago: Number(p.paid_amount),
    });
    parcelasPorPo.set(poId, lista);
  }

  const fornecedores: Fornecedor[] = (fornRes.data ?? []).map((f) => ({
    id: f.id,
    nome: f.name,
    contato: f.contact_email,
    cnpj: f.cnpj,
    vinculado: !!f.user_id,
    ativo: f.active,
    uf: f.uf,
    pais: f.pais ?? "Brasil",
  }));

  // nota vinculada por PO (notas_entrada é 1:1; o embed pode vir objeto/array)
  const notasVinculadas = new Map<
    string,
    {
      numero: string;
      nfeRecebidaId: string | null;
      status: string;
    }
  >();
  for (const n of (notasRes.data ?? []) as unknown as LinhaNotaVinculo[]) {
    notasVinculadas.set(n.purchase_order_id, {
      numero: n.numero,
      nfeRecebidaId: n.nfe_recebida_id,
      status: n.status,
    });
  }

  const pedidos: PedidoCompra[] = ((poRes.data ?? []) as unknown as LinhaPo[]).map((p) => {
    const fornRaw = p.suppliers as unknown;
    const forn = (Array.isArray(fornRaw) ? fornRaw[0] : fornRaw) as
      | { id?: string; name?: string; cnpj?: string | null; uf?: string | null; pais?: string | null }
      | null;

    const notaRaw = comoObjeto(p.notas_entrada);
    const nota: NotaEntrada | null = notaRaw
      ? {
          numero: String(notaRaw.numero ?? ""),
          serie: String(notaRaw.serie ?? ""),
          chave: (notaRaw.chave as string | null) ?? null,
          cfop: String(notaRaw.cfop ?? ""),
          status: String(notaRaw.status ?? "ok"),
          tipo: String(notaRaw.tipo ?? "fornecedor"),
          divergencias: Array.isArray(notaRaw.divergencias)
            ? (notaRaw.divergencias as string[])
            : [],
          aceita: Array.isArray(notaRaw.aceita_com) ? (notaRaw.aceita_com as string[]) : null,
          emitidaEm: (notaRaw.emitida_em as string | null) ?? null,
          nfeRecebidaId: (notaRaw.nfe_recebida_id as string | null) ?? null,
        }
      : null;

    const transpRaw = comoObjeto(p.compra_transporte);
    const transporte: TransportePedido | null = transpRaw
      ? {
          status: String(transpRaw.status ?? "aguardando"),
          transportadora: (transpRaw.transportadora as string | null) ?? null,
          codigo: (transpRaw.codigo as string | null) ?? null,
          previsao: (transpRaw.previsao as string | null) ?? null,
        }
      : null;

    const eventos: NonNullable<TransportePedido["eventos"]> = (
      (p.compra_transporte_eventos ?? []) as {
        status: string;
        texto: string;
        local: string | null;
        ocorrido_em: string;
      }[]
    )
      .map((e) => ({
        status: e.status,
        texto: e.texto,
        local: e.local,
        em: e.ocorrido_em,
      }))
      .sort((a, b) => (a.em < b.em ? 1 : -1));

    const envios: EnvioPedido[] = (p.compra_envios ?? [])
      .map((e) => ({ para: e.para, em: e.enviado_em }))
      .sort((a, b) => (a.em < b.em ? 1 : -1));

    const impRaw = comoObjeto(p.compra_importacao);
    const importacao: ImportacaoPedido | null = impRaw
      ? {
          moeda: String(impRaw.moeda ?? "USD"),
          cambio: Number(impRaw.cambio ?? 0),
          di: (impRaw.di as string | null) ?? null,
          freteInt: Number(impRaw.frete_int ?? 0),
          seguro: Number(impRaw.seguro ?? 0),
          aliqIi: Number(impRaw.aliq_ii ?? 0),
          aliqIpi: Number(impRaw.aliq_ipi ?? 0),
          aliqPis: Number(impRaw.aliq_pis ?? 0),
          aliqCofins: Number(impRaw.aliq_cofins ?? 0),
          aliqIcms: Number(impRaw.aliq_icms ?? 0),
          despesas: Number(impRaw.despesas ?? 0),
        }
      : null;

    return {
      id: p.id,
      codigo: p.code,
      status: p.status,
      total: Number(p.total),
      notas: p.notes,
      criadoEm: p.created_at,
      fornecedor: forn?.name ?? "—",
      fornecedorId: forn?.id ?? p.supplier_id,
      fornecedorCnpj: forn?.cnpj ?? null,
      fornecedorUf: forn?.uf ?? null,
      fornecedorPais: forn?.pais ?? "Brasil",
      origem: p.origem === "importacao" ? "importacao" : "nacional",
      tipo: p.tipo === "entrada_direta" ? "entrada_direta" : "pedido",
      frete: Number(p.frete ?? 0),
      desconto: Number(p.desconto ?? 0),
      condicao: p.condicao ?? "28 dias",
      conferidoEm: p.conferido_em ?? null,
      concluidaEm: p.concluida_em ?? null,
      canceladaEm: p.cancelada_em ?? null,
      nota,
      transporte,
      eventos,
      envios,
      importacao,
      parcelas: parcelasPorPo.get(p.id) ?? [],
      itens: (p.purchase_order_items ?? []).map((i) => ({
        id: i.id,
        itemId: i.item_id,
        sku: i.sku_snapshot,
        nome: i.name_snapshot,
        quantidade: i.quantity,
        custo: Number(i.unit_cost),
        total: Number(i.line_total),
        qtdRecebida: i.qtd_recebida ?? 0,
      })),
    };
  });

  const vinculoPorNfe = new Map<string, string>();
  for (const n of (notasRes.data ?? []) as unknown as LinhaNotaVinculo[]) {
    if (n.nfe_recebida_id) vinculoPorNfe.set(n.nfe_recebida_id, n.purchase_order_id);
  }
  const codigoPorId = new Map(pedidos.map((p) => [p.id, p.codigo]));

  const notas: NotaRecebida[] = ((nfeRes.data ?? []) as unknown as LinhaNfe[]).map((n) => {
    const poId = n.purchase_order_id ?? vinculoPorNfe.get(n.id) ?? null;
    return {
      id: n.id,
      chave: n.chave,
      numero: n.numero,
      serie: n.serie,
      emitenteCnpj: n.emitente_cnpj,
      emitenteNome: n.emitente_nome,
      emitenteUf: n.emitente_uf,
      emitidaEm: n.emitida_em,
      valorTotal: Number(n.valor_total),
      manifestacao: n.manifestacao,
      compraId: poId,
      codigoCompra: poId ? (codigoPorId.get(poId) ?? null) : null,
      itens: Array.isArray(n.itens)
        ? (n.itens as { codigo?: string | null; descricao?: string | null; qtd?: number | null; custo?: number | null }[])
        : null,
    };
  });

  const catalogo: ItemCatalogo[] = (itensRes.data ?? []).map((i) => ({
    id: i.id,
    sku: i.sku,
    nome: i.name,
  }));

  return (
    <ConsoleCompras fornecedores={fornecedores} pedidos={pedidos} catalogo={catalogo} notas={notas} />
  );
}
