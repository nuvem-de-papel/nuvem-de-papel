"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { PAPEIS_OPERACIONAIS } from "@/lib/rbac";

// Server Actions da logística (F4): avanço da fila de expedição, cancelamento
// de pedido que nunca pagou (devolve a reserva) e movimentos manuais de
// estoque (entrada/devolucao/ajuste). Tudo auditado; o ledger só aceita
// escrita pela função register_stock_movement (0007).

export type ResultadoLogistica = { ok: true; msg: string } | { ok: false; erro: string };

const TRANSICAO_EXPEDICAO: Record<string, string> = {
  pago: "processando",
  processando: "em_rota",
  em_rota: "entregue",
};

function ehUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function exigirOperador(): Promise<
  { erro: string } | { userId: string; admin: ReturnType<typeof createAdminClient> }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada. Entre novamente." };

  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil || perfil.status !== "ativo" || !PAPEIS_OPERACIONAIS.includes(perfil.role)) {
    return { erro: "Sem permissão para operar a logística." };
  }
  return { userId: user.id, admin };
}

async function auditar(
  admin: ReturnType<typeof createAdminClient>,
  actor: string,
  action: string,
  entity: string,
  entityId: string | null,
  depois: Record<string, unknown>
): Promise<void> {
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: actor,
    action,
    entity,
    entity_id: entityId,
    after: depois,
  });
}

export async function avancarExpedicao(
  pedidoId: string,
  de: string,
  para: string
): Promise<ResultadoLogistica> {
  if (!ehUuid(pedidoId)) return { ok: false, erro: "Pedido inválido." };
  if (TRANSICAO_EXPEDICAO[de] !== para) return { ok: false, erro: "Transição inválida." };

  const acesso = await exigirOperador();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data, error } = await admin
    .from("orders")
    .update({ status: para })
    .eq("id", pedidoId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .in("status", [de])
    .select("id, status");
  if (error) return { ok: false, erro: `Falha ao atualizar: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: false, erro: "Pedido mudou de situação — atualize a lista." };
  }

  await auditar(admin, userId, "logistica.avancar", "orders", pedidoId, {
    de,
    para,
  });
  revalidatePath("/logistica");
  return { ok: true, msg: `Pedido marcado como ${para.replace("_", " ")}.` };
}

export async function cancelarPedidoNaoPago(pedidoId: string): Promise<ResultadoLogistica> {
  if (!ehUuid(pedidoId)) return { ok: false, erro: "Pedido inválido." };

  const acesso = await exigirOperador();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data, error } = await admin
    .from("orders")
    .update({ status: "cancelado" })
    .eq("id", pedidoId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .in("status", ["aguardando_pagamento"])
    .select("id");
  if (error) return { ok: false, erro: `Falha ao cancelar: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: false, erro: "Só dá para cancelar pedido que ainda aguarda pagamento." };
  }

  // devolve a reserva (idempotente — 0007)
  const { error: erroLibera } = await admin.rpc("release_order_stock", { p_order_id: pedidoId });
  if (erroLibera) {
    return { ok: false, erro: `Pedido cancelado, mas falhou ao devolver estoque: ${erroLibera.message}` };
  }

  await auditar(admin, userId, "logistica.cancelado", "orders", pedidoId, { de: "aguardando_pagamento" });
  revalidatePath("/logistica");
  revalidatePath("/produtos");
  return { ok: true, msg: "Pedido cancelado e estoque reservado devolvido." };
}

export async function registrarMovimentoEstoque(
  itemId: string,
  tipo: string,
  quantidade: number,
  notas: string
): Promise<ResultadoLogistica> {
  if (!ehUuid(itemId)) return { ok: false, erro: "Item inválido." };
  if (!["entrada", "devolucao", "ajuste"].includes(tipo)) return { ok: false, erro: "Tipo inválido." };

  const q = Math.trunc(Number(quantidade));
  if (!Number.isFinite(q) || q === 0 || Math.abs(q) > 99999) {
    return { ok: false, erro: "Quantidade inválida (use um inteiro ≠ 0, máx. 99.999)." };
  }
  if (tipo !== "ajuste" && q < 1) {
    return { ok: false, erro: "Entrada/devolução exigem quantidade positiva." };
  }

  const acesso = await exigirOperador();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { error } = await admin.rpc("register_stock_movement", {
    p_item_id: itemId,
    p_type: tipo,
    p_quantity: q,
    p_reference_type: "manual",
    p_reference_id: null,
    p_notes: notas?.trim() ? notas.trim().slice(0, 200) : null,
    p_created_by: userId,
  });
  if (error) {
    if ((error.message ?? "").includes("ESTOQUE_INSUFICIENTE")) {
      return { ok: false, erro: "Saldo insuficiente para este ajuste (não deixa estoque negativo)." };
    }
    return { ok: false, erro: `Falha no movimento: ${error.message}` };
  }

  await auditar(admin, userId, `estoque.${tipo}`, "catalog_items", itemId, {
    quantidade: q,
    notas: notas?.trim() ? notas.trim().slice(0, 200) : null,
  });
  revalidatePath("/logistica");
  revalidatePath("/produtos");
  return { ok: true, msg: `Movimento de ${tipo} registrado (${q > 0 ? "+" : ""}${q}).` };
}
