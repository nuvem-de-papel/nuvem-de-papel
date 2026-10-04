"use server";

import { revalidatePath } from "next/cache";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { enviarEmail, templatePedidoCompra } from "@/lib/email";
import { montarChave44, sefazEmMock } from "@/lib/sefaz";
import {
  CONDICOES_PAGAMENTO,
  EVENTOS_TRANSPORTE,
  ROTULOS_TRANSPORTE,
  compararNotaComPedido,
  cfopEntrada,
  proximoTransporte,
  resumoImportacao,
  resumoNacional,
  type DadosImportacao,
  type ItemNotaXml,
  type ItemPedidoCmp,
} from "@/lib/compras";

// Compras (F6/F6 v1): fornecedores, pedidos e o ciclo completo de Compras v1
// (spec modulo-compras.md): editor PC-01..PC-08, notas NE-01..NE-09 e
// NI-01..NI-04, transporte/recebimento RC-01..RC-08 e títulos 5.6. Escrita
// deny-all no banco — tudo via service_role; recebimento em si acontece na
// RPC purchase_receive com idempotência e trava de linha no PO.

export type ResultadoAcao =
  | { ok: true; aviso?: string; codigo?: string; compraId?: string }
  | { ok: false; erro: string };

type Gestor = { id: string; role: string };
type Admin = ReturnType<typeof createAdminClient>;

// Pendência documentada (DF-e): sem certificado A1 as ações que falam com a
// SEFAZ (manifestação, distribuição, transmissão/consulta) falham fechado.
const ERRO_A1 =
  "Requer certificado A1: a integração real com a SEFAZ está pendência (homologação usa SEFAZ_MOCK=1).";

function exigirMock(): { ok: false; erro: string } | null {
  return sefazEmMock() ? null : { ok: false, erro: ERRO_A1 };
}

async function gestaoAtual(): Promise<Gestor | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "ativo" || !PAPEIS_GESTAO.includes(profile.role)) {
    return null;
  }
  return profile;
}

function ehEmail(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function ehUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function apenasDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function auditoria(
  admin: Admin,
  userId: string,
  action: string,
  entity: string,
  entityId: string | null,
  after: Record<string, unknown>
): Promise<void> {
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action,
    entity,
    entity_id: entityId,
    after,
  });
}

// PC-03: numero vem da sequence (compra_proximo_codigo); fallback para o
// formato antigo PC-8hex se a 0019 ainda nao estiver aplicada.
async function proximoCodigoPedido(admin: Admin): Promise<string> {
  const { data, error } = await admin.rpc("compra_proximo_codigo");
  if (!error && typeof data === "string" && /^PC-[0-9A-Fa-f]{8}$/.test(data)) return data;
  return `PC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function proximoCodigoEntradaDireta(admin: Admin): Promise<string> {
  const { data, error } = await admin.rpc("compra_proxima_entrada_direta");
  if (!error && typeof data === "string" && /^EN-[0-9A-Fa-f]{4}$/.test(data)) return data;
  return `EN-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

function statusInicialTransporte(origem: string): string {
  return origem === "importacao" ? "producao" : "aguardando";
}

async function gravarEvento(
  admin: Admin,
  poId: string,
  status: string,
  texto: string,
  local: string | null = null
): Promise<void> {
  await admin.from("compra_transporte_eventos").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    purchase_order_id: poId,
    status,
    texto,
    local,
  });
}

// Garante a linha de transporte (POs antigos podem nao ter) e devolve o status.
async function assegurarTransporte(
  admin: Admin,
  poId: string,
  origem: string,
  criarComEvento: string | null = null
): Promise<string> {
  const { data } = await admin
    .from("compra_transporte")
    .select("status")
    .eq("purchase_order_id", poId)
    .maybeSingle();
  if (data) return data.status;
  const status = statusInicialTransporte(origem);
  const { error } = await admin.from("compra_transporte").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    purchase_order_id: poId,
    status,
  });
  if (!error && criarComEvento) await gravarEvento(admin, poId, status, criarComEvento);
  return status;
}

// ---------------------------------------------------------------- fornecedor --
export async function criarFornecedor(input: {
  nome: string;
  emailContato?: string;
  cnpj?: string;
  emailUsuario?: string;
  uf?: string;
}): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };

  const nome = (input.nome ?? "").trim();
  const emailContato = (input.emailContato ?? "").trim().toLowerCase();
  const cnpj = (input.cnpj ?? "").trim();
  const emailUsuario = (input.emailUsuario ?? "").trim().toLowerCase();
  const uf = (input.uf ?? "").trim().toUpperCase();

  if (nome.length < 3) return { ok: false, erro: "Informe o nome do fornecedor." };
  if (emailContato && !ehEmail(emailContato)) return { ok: false, erro: "E-mail de contato inválido." };
  if (uf && !/^[A-Z]{2}$/.test(uf)) return { ok: false, erro: "UF inválida (2 letras)." };

  const admin = createAdminClient();

  // vínculo opcional com um usuário já criado com papel 'fornecedor'
  let userId: string | null = null;
  if (emailUsuario) {
    if (!ehEmail(emailUsuario)) return { ok: false, erro: "E-mail do usuário inválido." };
    const { data: vinculado } = await admin
      .from("profiles")
      .select("id, role")
      .eq("email", emailUsuario)
      .maybeSingle();
    if (!vinculado) return { ok: false, erro: "Usuário fornecedor não encontrado (crie-o em Usuários)." };
    if (vinculado.role !== "fornecedor") {
      return { ok: false, erro: "O usuário informado não tem papel 'fornecedor'." };
    }
    userId = vinculado.id;
  }

  const { error } = await admin.from("suppliers").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    name: nome,
    contact_email: emailContato || null,
    cnpj: cnpj || null,
    user_id: userId,
    uf: uf || null,
  });
  if (error) {
    if (/duplicate|conflict/i.test(error.message)) {
      return { ok: false, erro: "Já existe um fornecedor com este nome." };
    }
    return { ok: false, erro: `Falha ao criar fornecedor: ${error.message}` };
  }

  revalidatePath("/compras");
  return { ok: true };
}

// -------------------------------------------------------- pedido (form rápido) --
// Caminho legado do F6 (f6.cjs): sem CNPJ obrigatório e sem origem (nacional
// pelo default da coluna) — o editor novo é salvarPedidoCompra (PC-02).
export async function criarPedidoCompra(input: {
  supplierId: string;
  itens: { itemId: string; qty: number; custo: number }[];
  notes?: string;
}): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };

  if (!ehUuid(input.supplierId ?? "")) return { ok: false, erro: "Fornecedor inválido." };
  const brutas = Array.isArray(input.itens) ? input.itens : [];
  if (brutas.length === 0 || brutas.length > 50) {
    return { ok: false, erro: "Informe ao menos um item." };
  }

  const itens: { itemId: string; qty: number; custo: number }[] = [];
  for (const i of brutas) {
    if (!i || !ehUuid(String(i.itemId))) return { ok: false, erro: "Item inválido." };
    const qty = Math.floor(Number(i.qty));
    const custo = Number(i.custo);
    if (!Number.isFinite(qty) || qty < 1 || qty > 999999) {
      return { ok: false, erro: "Quantidade inválida." };
    }
    if (!Number.isFinite(custo) || custo < 0) return { ok: false, erro: "Custo inválido." };
    itens.push({ itemId: i.itemId, qty, custo });
  }

  const admin = createAdminClient();

  const { data: fornecedor } = await admin
    .from("suppliers")
    .select("id, contact_email, user_id")
    .eq("id", input.supplierId)
    .maybeSingle();
  if (!fornecedor) return { ok: false, erro: "Fornecedor não encontrado." };

  const { data: cat } = await admin
    .from("catalog_items")
    .select("id, sku, name")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .in("id", itens.map((i) => i.itemId))
    .eq("active", true);
  const catPorId = new Map((cat ?? []).map((c) => [c.id, c]));
  if (catPorId.size !== itens.length) {
    return { ok: false, erro: "Alguns itens saíram do catálogo." };
  }

  const poId = crypto.randomUUID();
  const codigo = await proximoCodigoPedido(admin);
  const total = itens.reduce((acc, i) => acc + i.qty * i.custo, 0);

  const { error: erroPo } = await admin.from("purchase_orders").insert({
    id: poId,
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    supplier_id: input.supplierId,
    code: codigo,
    total,
    notes: (input.notes ?? "").trim() || null,
    created_by: gestor.id,
    idempotency_key: poId,
  });
  if (erroPo) return { ok: false, erro: `Falha ao criar pedido: ${erroPo.message}` };

  const { error: erroItens } = await admin.from("purchase_order_items").insert(
    itens.map((i) => {
      const item = catPorId.get(i.itemId)!;
      return {
        tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
        purchase_order_id: poId,
        item_id: i.itemId,
        sku_snapshot: item.sku,
        name_snapshot: item.name,
        quantity: i.qty,
        unit_cost: i.custo,
        line_total: i.qty * i.custo,
      };
    })
  );
  if (erroItens) {
    // compensação: não deixa PO sem itens
    await admin.from("purchase_orders").delete().eq("id", poId);
    return { ok: false, erro: `Falha ao registrar itens: ${erroItens.message}` };
  }

  // PC-03: transporte nasce em 'aguardando' e o primeiro evento é o emitido.
  await assegurarTransporte(admin, poId, "nacional", "Pedido de compra emitido");

  await auditoria(admin, gestor.id, "compra.criada", "purchase_orders", poId, {
    codigo,
    origem: "nacional",
    total,
    via: "form_rapido",
  });

  // aviso ao fornecedor (F6.5, best-effort): contact_email > perfil vinculado
  let destinoFornecedor = fornecedor.contact_email;
  if (!destinoFornecedor && fornecedor.user_id) {
    const { data: perfil } = await admin
      .from("profiles")
      .select("email")
      .eq("id", fornecedor.user_id)
      .maybeSingle();
    destinoFornecedor = perfil?.email ?? null;
  }
  if (destinoFornecedor) {
    const tPo = templatePedidoCompra(codigo, total);
    await enviarEmail(destinoFornecedor, tPo.assunto, tPo.html, {
      actorUserId: gestor.id,
      relatedEntity: "purchase_orders",
      relatedId: poId,
    });
  }

  revalidatePath("/compras");
  revalidatePath("/portal/fornecedor");
  return { ok: true, codigo, compraId: poId };
}

// ------------------------------------------------------------------- editor --
export type EntradaItemPedido = { itemId: string; qty: number; custo: number };

export type EntradaImportacao = {
  moeda?: string;
  cambio?: number;
  di?: string;
  freteInt?: number;
  seguro?: number;
  aliqIi?: number;
  aliqIpi?: number;
  aliqPis?: number;
  aliqCofins?: number;
  aliqIcms?: number;
  despesas?: number;
};

export type EntradaSalvarPedido = {
  compraId?: string | null;
  fornecedorId: string;
  origem: "nacional" | "importacao";
  itens: EntradaItemPedido[];
  frete?: number;
  desconto?: number;
  condicao?: string;
  notas?: string;
  importacao?: EntradaImportacao;
};

// PC-01 (origem travada), PC-02 (validações), PC-03 (numero + evento),
// PC-05 (soma por produto), PC-06 (trava na nota).
export async function salvarPedidoCompra(input: EntradaSalvarPedido): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };

  const origem = input?.origem === "importacao" ? "importacao" : input?.origem === "nacional" ? "nacional" : "";
  if (!origem) return { ok: false, erro: "Origem inválida (nacional ou importação)." };

  const brutas = Array.isArray(input.itens) ? input.itens : [];
  if (brutas.length === 0 || brutas.length > 50) {
    return { ok: false, erro: "Adicione pelo menos um produto." };
  }
  if (!ehUuid(input.fornecedorId ?? "")) return { ok: false, erro: "Informe o fornecedor." };

  // PC-05: mesmo produto soma na linha (custo = última edição)
  const merged = new Map<string, EntradaItemPedido>();
  for (const i of brutas) {
    if (!i || !ehUuid(String(i.itemId))) return { ok: false, erro: "Item inválido." };
    const qty = Math.floor(Number(i.qty));
    const custo = Number(i.custo);
    if (!Number.isFinite(qty) || qty < 1 || qty > 999999) {
      return { ok: false, erro: "Quantidade inválida." };
    }
    if (!Number.isFinite(custo) || custo < 0) return { ok: false, erro: "Custo inválido." };
    const anterior = merged.get(i.itemId);
    merged.set(i.itemId, {
      itemId: i.itemId,
      qty: (anterior?.qty ?? 0) + qty,
      custo,
    });
  }
  const itens = [...merged.values()];

  const frete = num(input.frete);
  const desconto = num(input.desconto);
  if (frete < 0) return { ok: false, erro: "Frete inválido." };
  if (desconto < 0) return { ok: false, erro: "Desconto inválido." };

  const condicao = (input.condicao ?? "").trim() || "28 dias";
  if (!(CONDICOES_PAGAMENTO as readonly string[]).includes(condicao)) {
    return { ok: false, erro: "Condição de pagamento inválida." };
  }

  // dados de importação (5.2) — validados só quando a origem pede
  let imp: DadosImportacao | null = null;
  if (origem === "importacao") {
    const moeda = (input.importacao?.moeda ?? "USD").trim().toUpperCase();
    if (!["USD", "EUR", "JPY", "CNY"].includes(moeda)) return { ok: false, erro: "Moeda inválida." };
    const cambio = num(input.importacao?.cambio);
    if (!(cambio > 0)) return { ok: false, erro: "Informe o câmbio." };
    const taxa = (v: unknown, nome: string): number => {
      const t = num(v);
      if (t < 0 || t > 100) throw new Error(`Alíquota inválida (${nome}).`);
      return t;
    };
    try {
      imp = {
        moeda,
        cambio,
        freteInt: num(input.importacao?.freteInt),
        seguro: num(input.importacao?.seguro),
        aliqIi: taxa(input.importacao?.aliqIi, "II"),
        aliqIpi: taxa(input.importacao?.aliqIpi, "IPI"),
        aliqPis: taxa(input.importacao?.aliqPis ?? 2.1, "PIS"),
        aliqCofins: taxa(input.importacao?.aliqCofins ?? 9.65, "COFINS"),
        aliqIcms: taxa(input.importacao?.aliqIcms, "ICMS"),
        despesas: num(input.importacao?.despesas),
      };
      if (imp.aliqIcms >= 100) return { ok: false, erro: "Alíquota inválida (ICMS)." };
      if (imp.freteInt < 0 || imp.seguro < 0 || imp.despesas < 0) {
        return { ok: false, erro: "Valores de importação inválidos." };
      }
    } catch (e) {
      return { ok: false, erro: (e as Error).message };
    }
  }

  const admin = createAdminClient();

  const { data: fornecedor } = await admin
    .from("suppliers")
    .select("id, name, cnpj, contact_email, user_id")
    .eq("id", input.fornecedorId)
    .maybeSingle();
  if (!fornecedor) return { ok: false, erro: "Informe o fornecedor." };
  // PC-02: nacional exige CNPJ — é por ele que a nota se vincula (NE-03).
  if (origem === "nacional" && apenasDigitos(fornecedor.cnpj).length !== 14) {
    return {
      ok: false,
      erro: "Fornecedor nacional precisa de CNPJ (é por ele que a nota é vinculada).",
    };
  }

  const { data: cat } = await admin
    .from("catalog_items")
    .select("id, sku, name")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .in("id", itens.map((i) => i.itemId))
    .eq("active", true);
  const catPorId = new Map((cat ?? []).map((c) => [c.id, c]));
  if (catPorId.size !== itens.length) {
    return { ok: false, erro: "Alguns itens saíram do catálogo." };
  }

  const mercadorias = itens.reduce((acc, i) => acc + i.qty * i.custo, 0);
  const total =
    origem === "nacional"
      ? resumoNacional(mercadorias, frete, desconto).total
      : resumoImportacao(mercadorias, imp!).total;
  const notas = (input.notas ?? "").trim() || null;

  // ------------------------------------------------------------------ edição --
  if (input.compraId) {
    if (!ehUuid(input.compraId)) return { ok: false, erro: "Pedido inválido." };
    const { data: po } = await admin
      .from("purchase_orders")
      .select("id, code, origem, status")
      .eq("id", input.compraId)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .maybeSingle();
    if (!po) return { ok: false, erro: "Pedido não encontrado." };
    // PC-01: a origem não muda depois de salvo
    if (po.origem !== origem) {
      return { ok: false, erro: "A origem do pedido não muda depois de salvo." };
    }
    if (po.status === "cancelado") return { ok: false, erro: "Pedido cancelado não pode ser editado." };
    const { data: nota } = await admin
      .from("notas_entrada")
      .select("id")
      .eq("purchase_order_id", po.id)
      .maybeSingle();
    if (nota) {
      // PC-06
      return {
        ok: false,
        erro: "A nota de entrada já existe — itens, quantidades, custos, frete e desconto ficam bloqueados.",
      };
    }
    const { data: recebimentos } = await admin
      .from("purchase_receipts")
      .select("id")
      .eq("purchase_order_id", po.id)
      .limit(1);
    if ((recebimentos ?? []).length > 0) {
      return {
        ok: false,
        erro: "Este pedido já tem recebimento — itens, quantidades e custos ficam bloqueados.",
      };
    }

    const { error: erroUpd } = await admin
      .from("purchase_orders")
      .update({
        supplier_id: input.fornecedorId,
        total,
        frete,
        desconto,
        condicao,
        notes: notas,
      })
      .eq("id", po.id);
    if (erroUpd) return { ok: false, erro: `Falha ao salvar: ${erroUpd.message}` };

    const { error: erroDel } = await admin
      .from("purchase_order_items")
      .delete()
      .eq("purchase_order_id", po.id);
    if (erroDel) return { ok: false, erro: `Falha ao atualizar itens: ${erroDel.message}` };
    const { error: erroIns } = await admin.from("purchase_order_items").insert(
      itens.map((i) => {
        const item = catPorId.get(i.itemId)!;
        return {
          tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
          purchase_order_id: po.id,
          item_id: i.itemId,
          sku_snapshot: item.sku,
          name_snapshot: item.name,
          quantity: i.qty,
          unit_cost: i.custo,
          line_total: i.qty * i.custo,
        };
      })
    );
    if (erroIns) return { ok: false, erro: `Falha ao registrar itens: ${erroIns.message}` };

    if (origem === "importacao" && imp) {
      const { error: erroImp } = await admin.from("compra_importacao").upsert(
        {
          purchase_order_id: po.id,
          tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
          moeda: imp.moeda,
          cambio: imp.cambio,
          di: (input.importacao?.di ?? "").trim() || null,
          frete_int: imp.freteInt,
          seguro: imp.seguro,
          aliq_ii: imp.aliqIi,
          aliq_ipi: imp.aliqIpi,
          aliq_pis: imp.aliqPis,
          aliq_cofins: imp.aliqCofins,
          aliq_icms: imp.aliqIcms,
          despesas: imp.despesas,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "purchase_order_id" }
      );
      if (erroImp) return { ok: false, erro: `Falha na importação: ${erroImp.message}` };
    }

    await assegurarTransporte(admin, po.id, origem);
    await auditoria(admin, gestor.id, "compra.editada", "purchase_orders", po.id, {
      total,
      frete,
      desconto,
      condicao,
      itens: itens.length,
    });
    revalidatePath("/compras");
    revalidatePath("/portal/fornecedor");
    return { ok: true, aviso: "Pedido salvo.", codigo: po.code, compraId: po.id };
  }

  // ------------------------------------------------------------------ novo ----
  const poId = crypto.randomUUID();
  const codigo = await proximoCodigoPedido(admin);

  const { error: erroPo } = await admin.from("purchase_orders").insert({
    id: poId,
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    supplier_id: input.fornecedorId,
    code: codigo,
    origem,
    tipo: "pedido",
    total,
    frete,
    desconto,
    condicao,
    notes: notas,
    created_by: gestor.id,
    idempotency_key: poId,
  });
  if (erroPo) return { ok: false, erro: `Falha ao criar pedido: ${erroPo.message}` };

  const { error: erroItens } = await admin.from("purchase_order_items").insert(
    itens.map((i) => {
      const item = catPorId.get(i.itemId)!;
      return {
        tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
        purchase_order_id: poId,
        item_id: i.itemId,
        sku_snapshot: item.sku,
        name_snapshot: item.name,
        quantity: i.qty,
        unit_cost: i.custo,
        line_total: i.qty * i.custo,
      };
    })
  );
  if (erroItens) {
    await admin.from("purchase_orders").delete().eq("id", poId);
    return { ok: false, erro: `Falha ao registrar itens: ${erroItens.message}` };
  }

  if (origem === "importacao" && imp) {
    const { error: erroImp } = await admin.from("compra_importacao").insert({
      purchase_order_id: poId,
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      moeda: imp.moeda,
      cambio: imp.cambio,
      di: (input.importacao?.di ?? "").trim() || null,
      frete_int: imp.freteInt,
      seguro: imp.seguro,
      aliq_ii: imp.aliqIi,
      aliq_ipi: imp.aliqIpi,
      aliq_pis: imp.aliqPis,
      aliq_cofins: imp.aliqCofins,
      aliq_icms: imp.aliqIcms,
      despesas: imp.despesas,
    });
    if (erroImp) {
      await admin.from("purchase_order_items").delete().eq("purchase_order_id", poId);
      await admin.from("purchase_orders").delete().eq("id", poId);
      return { ok: false, erro: `Falha na importação: ${erroImp.message}` };
    }
  }

  // PC-03: numero (sequence), transporte inicial e primeiro evento
  await assegurarTransporte(admin, poId, origem, "Pedido de compra emitido");

  await auditoria(admin, gestor.id, "compra.criada", "purchase_orders", poId, {
    codigo,
    origem,
    total,
    condicao,
    itens: itens.length,
  });

  revalidatePath("/compras");
  revalidatePath("/portal/fornecedor");
  return { ok: true, codigo, compraId: poId, aviso: `Pedido ${codigo} criado.` };
}

// -------------------------------------------------------------------- PC-07 --
export async function enviarPedidoFornecedor(compraId: string): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  if (!ehUuid(compraId ?? "")) return { ok: false, erro: "Pedido inválido." };

  const admin = createAdminClient();
  const { data: po } = await admin
    .from("purchase_orders")
    .select("id, code, total, status, supplier_id, suppliers(contact_email, user_id)")
    .eq("id", compraId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!po) return { ok: false, erro: "Pedido não encontrado." };
  if (po.status === "cancelado") return { ok: false, erro: "Pedido cancelado não pode ser enviado." };

  const fornRaw = po.suppliers as unknown;
  const forn = (Array.isArray(fornRaw) ? fornRaw[0] : fornRaw) as {
    contact_email?: string | null;
    user_id?: string | null;
  } | null;

  let destino = forn?.contact_email ?? null;
  if (!destino && forn?.user_id) {
    const { data: perfil } = await admin
      .from("profiles")
      .select("email")
      .eq("id", forn.user_id)
      .maybeSingle();
    destino = perfil?.email ?? null;
  }
  destino = (destino ?? "").trim().toLowerCase() || null;
  if (!destino || !ehEmail(destino)) {
    return { ok: false, erro: "O fornecedor não tem e-mail válido — informe o e-mail dele antes de enviar." };
  }

  // PC-07 grava cada envio (a tela mostra "Pedido enviado N× · último em …")
  const { error: erroEnvio } = await admin.from("compra_envios").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    purchase_order_id: po.id,
    para: destino,
  });
  if (erroEnvio) return { ok: false, erro: `Falha ao registrar o envio: ${erroEnvio.message}` };

  // Pendência: o "PDF" hoje é o HTML do template (sem lib de PDF em serverless).
  const tpl = templatePedidoCompra(po.code, Number(po.total));
  await enviarEmail(destino, tpl.assunto, tpl.html, {
    actorUserId: gestor.id,
    relatedEntity: "purchase_orders",
    relatedId: po.id,
  });

  await auditoria(admin, gestor.id, "compra.enviada", "purchase_orders", po.id, { para: destino });
  revalidatePath("/compras");
  return { ok: true, aviso: `Pedido ${po.code} enviado para ${destino}.` };
}

// -------------------------------------------------------------------- NE-01 --
// Mock da distribuição DF-e: insere 2 notas de exemplo (upsert idempotente).
// Sem mock, falha fechado (pendência: distribuição real exige A1).
export async function sincronizarNotasRecebidas(): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  const bloqueado = exigirMock();
  if (bloqueado) return bloqueado;

  const admin = createAdminClient();
  const agora = new Date();

  // itens de exemplo batem com o catálogo real (best-effort): sem catálogo a
  // nota nasce sem itens e a comparação NE-04 assinala tudo como divergência.
  const { data: cat } = await admin
    .from("catalog_items")
    .select("sku, name")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("active", true)
    .limit(2);
  const itensDemo: ItemNotaXml[] = (cat ?? []).map((c, i) => ({
    codigo: c.sku,
    descricao: c.name,
    qtd: 10 * (i + 1),
    custo: 12.5 * (i + 1),
  }));

  const chaves = [900001, 900002].map((numero) => {
    const montada = montarChave44({
      uf: "SP",
      serie: 1,
      numero,
      ambiente: "homologacao",
      cnpjEmitente: "11222333000181",
    });
    return { numero, chave: montada.ok ? montada.chave : null };
  });

  const linhas = chaves
    .filter((c): c is { numero: number; chave: string } => !!c.chave)
    .map((c, idx) => ({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      chave: c.chave,
      numero: String(c.numero),
      serie: "1",
      emitente_cnpj: "11222333000181",
      emitente_nome: "Distribuidora Papel Show Ltda",
      emitente_uf: "SP",
      emitida_em: new Date(agora.getTime() - (idx + 1) * 86400000).toISOString(),
      valor_total: idx === 0 ? 1234.56 : 876.44,
      manifestacao: "pendente",
      itens: itensDemo.length > 0 ? itensDemo : null,
    }));
  if (linhas.length === 0) return { ok: false, erro: "Falha ao montar as notas de exemplo." };

  const { data, error } = await admin
    .from("nfe_recebidas")
    .upsert(linhas, { onConflict: "tenant_id,chave", ignoreDuplicates: true })
    .select("id");
  if (error) return { ok: false, erro: `Falha na distribuição DF-e: ${error.message}` };

  const n = (data ?? []).length;
  await auditoria(admin, gestor.id, "compra.dfe_sincronizada", "nfe_recebidas", null, { novas: n });
  revalidatePath("/compras");
  return {
    ok: true,
    aviso: n > 0 ? `${n} nota(s) nova(s) na distribuição DF-e.` : "Nenhuma nota nova — a distribuição já estava em dia.",
  };
}

// ------------------------------------------------------------------- NE-03 --
// Vincular = ciência da operação (mock), XML item a item com o pedido
// (NE-04), CFOP 1102/2102 (5.8) e, se o transporte estava em 'aguardando',
// avança para 'transito' (NE-08: a nota indica que a mercadoria saiu).
export async function vincularNota(
  compraId: string,
  nfeRecebidaId: string
): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  const bloqueado = exigirMock();
  if (bloqueado) return bloqueado;
  if (!ehUuid(compraId ?? "")) return { ok: false, erro: "Pedido inválido." };
  if (!ehUuid(nfeRecebidaId ?? "")) return { ok: false, erro: "Nota inválida." };

  const admin = createAdminClient();

  const { data: po } = await admin
    .from("purchase_orders")
    .select("id, code, origem, status, supplier_id")
    .eq("id", compraId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!po) return { ok: false, erro: "Pedido não encontrado." };
  if (po.origem === "importacao") {
    return {
      ok: false,
      erro: "Pedido de importação: emita a NF-e de entrada (3102) após o desembaraço.",
    };
  }

  const { data: forn } = await admin
    .from("suppliers")
    .select("id, name, cnpj, uf")
    .eq("id", po.supplier_id)
    .maybeSingle();

  const { data: nfe } = await admin
    .from("nfe_recebidas")
    .select("id, chave, numero, serie, emitente_cnpj, emitente_nome, emitente_uf, emitida_em, itens, manifestacao, purchase_order_id")
    .eq("id", nfeRecebidaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!nfe) return { ok: false, erro: "Nota não encontrada." };
  if (nfe.manifestacao === "desconhecida") {
    return { ok: false, erro: "Esta nota foi desconhecida — não pode ser vinculada." };
  }
  if (nfe.purchase_order_id && nfe.purchase_order_id !== compraId) {
    return { ok: false, erro: "Esta nota já está vinculada a outro pedido." };
  }

  // NE-03: a nota se vincula por CNPJ — divergente de emitente é bloqueio.
  const cnpjNota = apenasDigitos(nfe.emitente_cnpj);
  const cnpjForn = apenasDigitos(forn?.cnpj);
  if (cnpjNota.length === 14 && cnpjForn.length === 14 && cnpjNota !== cnpjForn) {
    return {
      ok: false,
      erro: "A nota é de outro CNPJ (emitente " + cnpjNota + ", fornecedor " + cnpjForn + ").",
    };
  }

  const { data: jaTem } = await admin
    .from("notas_entrada")
    .select("id")
    .eq("purchase_order_id", compraId)
    .maybeSingle();
  if (jaTem) return { ok: false, erro: "Este pedido já tem nota de entrada." };

  const itensNota = Array.isArray(nfe.itens) ? (nfe.itens as ItemNotaXml[]) : [];
  if (itensNota.length === 0) {
    return {
      ok: false,
      erro: "A nota não tem itens — baixe o XML antes de vincular (pendência: certificado A1).",
    };
  }

  const { data: pois } = await admin
    .from("purchase_order_items")
    .select("sku_snapshot, name_snapshot, quantity, unit_cost")
    .eq("purchase_order_id", compraId)
    .order("created_at");
  const itensPedido: ItemPedidoCmp[] = (pois ?? []).map((p) => ({
    sku: p.sku_snapshot,
    nome: p.name_snapshot,
    qtd: p.quantity,
    custo: Number(p.unit_cost),
  }));
  if (itensPedido.length === 0) return { ok: false, erro: "O pedido não tem itens." };

  const divergencias = compararNotaComPedido(itensNota, itensPedido);
  const status = divergencias.length > 0 ? "divergente" : "ok";
  const cfop = cfopEntrada("nacional", forn?.uf ?? nfe.emitente_uf);

  const { error: erroNota } = await admin.from("notas_entrada").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    purchase_order_id: compraId,
    tipo: "fornecedor",
    nfe_recebida_id: nfe.id,
    numero: nfe.numero,
    serie: nfe.serie,
    chave: nfe.chave,
    cfop,
    status,
    divergencias,
    emitida_em: nfe.emitida_em,
  });
  if (erroNota) {
    if (/duplicate|conflict/i.test(erroNota.message)) {
      return { ok: false, erro: "Este pedido já tem nota de entrada." };
    }
    return { ok: false, erro: `Falha ao vincular a nota: ${erroNota.message}` };
  }

  await admin
    .from("nfe_recebidas")
    .update({ manifestacao: "ciencia", purchase_order_id: compraId })
    .eq("id", nfe.id);

  // NE-08
  const statusTransp = await assegurarTransporte(admin, compraId, po.origem);
  if (statusTransp === "aguardando") {
    await admin
      .from("compra_transporte")
      .update({ status: "transito", updated_at: new Date().toISOString() })
      .eq("purchase_order_id", compraId);
    await gravarEvento(
      admin,
      compraId,
      "transito",
      EVENTOS_TRANSPORTE["aguardando>transito"] ?? "Mercadoria em trânsito"
    );
  }

  await auditoria(admin, gestor.id, "compra.nota_vinculada", "purchase_orders", compraId, {
    nota: nfe.numero,
    cfop,
    status,
    divergencias: divergencias.length,
  });
  revalidatePath("/compras");
  return {
    ok: true,
    compraId,
    aviso:
      divergencias.length > 0
        ? `Nota vinculada com ${divergencias.length} divergência(s) — revise no editor.`
        : "Nota vinculada — comparação sem divergências.",
  };
}

// -------------------------------------------------------------------- NE-05 --
export async function aceitarDivergencia(compraId: string): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  if (!ehUuid(compraId ?? "")) return { ok: false, erro: "Pedido inválido." };

  const admin = createAdminClient();
  const { data: nota } = await admin
    .from("notas_entrada")
    .select("id, status, divergencias")
    .eq("purchase_order_id", compraId)
    .maybeSingle();
  if (!nota) return { ok: false, erro: "Este pedido não tem nota de entrada." };
  if (nota.status !== "divergente") {
    return { ok: false, erro: "Não há divergência pendente nesta nota." };
  }

  const { error } = await admin
    .from("notas_entrada")
    .update({ status: "ok", aceita_com: nota.divergencias })
    .eq("id", nota.id);
  if (error) return { ok: false, erro: `Falha ao aceitar: ${error.message}` };

  await auditoria(admin, gestor.id, "compra.divergencia_aceita", "purchase_orders", compraId, {
    divergencias: nota.divergencias,
  });
  revalidatePath("/compras");
  return { ok: true, compraId, aviso: "Divergência aceita — nota marcada como OK." };
}

export async function recusarNota(compraId: string): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  const bloqueado = exigirMock();
  if (bloqueado) return bloqueado;
  if (!ehUuid(compraId ?? "")) return { ok: false, erro: "Pedido inválido." };

  const admin = createAdminClient();
  const { data: nota } = await admin
    .from("notas_entrada")
    .select("id, numero, nfe_recebida_id")
    .eq("purchase_order_id", compraId)
    .maybeSingle();
  if (!nota) return { ok: false, erro: "Este pedido não tem nota de entrada." };

  const { error } = await admin.from("notas_entrada").delete().eq("id", nota.id);
  if (error) return { ok: false, erro: `Falha ao recusar a nota: ${error.message}` };

  if (nota.nfe_recebida_id) {
    // NE-05: Desconhecimento da operação na SEFAZ (mock) + desvincula.
    await admin
      .from("nfe_recebidas")
      .update({ manifestacao: "desconhecida", purchase_order_id: null })
      .eq("id", nota.nfe_recebida_id);
  }

  await auditoria(admin, gestor.id, "compra.nota_recusada", "purchase_orders", compraId, {
    nota: nota.numero,
  });
  revalidatePath("/compras");
  return { ok: true, compraId, aviso: "Nota recusada — a compra voltou para 'aguardando nota'." };
}

// -------------------------------------------------------------------- NE-06 --
// Nota de fornecedor sem pedido: gera EN-#### (tipo entrada_direta) com os
// itens do XML já mapeados ao catálogo e a nota vinculada.
export async function criarEntradaDireta(nfeRecebidaId: string): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  const bloqueado = exigirMock();
  if (bloqueado) return bloqueado;
  if (!ehUuid(nfeRecebidaId ?? "")) return { ok: false, erro: "Nota inválida." };

  const admin = createAdminClient();
  const { data: nfe } = await admin
    .from("nfe_recebidas")
    .select("id, chave, numero, serie, emitente_cnpj, emitente_nome, emitente_uf, emitida_em, itens, manifestacao, purchase_order_id")
    .eq("id", nfeRecebidaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!nfe) return { ok: false, erro: "Nota não encontrada." };
  if (nfe.purchase_order_id) return { ok: false, erro: "Esta nota já está vinculada a um pedido." };
  if (nfe.manifestacao === "desconhecida") {
    return { ok: false, erro: "Esta nota foi desconhecida." };
  }

  const itensNota = Array.isArray(nfe.itens) ? (nfe.itens as ItemNotaXml[]) : [];
  if (itensNota.length === 0) {
    return {
      ok: false,
      erro: "A nota não tem itens — baixe o XML antes de criar a entrada direta (pendência: A1).",
    };
  }
  const cnpjNota = apenasDigitos(nfe.emitente_cnpj);
  if (cnpjNota.length !== 14) return { ok: false, erro: "CNPJ do emitente inválido na nota." };

  // fornecedor por CNPJ (auto-cria se não existir — NE-06)
  const { data: todos } = await admin
    .from("suppliers")
    .select("id, name, cnpj")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID);
  let fornecedor = (todos ?? []).find((f) => apenasDigitos(f.cnpj) === cnpjNota) ?? null;
  if (!fornecedor) {
    const { data: criado, error: erroForn } = await admin
      .from("suppliers")
      .insert({
        tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
        name: nfe.emitente_nome,
        cnpj: cnpjNota,
        uf: nfe.emitente_uf ?? null,
      })
      .select("id, name, cnpj")
      .single();
    if (erroForn || !criado) {
      return { ok: false, erro: `Falha ao criar o fornecedor da nota: ${erroForn?.message}` };
    }
    fornecedor = criado;
  }

  // NE-09: de-para fornecedor > SKU do catálogo; sem match é erro.
  const { data: mapa } = await admin
    .from("supplier_item_map")
    .select("fornecedor_codigo, item_id")
    .eq("supplier_id", fornecedor.id);
  const porFornecedor = new Map<string, string>(
    (mapa ?? []).map((m) => [String(m.fornecedor_codigo).trim().toUpperCase(), m.item_id])
  );
  const { data: cat } = await admin
    .from("catalog_items")
    .select("id, sku, name")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("active", true);
  const porSku = new Map<string, { id: string; sku: string; name: string }>(
    (cat ?? []).map((c: { id: string; sku: string; name: string }) => [
      String(c.sku).trim().toUpperCase(),
      c,
    ])
  );

  type LinhaEn = { item_id: string; sku: string; nome: string; qtd: number; custo: number };
  const linhas: LinhaEn[] = [];
  const semDePara: string[] = [];
  for (const it of itensNota) {
    const codigo = (it.codigo ?? "").trim().toUpperCase();
    const qtd = Math.floor(Number(it.qtd));
    const custo = Number(it.custo);
    if (!codigo) continue;
    if (!Number.isFinite(qtd) || qtd < 1) {
      return { ok: false, erro: `Item ${codigo}: quantidade inválida na nota.` };
    }
    if (!Number.isFinite(custo) || custo < 0) {
      return { ok: false, erro: `Item ${codigo}: custo inválido na nota.` };
    }
    const itemId = porFornecedor.get(codigo) ?? porSku.get(codigo)?.id;
    const itemCat = porSku.get(codigo);
    if (!itemId || !itemCat) {
      semDePara.push(codigo);
      continue;
    }
    const anterior = linhas.find((l) => l.item_id === itemId);
    if (anterior) {
      anterior.qtd += qtd;
      anterior.custo = custo;
    } else {
      linhas.push({ item_id: itemId, sku: itemCat.sku, nome: itemCat.name, qtd, custo });
    }
  }
  if (linhas.length === 0) {
    return {
      ok: false,
      erro: "Nenhum item do XML corresponde ao catálogo — faça o de-para do fornecedor (NE-09) antes.",
    };
  }

  const poId = crypto.randomUUID();
  const codigo = await proximoCodigoEntradaDireta(admin);
  const mercadorias = linhas.reduce((acc, l) => acc + l.qtd * l.custo, 0);
  const total = resumoNacional(mercadorias, 0, 0).total;

  const { error: erroPo } = await admin.from("purchase_orders").insert({
    id: poId,
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    supplier_id: fornecedor.id,
    code: codigo,
    origem: "nacional",
    tipo: "entrada_direta",
    total,
    notes: `Entrada direta — NF ${nfe.numero}/${nfe.serie} de ${nfe.emitente_nome}`,
    created_by: gestor.id,
    idempotency_key: poId,
  });
  if (erroPo) return { ok: false, erro: `Falha ao criar a entrada direta: ${erroPo.message}` };

  const { error: erroItens } = await admin.from("purchase_order_items").insert(
    linhas.map((l) => ({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      purchase_order_id: poId,
      item_id: l.item_id,
      sku_snapshot: l.sku,
      name_snapshot: l.nome,
      quantity: l.qtd,
      unit_cost: l.custo,
      line_total: l.qtd * l.custo,
    }))
  );
  if (erroItens) {
    await admin.from("purchase_orders").delete().eq("id", poId);
    return { ok: false, erro: `Falha ao registrar os itens: ${erroItens.message}` };
  }

  // a mercadoria já está na loja (a nota existe): transporte nasce 'chegou'
  await admin.from("compra_transporte").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    purchase_order_id: poId,
    status: "chegou",
  });
  await gravarEvento(admin, poId, "chegou", "Entrada direta — mercadoria já na loja");

  // comparação honesta: itens fora do de-para ficam como divergência (NE-04)
  const divergencias = compararNotaComPedido(
    itensNota,
    linhas.map((l) => ({ sku: l.sku, nome: l.nome, qtd: l.qtd, custo: l.custo }))
  );
  const cfop = cfopEntrada("nacional", nfe.emitente_uf);
  const { error: erroNota } = await admin.from("notas_entrada").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    purchase_order_id: poId,
    tipo: "fornecedor",
    nfe_recebida_id: nfe.id,
    numero: nfe.numero,
    serie: nfe.serie,
    chave: nfe.chave,
    cfop,
    status: divergencias.length > 0 ? "divergente" : "ok",
    divergencias,
    emitida_em: nfe.emitida_em,
  });
  if (erroNota) {
    await admin.from("purchase_orders").delete().eq("id", poId);
    return { ok: false, erro: `Falha ao vincular a nota: ${erroNota.message}` };
  }

  await admin
    .from("nfe_recebidas")
    .update({ manifestacao: "ciencia", purchase_order_id: poId })
    .eq("id", nfe.id);

  await auditoria(admin, gestor.id, "compra.entrada_direta", "purchase_orders", poId, {
    codigo,
    nota: nfe.numero,
    itens: linhas.length,
    sem_de_para: semDePara,
  });
  revalidatePath("/compras");
  const aviso =
    `Entrada direta ${codigo} criada com a nota vinculada.` +
    (semDePara.length > 0
      ? ` ${semDePara.length} item(ns) do XML sem de-para ficaram de fora (NE-09).`
      : "");
  return { ok: true, codigo, compraId: poId, aviso };
}

// -------------------------------------------------------------------- NE-07 --
export async function desconhecerNota(nfeRecebidaId: string): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  const bloqueado = exigirMock();
  if (bloqueado) return bloqueado;
  if (!ehUuid(nfeRecebidaId ?? "")) return { ok: false, erro: "Nota inválida." };

  const admin = createAdminClient();
  const { data: nfe } = await admin
    .from("nfe_recebidas")
    .select("id, numero, purchase_order_id")
    .eq("id", nfeRecebidaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!nfe) return { ok: false, erro: "Nota não encontrada." };
  if (nfe.purchase_order_id) {
    return { ok: false, erro: "Esta nota está vinculada a um pedido — recuse a nota pelo pedido." };
  }

  const { error } = await admin
    .from("nfe_recebidas")
    .update({ manifestacao: "desconhecida" })
    .eq("id", nfe.id);
  if (error) return { ok: false, erro: `Falha ao desconhecer: ${error.message}` };

  await auditoria(admin, gestor.id, "compra.nota_desconhecida", "nfe_recebidas", nfe.id, {
    nota: nfe.numero,
  });
  revalidatePath("/compras");
  return { ok: true, aviso: "Nota desconhecida — não aparece mais como pendência." };
}

// -------------------------------------------------------------------- NI-01 --
// Emite a própria NF-e de entrada (CFOP 3102) do pedido de importação.
// Só após o desembaraço (NI-02) e com DI/DUIMP (NI-03); nasce 'transmitida'
// e o consultarNotaEntrada faz o fluxo transmitida -> ok (NI-04, mock).
export async function emitirNotaEntradaImportacao(compraId: string): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  const bloqueado = exigirMock();
  if (bloqueado) return bloqueado;
  if (!ehUuid(compraId ?? "")) return { ok: false, erro: "Pedido inválido." };

  const admin = createAdminClient();
  const { data: po } = await admin
    .from("purchase_orders")
    .select("id, code, origem, status")
    .eq("id", compraId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!po) return { ok: false, erro: "Pedido não encontrado." };
  if (po.origem !== "importacao") {
    return { ok: false, erro: "Pedido nacional: vincule a nota do fornecedor (aba Notas recebidas)." };
  }

  const { data: jaTem } = await admin
    .from("notas_entrada")
    .select("id")
    .eq("purchase_order_id", compraId)
    .maybeSingle();
  if (jaTem) return { ok: false, erro: "Este pedido já tem nota de entrada." };

  const statusTransp = await assegurarTransporte(admin, compraId, po.origem);
  if (!["desembaraco", "liberado", "transito", "chegou"].includes(statusTransp)) {
    return {
      ok: false,
      erro: "A nota de entrada é emitida quando a carga entra em desembaraço.",
    };
  }

  const { data: imp } = await admin
    .from("compra_importacao")
    .select("di")
    .eq("purchase_order_id", compraId)
    .maybeSingle();
  if (!(imp?.di ?? "").trim()) {
    return { ok: false, erro: "Informe o número da DI ou DUIMP para emitir a nota de entrada." };
  }

  // emitente = a loja (mesmo caminho da emissão de Vendas)
  const { data: emp } = await admin
    .from("tenant_company")
    .select("cnpj, endereco")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  const cnpjLoja = apenasDigitos(emp?.cnpj);
  if (cnpjLoja.length !== 14) {
    return { ok: false, erro: "Cadastre a emitente (Configurações → Empresa) antes de emitir." };
  }
  const ufLoja = ((emp?.endereco as { uf?: string } | null)?.uf ?? "").trim();
  const { data: cfg } = await admin
    .from("sefaz_config")
    .select("ambiente")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  const ambiente = cfg?.ambiente === "producao" ? "producao" : "homologacao";

  // numero sequencial entre as notas próprias (nunca reutiliza)
  const { data: proprias } = await admin
    .from("notas_entrada")
    .select("numero")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("tipo", "propria");
  let proximo = 1;
  for (const p of proprias ?? []) {
    const n = parseInt(String(p.numero), 10);
    if (Number.isFinite(n) && n >= proximo) proximo = n + 1;
  }

  const montada = montarChave44({
    uf: ufLoja,
    cnpjEmitente: cnpjLoja,
    serie: 1,
    numero: proximo,
    ambiente,
  });
  if (!montada.ok) return { ok: false, erro: montada.erro };

  const { error: erroNota } = await admin.from("notas_entrada").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    purchase_order_id: compraId,
    tipo: "propria",
    numero: String(proximo),
    serie: "1",
    chave: montada.chave,
    cfop: "3102",
    status: "transmitida",
    divergencias: [],
    emitida_em: new Date().toISOString(),
  });
  if (erroNota) return { ok: false, erro: `Falha ao emitir a nota de entrada: ${erroNota.message}` };

  await auditoria(admin, gestor.id, "compra.nfe_entrada_emitida", "purchase_orders", compraId, {
    numero: proximo,
    cfop: "3102",
    di: imp?.di,
  });
  revalidatePath("/compras");
  return {
    ok: true,
    compraId,
    codigo: String(proximo),
    aviso: `NF-e de entrada ${proximo} transmitida — consulte o resultado para autorizar.`,
  };
}

// -------------------------------------------------------------------- NI-04 --
export async function consultarNotaEntrada(compraId: string): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  const bloqueado = exigirMock();
  if (bloqueado) return bloqueado;
  if (!ehUuid(compraId ?? "")) return { ok: false, erro: "Pedido inválido." };

  const admin = createAdminClient();
  const { data: nota } = await admin
    .from("notas_entrada")
    .select("id, tipo, numero, status")
    .eq("purchase_order_id", compraId)
    .maybeSingle();
  if (!nota) return { ok: false, erro: "Este pedido não tem nota de entrada." };
  if (nota.tipo !== "propria") {
    return { ok: false, erro: "Nota do fornecedor não precisa de consulta à SEFAZ." };
  }
  if (nota.status === "ok") return { ok: false, erro: "NF-e de entrada já está autorizada." };
  if (nota.status === "rejeitada") {
    return { ok: false, erro: "NF-e de entrada rejeitada — corrija os dados e emita novamente." };
  }
  if (nota.status !== "transmitida") {
    return { ok: false, erro: `Estado inesperado da nota (${nota.status}).` };
  }

  const { error } = await admin
    .from("notas_entrada")
    .update({ status: "ok" })
    .eq("id", nota.id);
  if (error) return { ok: false, erro: `Falha na consulta: ${error.message}` };

  await auditoria(admin, gestor.id, "compra.nfe_entrada_autorizada", "purchase_orders", compraId, {
    numero: nota.numero,
  });
  revalidatePath("/compras");
  return { ok: true, compraId, aviso: `NF-e de entrada ${nota.numero} autorizada.` };
}

// -------------------------------------------------------------- RC-01..RC-03 --
export type DadosTransporte = {
  transportadora?: string | null;
  codigo?: string | null;
  previsao?: string | null;
};

export async function atualizarTransporte(
  compraId: string,
  dados: DadosTransporte
): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  if (!ehUuid(compraId ?? "")) return { ok: false, erro: "Pedido inválido." };

  const previsaoBruta = (dados?.previsao ?? "").trim();
  if (previsaoBruta && !/^\d{4}-\d{2}-\d{2}$/.test(previsaoBruta)) {
    return { ok: false, erro: "Previsão inválida (use o formato AAAA-MM-DD)." };
  }

  const admin = createAdminClient();
  const { data: po } = await admin
    .from("purchase_orders")
    .select("id, origem, status")
    .eq("id", compraId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!po) return { ok: false, erro: "Pedido não encontrado." };
  if (po.status === "cancelado") return { ok: false, erro: "Pedido cancelado não tem transporte." };

  await assegurarTransporte(admin, compraId, po.origem);
  const { data: atual } = await admin
    .from("compra_transporte")
    .select("transportadora, codigo, previsao")
    .eq("purchase_order_id", compraId)
    .maybeSingle();

  const novo = {
    transportadora:
      dados?.transportadora !== undefined && dados?.transportadora !== null
        ? String(dados.transportadora).trim().slice(0, 120) || null
        : (atual?.transportadora ?? null),
    codigo:
      dados?.codigo !== undefined && dados?.codigo !== null
        ? String(dados.codigo).trim().slice(0, 80) || null
        : (atual?.codigo ?? null),
    previsao: previsaoBruta || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("compra_transporte")
    .update(novo)
    .eq("purchase_order_id", compraId);
  if (error) return { ok: false, erro: `Falha ao atualizar o transporte: ${error.message}` };

  await auditoria(admin, gestor.id, "compra.transporte_editado", "purchase_orders", compraId, {
    transportadora: novo.transportadora,
    codigo: novo.codigo,
    previsao: novo.previsao,
  });
  revalidatePath("/compras");
  return { ok: true, compraId, aviso: "Transporte atualizado." };
}

export async function avancarTransporte(
  compraId: string,
  local?: string | null
): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  if (!ehUuid(compraId ?? "")) return { ok: false, erro: "Pedido inválido." };

  const admin = createAdminClient();
  const { data: po } = await admin
    .from("purchase_orders")
    .select("id, origem, status")
    .eq("id", compraId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!po) return { ok: false, erro: "Pedido não encontrado." };
  if (po.status === "cancelado") return { ok: false, erro: "Pedido cancelado." };

  const origem = po.origem === "importacao" ? "importacao" : "nacional";
  const atual = await assegurarTransporte(admin, compraId, origem);
  const proximo = proximoTransporte(origem, atual);
  if (!proximo) return { ok: false, erro: "O transporte já chegou — último passo registrado." };

  const { error } = await admin
    .from("compra_transporte")
    .update({ status: proximo, updated_at: new Date().toISOString() })
    .eq("purchase_order_id", compraId);
  if (error) return { ok: false, erro: `Falha ao avançar o transporte: ${error.message}` };

  const texto =
    EVENTOS_TRANSPORTE[`${atual}>${proximo}`] ?? ROTULOS_TRANSPORTE[proximo] ?? proximo;
  await gravarEvento(
    admin,
    compraId,
    proximo,
    texto,
    (local ?? "").trim().slice(0, 120) || null
  );

  await auditoria(admin, gestor.id, "compra.transporte_avancado", "purchase_orders", compraId, {
    de: atual,
    para: proximo,
  });
  revalidatePath("/compras");
  return { ok: true, compraId, aviso: `Transporte: ${ROTULOS_TRANSPORTE[proximo] ?? proximo}.` };
}

// ------------------------------------------------------------------ RC-05..07 --
// Conclui a conferência: exige nota 'ok' e transporte 'chegou', manda a
// recepção para a RPC purchase_receive (p_conferido=true) e registra as
// diferenças "Produto X: esperado N, recebido M" no campo de notas.
export async function concluirRecebimento(
  compraId: string,
  recebidos: Record<string, number>
): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  if (!ehUuid(compraId ?? "")) return { ok: false, erro: "Pedido inválido." };

  const admin = createAdminClient();
  const { data: po } = await admin
    .from("purchase_orders")
    .select("id, code, origem, status")
    .eq("id", compraId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!po) return { ok: false, erro: "Pedido não encontrado." };
  if (po.status === "cancelado") return { ok: false, erro: "Pedido cancelado." };

  // RC-05: nota 'ok' com mensagem própria por origem
  const { data: nota } = await admin
    .from("notas_entrada")
    .select("id, status, tipo, numero, nfe_recebida_id")
    .eq("purchase_order_id", compraId)
    .maybeSingle();
  const semNota = po.origem === "importacao"
    ? "Emita a NF-e de entrada antes de concluir."
    : "Vincule a nota do fornecedor antes de concluir o recebimento.";
  if (!nota) return { ok: false, erro: semNota };
  if (nota.status !== "ok") {
    if (nota.status === "divergente") {
      return { ok: false, erro: "A nota está divergente — aceite ou recuse antes de concluir." };
    }
    if (nota.status === "transmitida") {
      return { ok: false, erro: "A NF-e de entrada ainda está transmitindo — consulte o resultado." };
    }
    return { ok: false, erro: "A nota de entrada não está autorizada." };
  }

  const statusTransp = await assegurarTransporte(admin, compraId, po.origem);
  if (statusTransp !== "chegou") {
    return {
      ok: false,
      erro: "Registre a chegada da mercadoria (transporte 'chegou') antes de concluir.",
    };
  }

  const { data: pois } = await admin
    .from("purchase_order_items")
    .select("id, item_id, sku_snapshot, name_snapshot, quantity, unit_cost, qtd_recebida")
    .eq("purchase_order_id", compraId)
    .order("created_at");
  if (!pois || pois.length === 0) return { ok: false, erro: "O pedido não tem itens." };

  // esperado: da nota (itens do XML) senão do pedido (RC-04)
  let itensNota: ItemNotaXml[] | null = null;
  if (nota.nfe_recebida_id) {
    const { data: nfe } = await admin
      .from("nfe_recebidas")
      .select("itens")
      .eq("id", nota.nfe_recebida_id)
      .maybeSingle();
    if (Array.isArray(nfe?.itens)) itensNota = nfe.itens as ItemNotaXml[];
  }
  const esperadoDe = (sku: string, quantidade: number): number => {
    const hit = itensNota?.find(
      (n) => (n.codigo ?? "").trim().toUpperCase() === sku.trim().toUpperCase()
    );
    return hit ? Number(hit.qtd ?? 0) : quantidade;
  };

  const porChave = new Map<string, (typeof pois)[number]>();
  for (const p of pois) {
    porChave.set(p.id, p);
    porChave.set(p.item_id, p);
  }

  const pItems: { purchase_order_item_id: string; quantity: number }[] = [];
  const diffs: string[] = [];
  const recebidoPorId = new Map<string, number>();
  for (const p of pois) {
    const bruto = recebidos?.[p.id] ?? recebidos?.[p.item_id] ?? 0;
    const qty = Math.floor(Number(bruto));
    if (!Number.isFinite(qty) || qty < 0) {
      return { ok: false, erro: `Quantidade inválida para ${p.sku_snapshot}.` };
    }
    const pendente = p.quantity - p.qtd_recebida;
    if (qty > pendente) {
      return {
        ok: false,
        erro: `Recebido acima do pedido: ${p.sku_snapshot} — pendente ${pendente}.`,
      };
    }
    const totalApos = p.qtd_recebida + qty;
    const esperado = esperadoDe(p.sku_snapshot, p.quantity);
    if (totalApos !== esperado) {
      diffs.push(`Produto ${p.name_snapshot}: esperado ${esperado}, recebido ${totalApos}`);
    }
    recebidoPorId.set(p.id, qty);
    if (qty >= 1) pItems.push({ purchase_order_item_id: p.id, quantity: qty });
  }
  if (pItems.length === 0) {
    return { ok: false, erro: "Informe a quantidade recebida de ao menos um item." };
  }

  const { data: rpc, error } = await admin.rpc("purchase_receive", {
    p_purchase_order_id: compraId,
    p_items: pItems,
    p_idempotency_key: crypto.randomUUID(),
    p_notes: diffs.length > 0 ? diffs.join("; ") : null,
    p_created_by: gestor.id,
    p_conferido: true,
  });
  if (error) {
    const m = error.message ?? "";
    const acima = /QTD_ACIMA_DO_PEDIDO: (.+?) \(pendente (\d+)\)/.exec(m);
    if (acima) {
      return { ok: false, erro: `Recebido acima do pedido: ${acima[1]} — pendente ${acima[2]}.` };
    }
    if (m.includes("NOTA_OBRIGATORIA")) return { ok: false, erro: semNota };
    if (m.includes("RECEBIMENTO_VAZIO")) {
      return { ok: false, erro: "Informe a quantidade recebida de ao menos um item." };
    }
    if (m.includes("PO_NAO_RECEBIVEL")) {
      return { ok: false, erro: "Este pedido não está mais em recebimento." };
    }
    if (m.includes("IMPORTACAO_SEM_DADOS")) {
      return { ok: false, erro: "Dados de importação ausentes — preencha a aba de importação." };
    }
    if (m.includes("VALOR_PARCELA_INVALIDA")) {
      return { ok: false, erro: "Condição de pagamento gera parcela de valor zero." };
    }
    if (m.includes("QUANTIDADE_INVALIDA")) return { ok: false, erro: "Quantidade inválida." };
    if (m.includes("ITEM_FORA_DO_PEDIDO")) return { ok: false, erro: "Item fora do pedido." };
    if (m.includes("PEDIDO_INEXISTENTE")) return { ok: false, erro: "Pedido não encontrado." };
    return { ok: false, erro: m || "Falha ao concluir o recebimento." };
  }

  // RC-06: Confirmação da operação na SEFAZ (best-effort, só em mock)
  if (nota.nfe_recebida_id && sefazEmMock()) {
    await admin
      .from("nfe_recebidas")
      .update({ manifestacao: "confirmada" })
      .eq("id", nota.nfe_recebida_id);
  }

  await auditoria(admin, gestor.id, "compra.recebimento_concluido", "purchase_orders", compraId, {
    itens: pItems.length,
    divergencias: diffs,
    receipt_id: (rpc as { receipt_id?: string } | null)?.receipt_id ?? null,
  });
  revalidatePath("/compras");
  revalidatePath("/financeiro");
  const total = Number((rpc as { total?: number } | null)?.total ?? 0);
  return {
    ok: true,
    compraId,
    aviso:
      `Recebimento concluído — total R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.` +
      (diffs.length > 0 ? ` ${diffs.length} divergência(s) registrada(s).` : ""),
  };
}

// --------------------------------------------------------------------- 5.6 ---
// Marca uma parcela de título a pagar (gerado pelo purchase_receive) como
// paga, via financial_settle (mesma RPC do /financeiro).
export async function marcarParcelaPaga(
  parcelaId: string,
  metodo = "boleto"
): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };
  if (!ehUuid(parcelaId ?? "")) return { ok: false, erro: "Parcela inválida." };
  const METODOS = ["pix", "cartao", "debito", "dinheiro", "boleto", "transferencia"];
  if (!METODOS.includes(metodo)) return { ok: false, erro: "Método de pagamento inválido." };

  const admin = createAdminClient();
  const { data: par } = await admin
    .from("financial_installments")
    .select("id, number, status, principal_amount, paid_amount, title_id")
    .eq("id", parcelaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!par) return { ok: false, erro: "Parcela não encontrada." };

  const { data: tit } = await admin
    .from("financial_titles")
    .select("source_type, direction")
    .eq("id", par.title_id)
    .maybeSingle();
  if (!tit || tit.source_type !== "purchase_receipt" || tit.direction !== "payable") {
    return { ok: false, erro: "Esta parcela não é de um título de compra." };
  }
  if (par.status === "liquidado" || par.status === "cancelado") {
    return { ok: false, erro: "Esta parcela já está encerrada." };
  }
  const saldo = Number(par.principal_amount) - Number(par.paid_amount);
  if (!(saldo > 0)) return { ok: false, erro: "Esta parcela já está liquidada." };

  const { error } = await admin.rpc("financial_settle", {
    p_installment_id: parcelaId,
    p_amount: saldo,
    p_method: metodo,
    p_idempotency_key: crypto.randomUUID(),
    p_notes: "Parcela de compra marcada como paga no console.",
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("SOBRELIQUIDACAO")) {
      return { ok: false, erro: "Valor acima do saldo em aberto desta parcela." };
    }
    if (m.includes("PARCELA_ENCERRADA")) return { ok: false, erro: "Esta parcela já está paga." };
    if (m.includes("PARCELA_INEXISTENTE")) return { ok: false, erro: "Parcela não encontrada." };
    if (m.includes("METODO_INVALIDO")) return { ok: false, erro: "Método de pagamento inválido." };
    return { ok: false, erro: m || "Falha ao liquidar a parcela." };
  }

  await auditoria(admin, gestor.id, "compra.parcela_paga", "financial_installments", parcelaId, {
    numero: par.number,
    valor: saldo,
    metodo,
  });
  revalidatePath("/compras");
  revalidatePath("/financeiro");
  return { ok: true, aviso: `Parcela ${par.number} marcada como paga.` };
}