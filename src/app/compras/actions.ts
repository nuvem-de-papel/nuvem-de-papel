"use server";

import { revalidatePath } from "next/cache";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { enviarEmail, templatePedidoCompra } from "@/lib/email";

// Compras (F6): fornecedores e pedidos de compra. Escrita deny-all no banco —
// tudo via service_role; recebimento em si acontece na RPC purchase_receive
// (portal do fornecedor) com idempotência e trava de linha no PO.

export type ResultadoAcao = { ok: true; aviso?: string } | { ok: false; erro: string };

type Gestor = { id: string; role: string };

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

export async function criarFornecedor(input: {
  nome: string;
  emailContato?: string;
  cnpj?: string;
  emailUsuario?: string;
}): Promise<ResultadoAcao> {
  const gestor = await gestaoAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para esta ação." };

  const nome = (input.nome ?? "").trim();
  const emailContato = (input.emailContato ?? "").trim().toLowerCase();
  const cnpj = (input.cnpj ?? "").trim();
  const emailUsuario = (input.emailUsuario ?? "").trim().toLowerCase();

  if (nome.length < 3) return { ok: false, erro: "Informe o nome do fornecedor." };
  if (emailContato && !ehEmail(emailContato)) return { ok: false, erro: "E-mail de contato inválido." };

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
  const codigo = `PC-${poId.slice(0, 8).toUpperCase()}`;
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
  return { ok: true };
}
