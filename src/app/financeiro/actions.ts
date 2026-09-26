"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { PAPEIS_GESTAO } from "@/lib/rbac";

// Server Actions do financeiro (F5): liquidação de parcelas. Títulos e
// parcelas são criados pelas RPCs do PDV (0008); aqui só entrada
// validada + RBAC de gestão + auditoria.

export type ResultadoFinanceiro = { ok: true; msg: string } | { ok: false; erro: string };

const METODOS = ["pix", "cartao", "debito", "dinheiro", "boleto", "transferencia"];

const brl = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ehUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function exigirGestor(): Promise<
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
  if (!perfil || perfil.status !== "ativo" || !PAPEIS_GESTAO.includes(perfil.role)) {
    return { erro: "Sem permissão para operar o financeiro." };
  }
  return { userId: user.id, admin };
}

export async function liquidarParcela(
  parcelaId: string,
  valor: number,
  metodo: string,
  notas: string
): Promise<ResultadoFinanceiro> {
  if (!ehUuid(parcelaId)) return { ok: false, erro: "Parcela inválida." };
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0 || v > 999999) {
    return { ok: false, erro: "Valor inválido (maior que 0)." };
  }
  if (!METODOS.includes(metodo)) return { ok: false, erro: "Método inválido." };

  const acesso = await exigirGestor();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data, error } = await admin.rpc("financial_settle", {
    p_installment_id: parcelaId,
    p_amount: v,
    p_method: metodo,
    p_idempotency_key: crypto.randomUUID(),
    p_notes: notas?.trim() ? notas.trim().slice(0, 200) : null,
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("SOBRELIQUIDACAO")) {
      return { ok: false, erro: "Valor acima do saldo em aberto desta parcela." };
    }
    if (m.includes("PARCELA_ENCERRADA")) {
      return { ok: false, erro: "Parcela já encerrada." };
    }
    return { ok: false, erro: m || "Falha ao liquidar." };
  }

  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "financeiro.liquidacao",
    entity: "financial_installments",
    entity_id: parcelaId,
    after: {
      valor: v,
      metodo,
      status: data?.installment_status ?? null,
    },
  });
  revalidatePath("/financeiro");
  const status = String(data?.installment_status ?? "");
  return {
    ok: true,
    msg:
      status === "liquidado"
        ? `Parcela liquidada (${brl(v)}).`
        : `Recebimento parcial de ${brl(v)} registrado.`,
  };
}
