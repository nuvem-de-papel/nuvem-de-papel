"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { PAPEIS_GESTAO } from "@/lib/rbac";

// Server Actions do módulo Vendas → emissão de nota fiscal (emissão interna
// da empresa — sem transmissão SEFAZ nesta fase; ver 0011_nfe.sql). Tudo
// auditado (audit_log / 0005) e restrito a gestão (master|gerente).

export type ItemNfe = {
  sku: string;
  nome: string;
  ncm: string;
  cfop: string;
  origem: string;
  cst: string;
  qtd: number;
  unit: number;
  total: number;
  icmsPct: number;
  pisPct: number;
  cofinsPct: number;
};

export type EntradaNfe = {
  tipo: "saida" | "entrada";
  pedidoId: string;
  naturezaOperacao: string;
  cfop: string;
  serie: number;
  destinatario: { nome: string; doc: string; endereco: string };
  frete: { modalidade: string; valor: number };
  itens: ItemNfe[];
  dadosAdicionais: string;
};

export type ResultadoNfe = { ok: true; msg: string; numero: number } | { ok: false; erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function r2(v: number): number {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

async function exigirGestao(): Promise<
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
    return { erro: "Sem permissão para emitir notas fiscais." };
  }
  return { userId: user.id, admin };
}

export async function emitirNfe(entrada: EntradaNfe): Promise<ResultadoNfe> {
  if (entrada?.tipo !== "saida" && entrada?.tipo !== "entrada") {
    return { ok: false, erro: "Tipo de operação inválido." };
  }
  if (!UUID.test(entrada.pedidoId ?? "")) return { ok: false, erro: "Pedido inválido." };
  if (!Array.isArray(entrada.itens) || entrada.itens.length === 0) {
    return { ok: false, erro: "A nota precisa de ao menos um item." };
  }

  const cfop = String(entrada.cfop ?? "").trim();
  if (!/^\d{4}$/.test(cfop)) return { ok: false, erro: "CFOP deve ter 4 dígitos (ex.: 5102)." };

  const serie = Math.trunc(Number(entrada.serie));
  if (!Number.isFinite(serie) || serie < 1 || serie > 999) {
    return { ok: false, erro: "Série inválida (1 a 999)." };
  }

  const nome = String(entrada.destinatario?.nome ?? "").trim();
  if (!nome) return { ok: false, erro: "Informe o destinatário." };

  const freteValor = Number(entrada.frete?.valor ?? 0);
  if (!Number.isFinite(freteValor) || freteValor < 0) {
    return { ok: false, erro: "Valor do frete inválido." };
  }

  const itens: ItemNfe[] = [];
  for (const i of entrada.itens) {
    const qtd = Number(i.qtd);
    const unit = Number(i.unit);
    if (!Number.isFinite(qtd) || qtd <= 0 || !Number.isFinite(unit) || unit < 0) {
      return { ok: false, erro: `Item "${i.nome ?? i.sku}" com quantidade ou preço inválido.` };
    }
    itens.push({
      sku: String(i.sku ?? ""),
      nome: String(i.nome ?? ""),
      ncm: String(i.ncm ?? "0000").trim() || "0000",
      cfop: /^\d{4}$/.test(String(i.cfop ?? "")) ? String(i.cfop) : cfop,
      origem: String(i.origem ?? "0"),
      cst: String(i.cst ?? "000").trim() || "000",
      qtd,
      unit: r2(unit),
      total: r2(qtd * unit),
      icmsPct: Math.min(100, Math.max(0, Number(i.icmsPct) || 0)),
      pisPct: Math.min(100, Math.max(0, Number(i.pisPct) || 0)),
      cofinsPct: Math.min(100, Math.max(0, Number(i.cofinsPct) || 0)),
    });
  }

  const acesso = await exigirGestao();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const tabela = entrada.tipo === "saida" ? "orders" : "purchase_orders";
  const { data: pedido } = await admin
    .from(tabela)
    .select("id")
    .eq("id", entrada.pedidoId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };

  const base = itens.reduce((s, i) => s + i.total, 0);
  const icms = itens.reduce((s, i) => s + (i.total * i.icmsPct) / 100, 0);
  const pis = itens.reduce((s, i) => s + (i.total * i.pisPct) / 100, 0);
  const cofins = itens.reduce((s, i) => s + (i.total * i.cofinsPct) / 100, 0);
  const totais = { base: r2(base), icms: r2(icms), pis: r2(pis), cofins: r2(cofins), total: r2(base) };

  // numeração max(numero)+1 na série; 23505 (corrida) => refaz até 3x.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data: ultima } = await admin
      .from("nfe_emissoes")
      .select("numero")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("serie", serie)
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle();
    const numero = Number(ultima?.numero ?? 0) + 1;

    const { data: criada, error } = await admin
      .from("nfe_emissoes")
      .insert({
        tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
        tipo: entrada.tipo,
        order_id: entrada.tipo === "saida" ? entrada.pedidoId : null,
        purchase_order_id: entrada.tipo === "entrada" ? entrada.pedidoId : null,
        numero,
        serie,
        natureza_operacao: String(entrada.naturezaOperacao ?? "").trim() || "Venda de mercadoria",
        cfop,
        destinatario: {
          nome,
          doc: String(entrada.destinatario?.doc ?? "").trim(),
          endereco: String(entrada.destinatario?.endereco ?? "").trim(),
        },
        frete: { modalidade: String(entrada.frete?.modalidade ?? "9"), valor: r2(freteValor) },
        itens,
        totais,
        dados_adicionais: String(entrada.dadosAdicionais ?? "").trim() || null,
        status: "emitida",
        created_by: userId,
      })
      .select("id, numero")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") continue; // corrida na numeração — refaz
      return { ok: false, erro: `Falha ao emitir: ${error.message}` };
    }

    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: userId,
      action: "nfe.emitir",
      entity: "nfe_emissoes",
      entity_id: criada?.id ?? null,
      after: { numero, serie, tipo: entrada.tipo, pedido: entrada.pedidoId },
    });
    revalidatePath("/vendas");
    return {
      ok: true,
      msg: `NF-e ${numero} série ${serie} emitida com sucesso.`,
      numero,
    };
  }

  return { ok: false, erro: "Numeração em disputa — tente emitir novamente." };
}

export async function cancelarNfe(notaId: string): Promise<ResultadoNfe> {
  if (!UUID.test(notaId ?? "")) return { ok: false, erro: "Nota inválida." };

  const acesso = await exigirGestao();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data, error } = await admin
    .from("nfe_emissoes")
    .update({ status: "cancelada", cancelada_em: new Date().toISOString() })
    .eq("id", notaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("status", "emitida")
    .select("id, numero, serie");
  if (error) return { ok: false, erro: `Falha ao cancelar: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: false, erro: "Nota já cancelada ou não encontrada." };
  }

  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "nfe.cancelar",
    entity: "nfe_emissoes",
    entity_id: notaId,
    after: { numero: data[0].numero, serie: data[0].serie },
  });
  revalidatePath("/vendas");
  return { ok: true, msg: `NF-e ${data[0].numero} cancelada.`, numero: Number(data[0].numero) };
}
