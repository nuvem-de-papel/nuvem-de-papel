"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import {
  montarChave44,
  montarXmlNfe,
  transmitirNfe as sefazTransmitir,
  consultarNfe as sefazConsultar,
  cancelarEvento,
} from "@/lib/sefaz";
import type { EmitenteXml } from "@/lib/sefaz";

// Server Actions do módulo Vendas → emissão de nota fiscal. A nota nasce
// "pendente" e so vira "autorizada" apos o ciclo SEFAZ (transmitir ->
// consultar - F8.2, src/lib/sefaz.ts): em producao sem A1+CSC o transporte
// falha fechado; em dev/E2E roda com SEFAZ_MOCK=1. Tudo auditado
// (audit_log / 0005) e restrito a gestão (master|gerente).

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
  destinatario: { nome: string; doc: string; endereco: string; ie?: string };
  frete: { modalidade: string; valor: number };
  itens: ItemNfe[];
  dadosAdicionais: string;
};

export type ResultadoNfe = { ok: true; msg: string; numero: number } | { ok: false; erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function r2(v: number): number {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

// emitente (tenant_company) no formato que o montador do XML espera
function paraEmitente(emp: {
  cnpj: string;
  razao_social: string;
  fantasia?: string;
  ie?: string;
  regime?: string;
  telefone?: string;
  endereco?: Record<string, unknown>;
}): EmitenteXml {
  const end = (emp.endereco ?? {}) as EmitenteXml["endereco"];
  return {
    cnpj: emp.cnpj ?? "",
    razao_social: emp.razao_social ?? "",
    fantasia: emp.fantasia ?? "",
    ie: emp.ie ?? "",
    regime: emp.regime ?? "simples",
    telefone: emp.telefone ?? "",
    endereco: {
      logradouro: end.logradouro ?? "",
      numero: end.numero ?? "",
      complemento: end.complemento ?? "",
      bairro: (end as { bairro?: string }).bairro ?? "",
      cidade: end.cidade ?? "",
      uf: end.uf ?? "",
      cep: end.cep ?? "",
    },
  };
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
          ie: String(entrada.destinatario?.ie ?? "").trim(),
        },
        frete: { modalidade: String(entrada.frete?.modalidade ?? "9"), valor: r2(freteValor) },
        itens,
        totais,
        dados_adicionais: String(entrada.dadosAdicionais ?? "").trim() || null,
        status: "pendente",
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
      msg: `NF-e ${numero} série ${serie} criada — pendente de transmissão.`,
      numero,
    };
  }

  return { ok: false, erro: "Numeração em disputa — tente emitir novamente." };
}

// transmite a nota pendente (ciclo M13: pendente -> transmitida | autorizada | rejeitada)
export async function transmitirNfe(notaId: string): Promise<ResultadoNfe> {
  if (!UUID.test(notaId ?? "")) return { ok: false, erro: "Nota inválida." };

  const acesso = await exigirGestao();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data: nota } = await admin
    .from("nfe_emissoes")
    .select("id, numero, serie, status, cfop, natureza_operacao, destinatario, itens, totais")
    .eq("id", notaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!nota) return { ok: false, erro: "Nota não encontrada." };
  if (nota.status !== "pendente") {
    return { ok: false, erro: `Só notas pendentes podem ser transmitidas (estado atual: ${nota.status}).` };
  }

  const { data: emp } = await admin
    .from("tenant_company")
    .select("cnpj, ie, regime, razao_social, fantasia, telefone, endereco")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  const cnpjEmitente = (emp?.cnpj ?? "").replace(/\D/g, "");
  if (cnpjEmitente.length !== 14) {
    return { ok: false, erro: "Cadastre a emitente (Configurações → Empresa) antes de transmitir." };
  }
  const ufEmitente = ((emp?.endereco as { uf?: string } | null)?.uf ?? "").trim();

  const { data: cfg } = await admin
    .from("sefaz_config")
    .select("ambiente")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  const ambiente = cfg?.ambiente === "producao" ? "producao" : "homologacao";

  const montada = montarChave44({
    uf: ufEmitente,
    cnpjEmitente,
    serie: Number(nota.serie),
    numero: Number(nota.numero),
    ambiente,
  });
  if (!montada.ok) return { ok: false, erro: montada.erro };
  const chave = montada.chave;

  const montado = montarXmlNfe(nota as unknown as Parameters<typeof montarXmlNfe>[0], paraEmitente(emp!), chave, ambiente);
  if (!montado.ok) return { ok: false, erro: montado.erro };
  const xml = montado.xml;

  const tx = await sefazTransmitir({ chave, xml, ambiente, uf: ufEmitente });
  if ("erro" in tx) return { ok: false, erro: tx.erro };

  // autorizada direto (modo sincrono da SEFAZ): pula a consulta
  if ("autorizada" in tx) {
    const { data: upd, error } = await admin
      .from("nfe_emissoes")
      .update({
        status: "autorizada",
        chave,
        protocolo: tx.autorizada.protocolo,
        transmitida_em: new Date().toISOString(),
        autorizada_em: new Date().toISOString(),
        ambiente,
        xml,
      })
      .eq("id", notaId)
      .eq("status", "pendente")
      .select("numero, serie");
    if (error) return { ok: false, erro: `Falha ao gravar a autorização: ${error.message}` };
    if (!upd || upd.length === 0) return { ok: false, erro: "Nota mudou de estado — recarregue." };

    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: userId,
      action: "nfe.autorizar",
      entity: "nfe_emissoes",
      entity_id: notaId,
      after: { numero: upd[0].numero, chave, protocolo: tx.autorizada.protocolo, ambiente, via: "transmissao" },
    });
    revalidatePath("/vendas");
    return {
      ok: true,
      msg: `NF-e ${upd[0].numero} autorizada — protocolo ${tx.autorizada.protocolo}.`,
      numero: Number(upd[0].numero),
    };
  }

  // rejeitada na própria transmissao
  if ("rejeitada" in tx) {
    const { data: upd, error } = await admin
      .from("nfe_emissoes")
      .update({
        status: "rejeitada",
        chave,
        motivo: tx.rejeitada.motivo,
        transmitida_em: new Date().toISOString(),
        ambiente,
        xml,
      })
      .eq("id", notaId)
      .eq("status", "pendente")
      .select("numero, serie");
    if (error) return { ok: false, erro: `Falha ao gravar a rejeição: ${error.message}` };
    if (!upd || upd.length === 0) return { ok: false, erro: "Nota mudou de estado — recarregue." };

    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: userId,
      action: "nfe.rejeitar",
      entity: "nfe_emissoes",
      entity_id: notaId,
      after: { numero: upd[0].numero, chave, motivo: tx.rejeitada.motivo },
    });
    revalidatePath("/vendas");
    return { ok: false, erro: `NF-e ${upd[0].numero} rejeitada: ${tx.rejeitada.motivo}` };
  }

  const { data: upd, error } = await admin
    .from("nfe_emissoes")
    .update({
      status: "transmitida",
      chave,
      recibo: tx.recibo,
      transmitida_em: new Date().toISOString(),
      ambiente,
      xml,
    })
    .eq("id", notaId)
    .eq("status", "pendente")
    .select("numero, serie");
  if (error) return { ok: false, erro: `Falha ao gravar a transmissão: ${error.message}` };
  if (!upd || upd.length === 0) return { ok: false, erro: "Nota mudou de estado — recarregue." };

  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "nfe.transmitir",
    entity: "nfe_emissoes",
    entity_id: notaId,
    after: { numero: upd[0].numero, serie: upd[0].serie, chave, recibo: tx.recibo, ambiente },
  });
  revalidatePath("/vendas");
  return {
    ok: true,
    msg: `NF-e ${upd[0].numero} transmitida — recibo ${tx.recibo}. Consulte para autorizar.`,
    numero: Number(upd[0].numero),
  };
}

// consulta o recibo (transmitida -> autorizada | rejeitada) -----------------
export async function consultarNfe(notaId: string): Promise<ResultadoNfe> {
  if (!UUID.test(notaId ?? "")) return { ok: false, erro: "Nota inválida." };

  const acesso = await exigirGestao();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data: nota } = await admin
    .from("nfe_emissoes")
    .select("id, numero, serie, status, chave, recibo, ambiente")
    .eq("id", notaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!nota) return { ok: false, erro: "Nota não encontrada." };
  if (nota.status === "autorizada") return { ok: false, erro: "Nota já autorizada." };
  if (nota.status !== "transmitida" || !nota.recibo || !nota.chave) {
    return { ok: false, erro: "Transmita a nota antes de consultar." };
  }

  const { data: emp } = await admin
    .from("tenant_company")
    .select("endereco")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  const ufEmitente = ((emp?.endereco as { uf?: string } | null)?.uf ?? "").trim();

  const c = await sefazConsultar(
    nota.recibo,
    nota.chave,
    nota.ambiente ?? "homologacao",
    ufEmitente
  );
  if (!c.ok) return { ok: false, erro: c.erro };

  if (c.estado === "em_processamento") {
    return { ok: true, msg: `NF-e ${nota.numero} ainda em processamento — consulte novamente.`, numero: Number(nota.numero) };
  }

  if (c.estado === "autorizada") {
    const { data: upd, error } = await admin
      .from("nfe_emissoes")
      .update({
        status: "autorizada",
        protocolo: c.protocolo,
        autorizada_em: new Date().toISOString(),
      })
      .eq("id", notaId)
      .eq("status", "transmitida")
      .select("numero, serie");
    if (error) return { ok: false, erro: `Falha ao gravar: ${error.message}` };
    if (!upd || upd.length === 0) return { ok: false, erro: "Nota mudou de estado — recarregue." };

    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: userId,
      action: "nfe.autorizar",
      entity: "nfe_emissoes",
      entity_id: notaId,
      after: { numero: upd[0].numero, protocolo: c.protocolo, chave: c.chave },
    });
    revalidatePath("/vendas");
    return {
      ok: true,
      msg: `NF-e ${upd[0].numero} autorizada — protocolo ${c.protocolo}.`,
      numero: Number(upd[0].numero),
    };
  }

  await admin
    .from("nfe_emissoes")
    .update({ status: "rejeitada", motivo: c.motivo })
    .eq("id", notaId)
    .eq("status", "transmitida");
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "nfe.rejeitar",
    entity: "nfe_emissoes",
    entity_id: notaId,
    after: { numero: nota.numero, motivo: c.motivo },
  });
  revalidatePath("/vendas");
  return { ok: false, erro: `NF-e ${nota.numero} rejeitada: ${c.motivo}` };
}

export async function cancelarNfe(notaId: string): Promise<ResultadoNfe> {
  if (!UUID.test(notaId ?? "")) return { ok: false, erro: "Nota inválida." };

  const acesso = await exigirGestao();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data: nota } = await admin
    .from("nfe_emissoes")
    .select("id, numero, serie, status, chave, protocolo, ambiente")
    .eq("id", notaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!nota) return { ok: false, erro: "Nota não encontrada." };

  // pendente/rejeitada: cancelamento interno (nunca teve efeito fiscal)
  if (nota.status === "pendente" || nota.status === "rejeitada") {
    const { data, error } = await admin
      .from("nfe_emissoes")
      .update({ status: "cancelada", cancelada_em: new Date().toISOString() })
      .eq("id", notaId)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("status", nota.status)
      .select("id, numero, serie");
    if (error) return { ok: false, erro: `Falha ao cancelar: ${error.message}` };
    if (!data || data.length === 0) return { ok: false, erro: "Nota já cancelada ou não encontrada." };

    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: userId,
      action: "nfe.cancelar",
      entity: "nfe_emissoes",
      entity_id: notaId,
      after: { numero: data[0].numero, serie: data[0].serie, via: "interno" },
    });
    revalidatePath("/vendas");
    return { ok: true, msg: `NF-e ${data[0].numero} cancelada.`, numero: Number(data[0].numero) };
  }

  // transmitida sem autorizacao: consulte antes (evento exige estado final)
  if (nota.status === "transmitida") {
    return { ok: false, erro: "Nota transmitida ainda sem autorização — consulte antes de cancelar." };
  }
  if (nota.status === "cancelada") {
    return { ok: false, erro: "Nota já cancelada." };
  }

  // autorizada: exige evento de cancelamento na SEFAZ (fail-closed sem A1)
  const { data: emp } = await admin
    .from("tenant_company")
    .select("cnpj, endereco")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  const ev = await cancelarEvento({
    chave: nota.chave ?? "",
    ambiente: nota.ambiente ?? "homologacao",
    motivo: "Cancelamento pelo painel Nuvem de Papel",
    protocolo: nota.protocolo ?? "",
    uf: ((emp?.endereco as { uf?: string } | null)?.uf ?? "").trim(),
    cnpjEmitente: (emp?.cnpj ?? "").replace(/\D/g, ""),
  });
  if (!ev.ok) return { ok: false, erro: ev.erro };

  const { data, error } = await admin
    .from("nfe_emissoes")
    .update({
      status: "cancelada",
      cancelada_em: new Date().toISOString(),
      motivo: `Cancelamento autorizado (protocolo ${ev.protocolo}).`,
    })
    .eq("id", notaId)
    .eq("status", "autorizada")
    .select("id, numero, serie");
  if (error) return { ok: false, erro: `Falha ao cancelar: ${error.message}` };
  if (!data || data.length === 0) return { ok: false, erro: "Nota já cancelada ou não encontrada." };

  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "nfe.cancelar",
    entity: "nfe_emissoes",
    entity_id: notaId,
    after: { numero: data[0].numero, serie: data[0].serie, via: "sefaz", protocolo: ev.protocolo },
  });
  revalidatePath("/vendas");
  return { ok: true, msg: `NF-e ${data[0].numero} cancelada.`, numero: Number(data[0].numero) };
}
