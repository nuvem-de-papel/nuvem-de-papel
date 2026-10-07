"use server";

import { revalidatePath } from "next/cache";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { processarFila as drenarFila, type ResumoFila } from "@/lib/marketplace/fila";

// Tela de Marketplaces (Modulo 1 - kernel). As 6 tabelas sao deny-all: tudo
// aqui passa pelo service_role e so para perfis de gestao (mesmo contrato das
// actions de precos). Audit_log cobre criar/remover conta; a FONTE de verdade
// operacional e a propria fila (cada job guarda tentativas e erro).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Resultado = { ok: true; mensagem?: string } | { ok: false; erro: string };
export type ResultadoFila = ({ ok: true } & ResumoFila) | { ok: false; erro: string };

async function gestorAtual(): Promise<{ id: string } | null> {
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
  if (!profile || profile.status !== "ativo" || !PAPEIS_GESTAO.includes(profile.role)) return null;
  return profile;
}

async function auditar(
  gestor: { id: string },
  action: string,
  entityId: string,
  before: Record<string, unknown>[],
  after: Record<string, unknown> | null
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: gestor.id,
    action,
    entity: "marketplace_accounts",
    entity_id: entityId,
    before,
    after,
  });
}

function telasDeMarketplace() {
  revalidatePath("/configuracoes/marketplaces");
}

export async function adicionarConta(entrada: { canal?: string; label?: string }): Promise<Resultado> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissao para gerenciar marketplaces." };

  const canal = typeof entrada?.canal === "string" ? entrada.canal : "";
  const label = String(entrada?.label ?? "").trim();
  if (!canal) return { ok: false, erro: "Escolha um canal." };
  if (label.length < 2 || label.length > 80) {
    return { ok: false, erro: "Nome da conta precisa de 2 a 80 caracteres." };
  }

  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("marketplace_channels")
    .select("id, name")
    .eq("slug", canal)
    .eq("ativo", true)
    .maybeSingle();
  if (!channel) return { ok: false, erro: "Canal invalido ou inativo." };

  const { data: linha, error } = await admin
    .from("marketplace_accounts")
    .insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      channel_id: channel.id,
      label,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: "Ja existe uma conta com esse nome neste canal." };
    }
    return { ok: false, erro: `Nao foi possivel criar a conta: ${error.message}` };
  }

  await auditar(gestor, "marketplace.conta_adicionada", linha.id, [], { channel: canal, label });
  telasDeMarketplace();
  return { ok: true };
}

export async function removerConta(contaId: string): Promise<Resultado> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissao para gerenciar marketplaces." };
  if (!UUID.test(contaId ?? "")) return { ok: false, erro: "Conta invalida." };

  const admin = createAdminClient();
  const { data: antes } = await admin
    .from("marketplace_accounts")
    .select("id, label, channel_id")
    .eq("id", contaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!antes) return { ok: false, erro: "Conta nao encontrada." };

  const { error } = await admin.from("marketplace_accounts").delete().eq("id", contaId);
  if (error) return { ok: false, erro: `Nao foi possivel remover a conta: ${error.message}` };

  await auditar(gestor, "marketplace.conta_removida", contaId, [antes as Record<string, unknown>], null);
  telasDeMarketplace();
  return { ok: true };
}

// enqueue devolve o id do job ativo quando ja existe um com a MESMA chave -
// clique duplo vira 1 job so (indice marketplace_jobs_dedupe_ativo).
async function enfileirar(
  admin: ReturnType<typeof createAdminClient>,
  canal: string,
  conta: string | null,
  tipo: string,
  payload: Record<string, unknown>,
  dedupe: string
): Promise<string | null> {
  const { data, error } = await admin.rpc("marketplace_enqueue", {
    p_tenant: NUVEM_DE_PAPEL_TENANT_ID,
    p_channel: canal,
    p_account: conta,
    p_tipo: tipo,
    p_payload: payload,
    p_dedupe: dedupe,
  });
  if (error) return null;
  return typeof data === "string" ? data : null;
}

export async function enfileirarPing(contaId: string): Promise<Resultado> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissao para gerenciar marketplaces." };
  if (!UUID.test(contaId ?? "")) return { ok: false, erro: "Conta invalida." };

  const admin = createAdminClient();
  const { data: conta } = await admin
    .from("marketplace_accounts")
    .select("id, channel_id, label")
    .eq("id", contaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!conta) return { ok: false, erro: "Conta nao encontrada." };

  const jobId = await enfileirar(admin, conta.channel_id, conta.id, "ping", {}, `ping:${conta.id}`);
  if (!jobId) return { ok: false, erro: "Nao foi possivel enfileirar o ping." };
  telasDeMarketplace();
  return { ok: true };
}

// validacao e por (conta, produto): o canal de destino fica registrado no job
// (no M2 o adaptador do canal pode acrescentar requisito proprio na mesma fila)
export async function enfileirarValidacao(contaId: string, itemId: string): Promise<Resultado> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissao para gerenciar marketplaces." };
  if (!UUID.test(contaId ?? "") || !UUID.test(itemId ?? "")) {
    return { ok: false, erro: "Escolha conta e produto validos." };
  }

  const admin = createAdminClient();
  const { data: conta } = await admin
    .from("marketplace_accounts")
    .select("id, channel_id")
    .eq("id", contaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!conta) return { ok: false, erro: "Conta nao encontrada." };

  const jobId = await enfileirar(
    admin,
    conta.channel_id,
    conta.id,
    "validar_item",
    { item_id: itemId },
    `validar:${conta.id}:${itemId}`
  );
  if (!jobId) return { ok: false, erro: "Nao foi possivel enfileirar a validacao." };
  telasDeMarketplace();
  return { ok: true };
}

export async function enfileirarPublicacao(contaId: string, itemId: string): Promise<Resultado> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissao para gerenciar marketplaces." };
  if (!UUID.test(contaId ?? "") || !UUID.test(itemId ?? "")) {
    return { ok: false, erro: "Escolha conta e produto validos." };
  }

  const admin = createAdminClient();
  const { data: conta } = await admin
    .from("marketplace_accounts")
    .select("id, channel_id")
    .eq("id", contaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!conta) return { ok: false, erro: "Conta nao encontrada." };

  // um anuncio por (conta, produto): repetir o clique reusa a linha e o dedupe
  // do job impede a segunda execucao enquanto a primeira nao terminar
  const { data: anuncio, error: erroAnuncio } = await admin
    .from("marketplace_listings")
    .upsert(
      { tenant_id: NUVEM_DE_PAPEL_TENANT_ID, account_id: conta.id, item_id: itemId },
      { onConflict: "account_id,item_id" }
    )
    .select("id")
    .single();
  if (erroAnuncio) return { ok: false, erro: `Nao foi possivel montar o anuncio: ${erroAnuncio.message}` };

  const jobId = await enfileirar(
    admin,
    conta.channel_id,
    conta.id,
    "publicar_item",
    { listing_id: anuncio.id },
    `publicar:${anuncio.id}`
  );
  if (!jobId) return { ok: false, erro: "Nao foi possivel enfileirar a publicacao." };
  telasDeMarketplace();
  return { ok: true, mensagem: "Produto na fila de publicacao." };
}

export async function processarFila(): Promise<ResultadoFila> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissao para gerenciar marketplaces." };

  try {
    const resumo = await drenarFila(10);
    telasDeMarketplace();
    return { ok: true, ...resumo };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao processar a fila." };
  }
}

export async function reprocessarJob(jobId: string): Promise<Resultado> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissao para gerenciar marketplaces." };
  if (!UUID.test(jobId ?? "")) return { ok: false, erro: "Job invalido." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("marketplace_reprocess", { p_job: jobId });
  if (error) return { ok: false, erro: `Nao foi possivel reprocessar: ${error.message}` };
  if (!data) return { ok: false, erro: "So jobs com falha podem ser reprocessados." };
  telasDeMarketplace();
  return { ok: true };
}
