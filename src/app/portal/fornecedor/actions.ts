"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Recebimento de pedido de compra pelo fornecedor (F6). A escrita vai pela RPC
// purchase_receive (service_role): idempotência, trava no PO, validação de
// quantidade, entrada no livro de estoque e título a pagar.

export type ResultadoRecebimento =
  | { ok: true; total: number; duplicate: boolean }
  | { ok: false; erro: string };

function ehUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function registrarRecebimento(input: {
  poId: string;
  itens: { poiId: string; qty: number }[];
  notes?: string;
}): Promise<ResultadoRecebimento> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  if (!ehUuid(input.poId ?? "")) return { ok: false, erro: "Pedido inválido." };
  const brutas = Array.isArray(input.itens) ? input.itens : [];
  const itens: { poiId: string; qty: number }[] = [];
  for (const i of brutas) {
    if (!i || !ehUuid(String(i.poiId))) return { ok: false, erro: "Item inválido." };
    const qty = Math.floor(Number(i.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 999999) continue; // 0/nada: ignora
    itens.push({ poiId: i.poiId, qty });
  }
  if (itens.length === 0) return { ok: false, erro: "Informe a quantidade recebida." };

  const admin = createAdminClient();

  const { data: fornecedor } = await admin
    .from("suppliers")
    .select("id, name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!fornecedor) return { ok: false, erro: "Nenhum fornecedor vinculado ao seu usuário." };

  const { data: po } = await admin
    .from("purchase_orders")
    .select("id, supplier_id")
    .eq("id", input.poId)
    .maybeSingle();
  if (!po || po.supplier_id !== fornecedor.id) {
    return { ok: false, erro: "Pedido não pertence ao seu fornecedor." };
  }

  const { data, error } = await admin.rpc("purchase_receive", {
    p_purchase_order_id: input.poId,
    p_items: itens.map((i) => ({ purchase_order_item_id: i.poiId, quantity: i.qty })),
    p_idempotency_key: crypto.randomUUID(),
    p_notes: (input.notes ?? "").trim() || null,
    p_created_by: user.id,
  });
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/portal/fornecedor");
  revalidatePath("/financeiro");
  revalidatePath("/compras");
  return {
    ok: true,
    total: Number(data?.total ?? 0),
    duplicate: !!data?.duplicate,
  };
}
