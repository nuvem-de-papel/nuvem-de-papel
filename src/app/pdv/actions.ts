"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { PAPEIS_OPERACIONAIS } from "@/lib/rbac";

// Server Actions do PDV (F5): abertura/fechamento de caixa, suprimento/
// sangria e venda. Toda a regra de negócio (preço, estoque, gaveta, título)
// vive na RPC pdv_register_sale (0008) — aqui só validação de entrada,
// RBAC e auditoria.

export type ResultadoPdv =
  | { ok: true; msg: string; venda?: { pedido: string; total: number; titulo: string | null } }
  | { ok: false; erro: string };

const METODOS = ["dinheiro", "pix", "debito", "cartao"];
const CANAIS = ["varejo", "atacado"];

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
    return { erro: "Sem permissão para operar o PDV." };
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

function erroDaRpc(msg: string | undefined): string {
  const m = msg ?? "";
  if (m.includes("CAIXA_FECHADO")) return "Abra o caixa antes de operar.";
  if (m.includes("ESTOQUE_INSUFICIENTE")) return "Saldo insuficiente para um dos itens.";
  if (m.includes("SEM_PRECO_OU_INATIVO")) return "Item sem preço no canal escolhido ou inativo.";
  if (m.includes("CHAVE_IDEMPOTENCIA")) return "Falha interna de idempotência — tente de novo.";
  if (m.includes("CARRINHO_VAZIO")) return "Adicione ao menos um item à venda.";
  return m || "Falha na operação de PDV.";
}

const brl = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function abrirCaixa(valorAbertura: number): Promise<ResultadoPdv> {
  const valor = Number(valorAbertura);
  if (!Number.isFinite(valor) || valor < 0 || valor > 99999) {
    return { ok: false, erro: "Valor de abertura inválido (0 a 99.999)." };
  }

  const acesso = await exigirOperador();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data, error } = await admin.rpc("pdv_open_cash", {
    p_opening_amount: valor,
    p_operator_id: userId,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) return { ok: false, erro: erroDaRpc(error.message) };

  await auditar(admin, userId, "pdv.abertura", "caixa_sessions", String(data?.session_id ?? ""), {
    valor,
  });
  revalidatePath("/pdv");
  return { ok: true, msg: `Caixa aberto com fundo de ${brl(valor)}.` };
}

export async function fecharCaixa(valorContagem: number): Promise<ResultadoPdv> {
  const valor = Number(valorContagem);
  if (!Number.isFinite(valor) || valor < 0 || valor > 99999) {
    return { ok: false, erro: "Valor de contagem inválido (0 a 99.999)." };
  }

  const acesso = await exigirOperador();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data, error } = await admin.rpc("pdv_close_cash", { p_counted_amount: valor });
  if (error) return { ok: false, erro: erroDaRpc(error.message) };

  const esperado = Number(data?.expected ?? 0);
  const diferenca = Number(data?.difference ?? 0);
  await auditar(admin, userId, "pdv.fechamento", "caixa_sessions", String(data?.session_id ?? ""), {
    esperado,
    contado: valor,
    diferenca,
  });
  revalidatePath("/pdv");
  const msg =
    diferenca === 0
      ? `Caixa fechado. Bate-vale zerado (esperado ${brl(esperado)}).`
      : `Caixa fechado. Diferença de ${brl(diferenca)} (esperado ${brl(esperado)}, contado ${brl(valor)}).`;
  return { ok: true, msg };
}

export async function movimentoCaixa(
  tipo: string,
  valor: number,
  motivo: string
): Promise<ResultadoPdv> {
  if (!["suprimento", "sangria"].includes(tipo)) return { ok: false, erro: "Tipo inválido." };
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0 || v > 99999) {
    return { ok: false, erro: "Valor inválido (maior que 0, máx. 99.999)." };
  }

  const acesso = await exigirOperador();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data, error } = await admin.rpc("pdv_cash_supply", {
    p_type: tipo,
    p_amount: v,
    p_reason: motivo?.trim() ? motivo.trim().slice(0, 200) : null,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) return { ok: false, erro: erroDaRpc(error.message) };

  await auditar(admin, userId, `pdv.${tipo}`, "caixa_movements", String(data?.movement_id ?? ""), {
    valor: v,
    motivo: motivo?.trim() ? motivo.trim().slice(0, 200) : null,
  });
  revalidatePath("/pdv");
  return {
    ok: true,
    msg: `${tipo === "suprimento" ? "Suprimento" : "Sangria"} de ${brl(v)} registrado.`,
  };
}

export async function registrarVendaPdv(
  itens: { item_id: string; quantity: number }[],
  metodo: string,
  parcelas: number,
  canal: string
): Promise<ResultadoPdv> {
  if (!Array.isArray(itens) || itens.length === 0 || itens.length > 100) {
    return { ok: false, erro: "Carrinho inválido (1 a 100 itens)." };
  }
  for (const it of itens) {
    if (!it || !ehUuid(it.item_id)) return { ok: false, erro: "Item inválido no carrinho." };
    const q = Number(it.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 99999) {
      return { ok: false, erro: "Quantidade inválida (inteiro de 1 a 99.999)." };
    }
  }
  if (!METODOS.includes(metodo)) return { ok: false, erro: "Forma de pagamento inválida." };
  if (!CANAIS.includes(canal)) return { ok: false, erro: "Canal inválido." };
  const n = Number(parcelas);
  if (!Number.isInteger(n) || n < 1 || n > 12) return { ok: false, erro: "Parcelas inválidas." };
  if (metodo !== "cartao" && n !== 1) {
    return { ok: false, erro: "Parcelamento só no cartão de crédito." };
  }

  const acesso = await exigirOperador();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data, error } = await admin.rpc("pdv_register_sale", {
    p_items: itens.map((i) => ({ item_id: i.item_id, quantity: Number(i.quantity) })),
    p_payment_method: metodo,
    p_channel: canal,
    p_installments: n,
    p_customer_id: null,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) return { ok: false, erro: erroDaRpc(error.message) };

  const pedido = String(data?.order_id ?? "");
  const total = Number(data?.total ?? 0);
  const titulo = data?.title_id ? String(data.title_id) : null;

  await auditar(admin, userId, "pdv.venda", "orders", pedido, {
    total,
    metodo,
    parcelas: n,
    canal,
    itens: itens.length,
  });
  revalidatePath("/pdv");
  revalidatePath("/produtos");
  revalidatePath("/financeiro");
  return {
    ok: true,
    msg: `Venda registrada: ${brl(total)} em ${metodo}${n > 1 ? ` em ${n}x` : ""}.`,
    venda: { pedido, total, titulo },
  };
}
