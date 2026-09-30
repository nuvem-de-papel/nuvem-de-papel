"use server";

import { revalidatePath } from "next/cache";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

// Gestao de planos do Clube (F7). Toda escrita:
//  1) revalida sessao + papel de gestao no servidor (fail-closed);
//  2) grava via service_role (unico que escreve em club_plans/audit_log);
//  3) registra antes/depois em audit_log (trilha - migration 0005).

export type ResultadoPlano = { ok: true } | { ok: false; erro: string };

async function gestorAtual(): Promise<{ id: string; role: string } | null> {
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

async function auditar(
  gestor: { id: string },
  action: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: gestor.id,
    action,
    entity: "club_plans",
    entity_id: entityId,
    before,
    after,
  });
}

function validar(input: {
  name: string;
  priceMonthly: number;
  discountPct: number;
  gift: string;
}): string | null {
  if (!input.name || input.name.trim().length < 2 || input.name.trim().length > 80) {
    return "Nome do plano invalido.";
  }
  if (!Number.isFinite(input.priceMonthly) || input.priceMonthly <= 0) {
    return "Preco mensal precisa ser maior que zero.";
  }
  if (!Number.isFinite(input.discountPct) || input.discountPct < 0 || input.discountPct > 100) {
    return "Desconto precisa estar entre 0 e 100%.";
  }
  if (input.gift && input.gift.length > 120) {
    return "Brinde muito longo (max 120 caracteres).";
  }
  return null;
}

function atualizarTelas() {
  revalidatePath("/configuracoes/clube");
  revalidatePath("/clube");
}

export async function salvarPlano(input: {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  discountPct: number;
  freeShipping: boolean;
  gift: string;
  active: boolean;
}): Promise<ResultadoPlano> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissao para editar planos." };

  const erro = validar(input);
  if (erro) return { ok: false, erro };

  const admin = createAdminClient();
  const { data: atual } = await admin
    .from("club_plans")
    .select("id, name, description, price_monthly, discount_pct, free_shipping, gift, active")
    .eq("id", input.id)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!atual) return { ok: false, erro: "Plano nao encontrado." };

  const { error } = await admin
    .from("club_plans")
    .update({
      name: input.name.trim(),
      description: input.description.trim(),
      price_monthly: input.priceMonthly,
      discount_pct: input.discountPct,
      free_shipping: input.freeShipping,
      gift: input.gift.trim(),
      active: input.active,
    })
    .eq("id", input.id)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID);
  if (error) return { ok: false, erro: "Nao foi possivel salvar o plano." };

  await auditar(gestor, "clube.plano_alterado", input.id, atual, {
    name: input.name.trim(),
    price_monthly: input.priceMonthly,
    discount_pct: input.discountPct,
    active: input.active,
  });
  atualizarTelas();
  return { ok: true };
}

export async function criarPlano(input: {
  code: string;
  name: string;
  priceMonthly: number;
  discountPct: number;
  gift: string;
}): Promise<ResultadoPlano> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissao para criar planos." };

  const code = (input.code ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(code)) {
    return { ok: false, erro: "Codigo do plano: use apenas letras, numeros, - ou _ (min 2)." };
  }
  const erro = validar({
    name: input.name,
    priceMonthly: input.priceMonthly,
    discountPct: input.discountPct,
    gift: input.gift,
  });
  if (erro) return { ok: false, erro };

  const admin = createAdminClient();
  const { data: duplicado } = await admin
    .from("club_plans")
    .select("id")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("code", code)
    .maybeSingle();
  if (duplicado) return { ok: false, erro: "Ja existe um plano com esse codigo." };

  const { data: criado, error } = await admin
    .from("club_plans")
    .insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      code,
      name: input.name.trim(),
      description: "",
      price_monthly: input.priceMonthly,
      discount_pct: input.discountPct,
      gift: input.gift.trim(),
      active: true,
    })
    .select("id")
    .single();
  if (error || !criado) return { ok: false, erro: "Nao foi possivel criar o plano." };

  await auditar(gestor, "clube.plano_criado", criado.id, null, {
    code,
    name: input.name.trim(),
    price_monthly: input.priceMonthly,
    discount_pct: input.discountPct,
  });
  atualizarTelas();
  return { ok: true };
}
