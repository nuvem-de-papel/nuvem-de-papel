"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { executarReativacao } from "@/lib/reativacao";
import { executarAvaliacoes } from "@/lib/avaliacoes";

// Server Actions do console de marketing (entrega 4: reativação + avaliações).
// Disparo automático: /api/cron/marketing (secret CRON_SECRET). Aqui só o botão
// manual + gestão de reclamações (marcar/resolver). Reclamação é marcada à mão
// pelo dono — detecção automática por IA fica pra etapa 2 (sem provedor no stack).

export type ResultadoMarketing =
  | { ok: true; msg: string }
  | { ok: false; erro: string };

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
    return { erro: "Sem permissão para operar o marketing." };
  }
  return { userId: user.id, admin };
}

export async function executarMarketingManual(): Promise<ResultadoMarketing> {
  const gestor = await exigirGestor();
  if ("erro" in gestor) return { ok: false, erro: gestor.erro };

  const [rea, ava] = await Promise.all([executarReativacao(), executarAvaliacoes()]);
  const msg =
    `Reativação: ${rea.enviadas} enviado(s), ${rea.falhas} falha(s). ` +
    `Avaliações: ${ava.enviadas} enviado(s), ${ava.falhas} falha(s).`;
  revalidatePath("/crm/marketing");
  return { ok: true, msg };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function marcarReclamacao(
  reviewId: string,
  ehReclamacao: boolean
): Promise<ResultadoMarketing> {
  const gestor = await exigirGestor();
  if ("erro" in gestor) return { ok: false, erro: gestor.erro };
  if (!UUID_RE.test(reviewId)) return { ok: false, erro: "Pedido inválido." };

  const { error } = await gestor.admin
    .from("review_requests")
    .update({ reclamacao: ehReclamacao, resolvida: ehReclamacao ? false : false })
    .eq("id", reviewId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID);
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/crm/marketing");
  return { ok: true, msg: ehReclamacao ? "Marcada como reclamação." : "Reclamação removida." };
}

export async function resolverReclamacao(
  reviewId: string,
  resolvida: boolean
): Promise<ResultadoMarketing> {
  const gestor = await exigirGestor();
  if ("erro" in gestor) return { ok: false, erro: gestor.erro };
  if (!UUID_RE.test(reviewId)) return { ok: false, erro: "Pedido inválido." };

  const { error } = await gestor.admin
    .from("review_requests")
    .update({ resolvida })
    .eq("id", reviewId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID);
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/crm/marketing");
  return { ok: true, msg: resolvida ? "Reclamação resolvida." : "Reaberta." };
}
