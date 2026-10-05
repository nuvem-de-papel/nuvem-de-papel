"use server";

import { revalidatePath } from "next/cache";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

// Tabela de preco (Bloco 5 passo 2). item_prices JA existe com a PK
// (item_id, channel, min_quantity, valid_from) - entao nao ha migration nova.
//
// REGRA DURA: uma linha por (item, canal, faixa). Os tres leitores de preco
// decidem de formas diferentes e nenhum deles olha "qual linha venceu":
//   * checkout (src/app/checkout/actions.ts:138-143): maior faixa <= quantidade
//     e, no empate, a PRIMEIRA linha que o banco devolver (nao ha ORDER BY);
//   * PDV (src/app/pdv/page.tsx:157-160): menor faixa ativa, IGNORANDO a data;
//   * loja (src/lib/products.ts:57-58): faixa ASC, valid_from DESC, primeira.
// Por isso a gravacao e "upsert da linha nova -> apaga as outras da mesma
// faixa": se algo falhar no meio, sobra uma linha de mais (o proximo salvamento
// conserta) e nunca uma linha de menos (preco sumido).

export type Canais = "varejo" | "atacado";
export type ResultadoPreco = { ok: true } | { ok: false; erro: string };

export type EntradaPreco = {
  itemId: string;
  channel: Canais;
  minQuantity: number;
  price: number;
  /** YYYY-MM-DD */
  validFrom: string;
  /** YYYY-MM-DD ou "" (sem previsao de fim) */
  validUntil?: string;
  /** linha que estava sendo editada, quando canal/faixa mudou */
  origem?: { channel: Canais; minQuantity: number } | null;
};

export type EntradaRemocao = {
  itemId: string;
  channel: Canais;
  minQuantity: number;
};

type LinhaDb = {
  channel: string;
  min_quantity: number;
  price: number | string;
  valid_from: string | null;
  valid_until: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(valor: string): boolean {
  if (!RE_DATA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === valor;
}

function canalDe(valor: unknown): Canais | null {
  return valor === "varejo" || valor === "atacado" ? valor : null;
}

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
    entity: "item_prices",
    entity_id: entityId,
    before,
    after,
  });
}

function telasDePreco() {
  revalidatePath("/configuracoes/precos");
  revalidatePath("/produtos");
  revalidatePath("/");
}

async function lerFaixa(
  admin: ReturnType<typeof createAdminClient>,
  itemId: string,
  channel: Canais,
  minQuantity: number
): Promise<LinhaDb[]> {
  const { data } = await admin
    .from("item_prices")
    .select("channel, min_quantity, price, valid_from, valid_until")
    .eq("item_id", itemId)
    .eq("channel", channel)
    .eq("min_quantity", minQuantity);
  return (data ?? []) as LinhaDb[];
}

export async function salvarPreco(input: EntradaPreco): Promise<ResultadoPreco> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissao para alterar precos." };

  const canal = canalDe(input?.channel);
  if (!canal) return { ok: false, erro: "Canal invalido: use varejo ou atacado." };

  const itemId = typeof input?.itemId === "string" ? input.itemId : "";
  if (!UUID.test(itemId)) return { ok: false, erro: "Escolha um produto valido." };

  const faixa = Number(input?.minQuantity);
  if (!Number.isInteger(faixa) || faixa < 1 || faixa > 1000000) {
    return { ok: false, erro: "Faixa minima precisa ser um numero inteiro de 1 a 1.000.000." };
  }

  const preco = Number(input?.price);
  if (!Number.isFinite(preco) || preco < 0 || preco > 999999.99) {
    return { ok: false, erro: "Preco invalido: use de 0 a 999.999,99." };
  }

  const inicio = String(input?.validFrom ?? "");
  if (!dataValida(inicio)) return { ok: false, erro: "Inicio da vigencia invalido (use AAAA-MM-DD)." };

  const fim = String(input?.validUntil ?? "").trim();
  if (fim && !dataValida(fim)) return { ok: false, erro: "Fim da vigencia invalido (use AAAA-MM-DD)." };
  if (fim && fim <= inicio) {
    return { ok: false, erro: "Fim da vigencia precisa ser depois do inicio." };
  }

  const canalOrigem = canalDe(input?.origem?.channel);
  const faixaOrigem = Number(input?.origem?.minQuantity);
  const origem =
    canalOrigem && Number.isInteger(faixaOrigem) && faixaOrigem >= 1
      ? { channel: canalOrigem, minQuantity: faixaOrigem }
      : null;

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("catalog_items")
    .select("id, sku")
    .eq("id", itemId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!item) return { ok: false, erro: "Produto nao encontrado." };

  const antes = await lerFaixa(admin, itemId, canal, faixa);
  const trocouDeLinha = !!origem && (origem.channel !== canal || origem.minQuantity !== faixa);
  const antesOrigem = trocouDeLinha && origem ? await lerFaixa(admin, itemId, origem.channel, origem.minQuantity) : [];

  // 1) grava a linha nova (ou atualiza a que ja tinha a MESMA chave)
  const { error: erroUpsert } = await admin.from("item_prices").upsert(
    {
      item_id: itemId,
      channel: canal,
      min_quantity: faixa,
      price: preco,
      valid_from: inicio,
      valid_until: fim || null,
    },
    { onConflict: "item_id,channel,min_quantity,valid_from" }
  );
  if (erroUpsert) return { ok: false, erro: `Nao foi possivel gravar a faixa: ${erroUpsert.message}` };

  // 2) consolida a faixa: sobra UMA linha (a que acabou de ser gravada)
  const { error: erroLimpa } = await admin
    .from("item_prices")
    .delete()
    .eq("item_id", itemId)
    .eq("channel", canal)
    .eq("min_quantity", faixa)
    .neq("valid_from", inicio);
  if (erroLimpa) {
    return {
      ok: false,
      erro: "Faixa gravada, mas as linhas antigas nao foram removidas - recarregue a pagina e salve de novo.",
    };
  }

  // 3) se a edicao mudou de canal/faixa, a linha antiga tambem sai
  if (trocouDeLinha && origem) {
    const { error: erroOrigem } = await admin
      .from("item_prices")
      .delete()
      .eq("item_id", itemId)
      .eq("channel", origem.channel)
      .eq("min_quantity", origem.minQuantity);
    if (erroOrigem) {
      return { ok: false, erro: "Nao foi possivel remover a faixa anterior - recarregue a pagina." };
    }
  }

  await auditar(
    gestor,
    "preco.faixa_salva",
    itemId,
    [...antes, ...antesOrigem],
    { channel: canal, min_quantity: faixa, price: preco, valid_from: inicio, valid_until: fim || null }
  );
  telasDePreco();
  return { ok: true };
}

export async function removerPreco(input: EntradaRemocao): Promise<ResultadoPreco> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissao para alterar precos." };

  const canal = canalDe(input?.channel);
  if (!canal) return { ok: false, erro: "Canal invalido." };

  const itemId = typeof input?.itemId === "string" ? input.itemId : "";
  if (!UUID.test(itemId)) return { ok: false, erro: "Produto invalido." };

  const faixa = Number(input?.minQuantity);
  if (!Number.isInteger(faixa) || faixa < 1) return { ok: false, erro: "Faixa invalida." };

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("catalog_items")
    .select("id, sku")
    .eq("id", itemId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!item) return { ok: false, erro: "Produto nao encontrado." };

  const antes = await lerFaixa(admin, itemId, canal, faixa);
  if (antes.length === 0) {
    return { ok: false, erro: "Nenhuma faixa de preco para esse canal e quantidade." };
  }

  const { error } = await admin
    .from("item_prices")
    .delete()
    .eq("item_id", itemId)
    .eq("channel", canal)
    .eq("min_quantity", faixa);
  if (error) return { ok: false, erro: "Nao foi possivel remover a faixa." };

  await auditar(gestor, "preco.faixa_removida", itemId, antes, null);
  telasDePreco();
  return { ok: true };
}
