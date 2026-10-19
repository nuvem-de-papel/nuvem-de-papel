"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { executarReguaCobranca, type ResumoRegua } from "@/lib/cobranca";

// Server Actions da régua de cobrança (0035). O motor roda em
// src/lib/cobranca.ts; aqui só RBAC de gestão + chamada + auditoria.
// Disparo automático: /api/cron/cobranca (secret CRON_SECRET). Este
// executarCobrancaManual é o botão do painel para rodar na hora.

export type ResultadoCobranca =
  | { ok: true; msg: string; resumo?: ResumoRegua }
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
    return { erro: "Sem permissão para operar a cobrança." };
  }
  return { userId: user.id, admin };
}

export async function executarCobrancaManual(): Promise<ResultadoCobranca> {
  const gestor = await exigirGestor();
  if ("erro" in gestor) return { ok: false, erro: gestor.erro };

  const resumo = await executarReguaCobranca();

  const msg =
    `Régua executada: ${resumo.enviadas} e-mail(s) enviado(s), ` +
    `${resumo.falhas} falha(s), ${resumo.puladasSemEmail} sem email, ` +
    `${resumo.avaliadas} parcela(s) avaliada(s).`;
  revalidatePath("/financeiro/cobranca");
  return { ok: true, msg, resumo };
}

const CANAIS = ["email", "whatsapp", "ambos"];
const MAX_TEXTO = 2000;

export async function atualizarRegra(
  reguaId: string,
  entrada: { canal: string; ativo: boolean; texto: string }
): Promise<ResultadoCobranca> {
  const gestor = await exigirGestor();
  if ("erro" in gestor) return { ok: false, erro: gestor.erro };

  if (!/^[0-9a-f-]{36}$/i.test(reguaId)) return { ok: false, erro: "Regra inválida." };
  if (!CANAIS.includes(entrada.canal)) return { ok: false, erro: "Canal inválido." };
  const texto = (entrada.texto ?? "").trim();
  if (!texto) return { ok: false, erro: "Texto não pode ficar vazio." };
  if (texto.length > MAX_TEXTO) return { ok: false, erro: "Texto longo demais." };

  // variáveis obrigatórias para a mensagem não virar muro de texto solto
  const faltando = ["{nome}", "{valor}", "{vencimento}"].filter((v) => !texto.includes(v));
  if (faltando.length > 0) {
    return { ok: false, erro: `Falta usar: ${faltando.join(", ")}.` };
  }

  const { error } = await gestor.admin
    .from("cobranca_reguas")
    .update({ canal: entrada.canal, ativo: entrada.ativo, texto })
    .eq("id", reguaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID);
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/financeiro/cobranca");
  return { ok: true, msg: "Regra atualizada." };
}
