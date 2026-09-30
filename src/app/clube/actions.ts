"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { mpConfigurado, criarPreapproval, cancelarPreapproval } from "@/lib/mercadopago";
import { clubeEmModoMock } from "@/lib/clube";

// Clube de assinantes (F7). Escrita 100% via service_role + audit_log;
// revalida sessao no servidor antes de qualquer coisa (fail-closed).
// Ativacao da assinatura chega pelo webhook do MP (topico preapproval);
// cancelamento encerra o ciclo na hora e o preapproval e cancelado no MP
// best-effort (o estado local e a fonte da verdade).

export type ResultadoClube =
  | { ok: true }
  | { ok: false; erro: string };

function ehUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function usuarioAtual(): Promise<{ id: string; email: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
}

async function auditar(
  actorId: string,
  action: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: actorId,
    action,
    entity: "club_subscriptions",
    entity_id: entityId,
    before,
    after,
  });
}

export async function assinarPlano(planId: string): Promise<ResultadoClube> {
  if (!ehUuid(planId)) return { ok: false, erro: "Plano invalido." };
  const user = await usuarioAtual();
  if (!user) return { ok: false, erro: "Entre na sua conta para assinar o Clube." };

  const admin = createAdminClient();
  const { data: plano } = await admin
    .from("club_plans")
    .select("id, name, price_monthly, active")
    .eq("id", planId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!plano || !plano.active) {
    return { ok: false, erro: "Plano indisponivel no momento." };
  }

  const { data: existente } = await admin
    .from("club_subscriptions")
    .select("id, status")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("profile_id", user.id)
    .in("status", ["pendente", "ativa"])
    .maybeSingle();
  if (existente) {
    return {
      ok: false,
      erro:
        existente.status === "ativa"
          ? "Voce ja e assinante. Cancele a assinatura atual antes de trocar de plano."
          : "Voce ja tem uma assinatura em aberto. Aguarde a ativacao.",
    };
  }

  // fail-closed: producao sem token do MP nao vende assinatura sem meio de
  // pagamento (mesma regra do checkout); o modo mock roda so no ambiente local
  if (!mpConfigurado() && !clubeEmModoMock()) {
    return {
      ok: false,
      erro: "Clube indisponivel no momento - a ativacao online sera ligada em breve.",
    };
  }

  const assinaturaId = crypto.randomUUID();
  const { error: erroInsert } = await admin.from("club_subscriptions").insert({
    id: assinaturaId,
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    profile_id: user.id,
    plan_id: planId,
    status: "pendente",
  });
  if (erroInsert) {
    return { ok: false, erro: "Nao foi possivel iniciar a assinatura agora." };
  }

  let preapprovalId: string | null = null;
  if (mpConfigurado()) {
    const r = await criarPreapproval({
      subscriptionId: assinaturaId,
      payerEmail: user.email,
      reason: String(plano.name),
      transactionAmount: Number(plano.price_monthly),
    });
    if (!r.ok) {
      await admin.from("club_subscriptions").delete().eq("id", assinaturaId);
      return { ok: false, erro: "Nao foi possivel iniciar a assinatura no pagamento. Tente novamente." };
    }
    preapprovalId = r.preapprovalId;
  } else {
    // ambiente local de teste (MP_MOCK=1): id sintetico para o webhook de
    // teste do E2E ativar a assinatura
    preapprovalId = `mock-pre-${assinaturaId}`;
  }

  const { error: erroUpdate } = await admin
    .from("club_subscriptions")
    .update({ mp_preapproval_id: preapprovalId, updated_at: new Date().toISOString() })
    .eq("id", assinaturaId);
  if (erroUpdate) {
    return { ok: false, erro: "Falha ao registrar a assinatura. Tente novamente." };
  }

  await auditar(user.id, "clube.assinada", assinaturaId, null, {
    plan_id: planId,
    mp_preapproval_id: preapprovalId,
    status: "pendente",
  });
  revalidatePath("/clube");
  revalidatePath("/conta/assinatura");
  return { ok: true };
}

export async function cancelarAssinatura(): Promise<ResultadoClube> {
  const user = await usuarioAtual();
  if (!user) return { ok: false, erro: "Entre na sua conta." };

  const admin = createAdminClient();
  const { data: assinatura } = await admin
    .from("club_subscriptions")
    .select("id, status, mp_preapproval_id, plan_id")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("profile_id", user.id)
    .in("status", ["pendente", "ativa"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!assinatura) {
    return { ok: false, erro: "Voce nao tem assinatura ativa." };
  }

  const mpId = assinatura.mp_preapproval_id as string | null;
  if (mpId && !mpId.startsWith("mock-pre-")) {
    await cancelarPreapproval(mpId); // best-effort; estado local manda
  }

  const { error } = await admin
    .from("club_subscriptions")
    .update({ status: "cancelada", cancel_at_period_end: false, updated_at: new Date().toISOString() })
    .eq("id", assinatura.id)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID);
  if (error) {
    return { ok: false, erro: "Nao foi possivel cancelar agora. Tente novamente." };
  }

  await auditar(user.id, "clube.cancelada", assinatura.id, { status: assinatura.status }, { status: "cancelada" });
  revalidatePath("/conta/assinatura");
  revalidatePath("/clube");
  revalidatePath("/checkout");
  return { ok: true };
}
