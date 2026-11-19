"use server";

import { revalidatePath } from "next/cache";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

// Setores e menu (19/11/2026): o dono troca quem aparece na barra da loja e
// em que grupo cada setor mora, sem codigo e sem migration.
//   * catalog_grupos.na_barra (0058) = atalho na 2a linha da barra;
//   * catalog_setores (0057) = setor (catalog_items.category) -> grupo.
// Setor novo (digitado no cadastro de produto) nasce "Sem grupo" e aparece
// em destaque nesta tela ate alguem escolher o grupo.

type Res = { ok: true } | { ok: false; erro: string };

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

function revalidar() {
  revalidatePath("/configuracoes/setores");
  revalidatePath("/produtos");
  revalidatePath("/");
}

export async function alternarNaBarra(grupoId: string, naBarra: boolean): Promise<Res> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão." };
  const admin = createAdminClient();
  const t = NUVEM_DE_PAPEL_TENANT_ID;

  if (naBarra) {
    const { count } = await admin
      .from("catalog_grupos")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", t)
      .eq("na_barra", true);
    if ((count ?? 0) >= 6) return { ok: false, erro: "A barra comporta no máximo 6 grupos. Tire um antes." };
  }

  const { data: antes } = await admin
    .from("catalog_grupos")
    .select("nome, na_barra")
    .eq("tenant_id", t)
    .eq("id", grupoId)
    .maybeSingle();
  if (!antes) return { ok: false, erro: "Grupo não encontrado." };

  const { error } = await admin.from("catalog_grupos").update({ na_barra: naBarra }).eq("tenant_id", t).eq("id", grupoId);
  if (error) return { ok: false, erro: error.message };

  await admin.from("audit_log").insert({
    tenant_id: t,
    actor_user_id: gestor.id,
    action: "menu.barra_alterada",
    entity: "catalog_grupos",
    entity_id: grupoId,
    before: antes,
    after: { nome: antes.nome, na_barra: naBarra },
  });
  revalidar();
  return { ok: true };
}

export async function moverGrupo(grupoId: string, direcao: -1 | 1): Promise<Res> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão." };
  const admin = createAdminClient();
  const t = NUVEM_DE_PAPEL_TENANT_ID;
  const { data } = await admin.from("catalog_grupos").select("id, ordem").eq("tenant_id", t).order("ordem");
  const lista = data ?? [];
  const i = lista.findIndex((g) => g.id === grupoId);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= lista.length) return { ok: true };
  // renumera 1..N para nao depender de ordens repetidas
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  for (let k = 0; k < nova.length; k++) {
    if (nova[k].ordem !== k + 1) {
      const { error } = await admin.from("catalog_grupos").update({ ordem: k + 1 }).eq("tenant_id", t).eq("id", nova[k].id);
      if (error) return { ok: false, erro: error.message };
    }
  }
  revalidar();
  return { ok: true };
}

export async function definirGrupoDoSetor(setor: string, grupoId: string | null): Promise<Res> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão." };
  const nome = setor.trim();
  if (nome.length < 2 || nome.length > 60) return { ok: false, erro: "Setor inválido." };
  const admin = createAdminClient();
  const t = NUVEM_DE_PAPEL_TENANT_ID;

  const { data: antes } = await admin
    .from("catalog_setores")
    .select("grupo_id")
    .eq("tenant_id", t)
    .eq("nome", nome)
    .maybeSingle();

  if (!grupoId) {
    const { error } = await admin.from("catalog_setores").delete().eq("tenant_id", t).eq("nome", nome);
    if (error) return { ok: false, erro: error.message };
  } else {
    const { data: grupo } = await admin.from("catalog_grupos").select("id").eq("tenant_id", t).eq("id", grupoId).maybeSingle();
    if (!grupo) return { ok: false, erro: "Grupo não encontrado." };
    const { data: ultimo } = await admin
      .from("catalog_setores")
      .select("ordem")
      .eq("tenant_id", t)
      .eq("grupo_id", grupoId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await admin
      .from("catalog_setores")
      .upsert({ tenant_id: t, nome, grupo_id: grupoId, ordem: (ultimo?.ordem ?? 0) + 1 }, { onConflict: "tenant_id,nome" });
    if (error) return { ok: false, erro: error.message };
  }

  await admin.from("audit_log").insert({
    tenant_id: t,
    actor_user_id: gestor.id,
    action: "menu.setor_agrupado",
    entity: "catalog_setores",
    entity_id: null,
    before: { setor: nome, grupo_id: antes?.grupo_id ?? null },
    after: { setor: nome, grupo_id: grupoId },
  });
  revalidar();
  return { ok: true };
}
