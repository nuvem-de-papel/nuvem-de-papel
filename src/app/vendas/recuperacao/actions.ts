"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { executarReguaRecuperacao, type ResumoRecuperacao } from "@/lib/cart-recovery";

// Server Actions da recuperação de carrinho abandonado (0036). O motor roda em
// src/lib/cart-recovery.ts; aqui só RBAC de gestão + chamada. Disparo automático:
// /api/cron/recuperacao (secret CRON_SECRET). O executarRecuperacaoManual é o
// botão do painel.

export type ResultadoRecuperacao =
  | { ok: true; msg: string; resumo?: ResumoRecuperacao }
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
    return { erro: "Sem permissão para operar a recuperação." };
  }
  return { userId: user.id, admin };
}

export async function executarRecuperacaoManual(): Promise<ResultadoRecuperacao> {
  const gestor = await exigirGestor();
  if ("erro" in gestor) return { ok: false, erro: gestor.erro };

  const resumo = await executarReguaRecuperacao();
  const msg =
    `Régua de recuperação executada: ${resumo.enviadas} e-mail(s) enviado(s), ` +
    `${resumo.falhas} falha(s), ${resumo.puladasSemLink} sem link de pagamento, ` +
    `${resumo.avaliadas} pedido(s) avaliado(s).`;
  revalidatePath("/vendas/recuperacao");
  return { ok: true, msg, resumo };
}

const MAX_TEXTO = 2000;

export async function atualizarRegraRecuperacao(
  reguaId: string,
  entrada: { ativo: boolean; texto: string }
): Promise<ResultadoRecuperacao> {
  const gestor = await exigirGestor();
  if ("erro" in gestor) return { ok: false, erro: gestor.erro };

  if (!/^[0-9a-f-]{36}$/i.test(reguaId)) return { ok: false, erro: "Regra inválida." };
  const texto = (entrada.texto ?? "").trim();
  if (!texto) return { ok: false, erro: "Texto não pode ficar vazio." };
  if (texto.length > MAX_TEXTO) return { ok: false, erro: "Texto longo demais." };

  const faltando = ["{nome}", "{codigo}", "{link}"].filter((v) => !texto.includes(v));
  if (faltando.length > 0) {
    return { ok: false, erro: `Falta usar: ${faltando.join(", ")}.` };
  }

  const { error } = await gestor.admin
    .from("cart_recovery_rules")
    .update({ ativo: entrada.ativo, texto })
    .eq("id", reguaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID);
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/vendas/recuperacao");
  return { ok: true, msg: "Regra atualizada." };
}
