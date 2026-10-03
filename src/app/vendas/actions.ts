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
import { enviarEmail } from "@/lib/email";

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
    // EN-01: autoriza a NF-e de saida => abre a entrega da venda (1 por pedido)
    await criarEntregaAposAutorizacao(admin, notaId, userId);
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
    // EN-01: autoriza a NF-e de saida => abre a entrega da venda (1 por pedido)
    await criarEntregaAposAutorizacao(admin, notaId, userId);
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

// ============================================================ Vendas v5 ===
// Funil/conversao (VD-02/VD-03 + VL-01..VL-03 via RPC 0018), cancelamento
// (VD-06), Expedicao (EN-01..EN-06 + AV-02: status manual com historico e
// aviso ao cliente) e importacao de pedidos da loja (secao 4). Os perfis
// "vendas"/"expedicao" da spec ainda nao existem no RBAC: tudo passa por
// exigirGestao (master|gerente) - pendencia documentada no AGENTS.md.

export type Resultado = { ok: true; msg: string } | { ok: false; erro: string };

const ERROS_CONVERSAO: Record<string, string> = {
  PEDIDO_NAO_ENCONTRADO: "Pedido não encontrado.",
  DOCUMENTO_CANCELADO: "Documento cancelado não pode virar venda.",
  JA_E_VENDA: "Este documento já é uma venda.",
  ETAPA_NAO_E_PEDIDO: "Só a etapa pedido pode ser convertida.",
  SEM_ITENS: "Adicione pelo menos um produto.",
  ATACADO_SEM_CNPJ: "Venda no atacado exige CNPJ do cliente.",
  SEM_NOME_CLIENTE: "Informe o nome do cliente.",
  QUANTIDADE_INVALIDA: "Item com quantidade inválida.",
};

function erroConversao(mensagem: string): string {
  if (mensagem.startsWith("ESTOQUE_INSUFICIENTE")) {
    return "Estoque insuficiente — nada foi baixado, o pedido continua pedido.";
  }
  return ERROS_CONVERSAO[mensagem] ?? `Falha na conversão: ${mensagem}`;
}

// EN-01: ao autorizar a NF-e de saida, abre a entrega da venda (1 por pedido,
// unique (tenant, order)). Retirada na loja (varejo sem frete) nasce
// 'entregue'; demais nascem 'aguardando' com transportadora padrao. Melhor
// esforco: a autorizacao da nota nunca falha por causa da expedicao.
async function criarEntregaAposAutorizacao(
  admin: ReturnType<typeof createAdminClient>,
  notaId: string,
  userId: string
): Promise<void> {
  try {
    const { data: nota } = await admin
      .from("nfe_emissoes")
      .select("order_id, tipo")
      .eq("id", notaId)
      .maybeSingle();
    if (!nota || nota.tipo !== "saida" || !nota.order_id) return;

    const { data: existente } = await admin
      .from("entregas")
      .select("id")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("order_id", nota.order_id)
      .maybeSingle();
    if (existente) return;

    const { data: pedido } = await admin
      .from("orders")
      .select("channel, frete, origem")
      .eq("id", nota.order_id)
      .maybeSingle();
    if (!pedido) return;

    const retirada = pedido.channel === "varejo" && Number(pedido.frete ?? 0) === 0;
    const transportadora = retirada
      ? "Retirada na loja"
      : pedido.origem === "loja"
        ? "Correios PAC"
        : "Jadlog";
    const status = retirada ? "entregue" : "aguardando";

    const { data: criada, error } = await admin
      .from("entregas")
      .insert({
        tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
        order_id: nota.order_id,
        status,
        transportadora,
        ...(retirada ? { entregue_em: new Date().toISOString() } : {}),
      })
      .select("id")
      .maybeSingle();
    if (error || !criada) return;

    await admin.from("entrega_eventos").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      entrega_id: criada.id,
      de_status: null,
      para_status: status,
      nota: retirada
        ? "Retirado na loja no ato da compra"
        : "Entrega criada na autorização da nota",
      created_by: userId,
    });
  } catch (e) {
    console.error("[vendas] EN-01 falhou ao criar a entrega:", e);
  }
}

// VD-03: pedido -> venda (numero V- + validacoes + baixa de estoque atomicas
// dentro da RPC 0018; saldo insuficiente derruba tudo).
export async function converterVenda(orderId: string): Promise<Resultado> {
  if (!UUID.test(orderId ?? "")) return { ok: false, erro: "Pedido inválido." };
  const acesso = await exigirGestao();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data, error } = await admin.rpc("vendas_convert_to_sale", {
    p_order_id: orderId,
  });
  if (error) return { ok: false, erro: erroConversao(error.message) };

  const numero = (data as { venda_numero?: string } | null)?.venda_numero ?? "";
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "venda.converter",
    entity: "orders",
    entity_id: orderId,
    after: { venda_numero: numero },
  });
  revalidatePath("/vendas");
  return { ok: true, msg: `Documento ${numero} convertido em venda (estoque baixado).` };
}

// VD-06: cancela pedido (so etapa 'pedido'; venda ja baixou estoque e passa a
// ser desfeita pelo cancelamento da nota, nao por aqui).
export async function cancelarPedido(orderId: string): Promise<Resultado> {
  if (!UUID.test(orderId ?? "")) return { ok: false, erro: "Pedido inválido." };
  const acesso = await exigirGestao();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data: pedido } = await admin
    .from("orders")
    .select("id, etapa, cancelado_em")
    .eq("id", orderId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
  if (pedido.cancelado_em) return { ok: false, erro: "Pedido já cancelado." };
  if (pedido.etapa !== "pedido") {
    return { ok: false, erro: "Só pedidos podem ser cancelados aqui." };
  }

  const { data: upd, error } = await admin
    .from("orders")
    .update({ cancelado_em: new Date().toISOString() })
    .eq("id", orderId)
    .is("cancelado_em", null)
    .select("id");
  if (error) return { ok: false, erro: `Falha ao cancelar: ${error.message}` };
  if (!upd || upd.length === 0) return { ok: false, erro: "Pedido já cancelado." };

  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "pedido.cancelar",
    entity: "orders",
    entity_id: orderId,
    after: { cancelado_em: "agora" },
  });
  revalidatePath("/vendas");
  return { ok: true, msg: "Pedido cancelado — aparece como Cancelado na lista." };
}

// EN-02..EN-04 + AV-02: proximo passo da linha da entrega. Postar exige
// codigo de rastreio (EN-03) e, no postado/entregue, avisa o cliente por
// e-mail (best-effort: sem RESEND_API_KEY nao envia - ver pendencia).
const PROXIMO_STATUS: Record<string, string> = {
  aguardando: "separado",
  separado: "em_transito",
  em_transito: "entregue",
  falhou: "em_transito",
};

export async function avancarEntrega(entregaId: string): Promise<Resultado> {
  if (!UUID.test(entregaId ?? "")) return { ok: false, erro: "Entrega inválida." };
  const acesso = await exigirGestao();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data: entrega } = await admin
    .from("entregas")
    .select(
      "id, order_id, status, rastreio, transportadora, orders(id, venda_numero, pedido_numero, customers(name, email))"
    )
    .eq("id", entregaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!entrega) return { ok: false, erro: "Entrega não encontrada." };

  const destino = PROXIMO_STATUS[entrega.status];
  if (!destino) {
    return {
      ok: false,
      erro:
        entrega.status === "entregue"
          ? "Entrega já concluída."
          : "Entrega devolvida é estado final.",
    };
  }
  if (destino === "em_transito" && !String(entrega.rastreio ?? "").trim()) {
    return { ok: false, erro: "Informe o código de rastreio para postar." };
  }

  const agora = new Date().toISOString();
  const patch: Record<string, string | null> = { status: destino, updated_at: agora };
  if (destino === "em_transito") patch.enviado_em = agora;
  if (destino === "entregue") patch.entregue_em = agora;

  const { data: upd, error } = await admin
    .from("entregas")
    .update(patch)
    .eq("id", entregaId)
    .eq("status", entrega.status)
    .select("id");
  if (error) return { ok: false, erro: `Falha ao atualizar a entrega: ${error.message}` };
  if (!upd || upd.length === 0) return { ok: false, erro: "Entrega mudou de estado — recarregue." };

  const pedido = entrega.orders as unknown as {
    venda_numero?: string | null;
    pedido_numero?: string | null;
    customers?: { name?: string; email?: string } | null;
  } | null;
  const codigo = pedido?.venda_numero ?? pedido?.pedido_numero ?? "o pedido";
  const rotulo =
    destino === "separado"
      ? "separado"
      : destino === "em_transito"
        ? "postado (em trânsito)"
        : "entregue";

  await admin.from("entrega_eventos").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    entrega_id: entregaId,
    de_status: entrega.status,
    para_status: destino,
    nota:
      destino === "em_transito"
        ? `postado com rastreio ${String(entrega.rastreio ?? "").trim()}`
        : destino === "separado"
          ? "separação concluída"
          : "entrega concluída",
    created_by: userId,
  });
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "entrega.avancar",
    entity: "entregas",
    entity_id: entregaId,
    after: { de: entrega.status, para: destino },
  });

  if (destino === "em_transito" || destino === "entregue") {
    await avisarCliente(entregaId, entrega, destino, codigo, userId);
  }

  revalidatePath("/vendas");
  const de = codigo === "o pedido" ? "" : ` ${codigo}`;
  return { ok: true, msg: `Entrega${de}: ${rotulo}.` };
}

// EN-06: transportadora/codigo/prazo editaveis ate a entrega concluir.
export async function atualizarEntrega(
  entregaId: string,
  dados: { transportadora?: string; rastreio?: string; prazo?: string }
): Promise<Resultado> {
  if (!UUID.test(entregaId ?? "")) return { ok: false, erro: "Entrega inválida." };
  const acesso = await exigirGestao();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data: entrega } = await admin
    .from("entregas")
    .select("id, status")
    .eq("id", entregaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!entrega) return { ok: false, erro: "Entrega não encontrada." };
  if (entrega.status === "entregue" || entrega.status === "devolvido") {
    return { ok: false, erro: "Entrega concluída não pode ser editada." };
  }

  const transportadora = String(dados?.transportadora ?? "").trim().slice(0, 60);
  const rastreio = String(dados?.rastreio ?? "").trim().slice(0, 40) || null;
  const bruto = String(dados?.prazo ?? "").trim();
  let prazo: string | null = null;
  if (bruto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) {
      return { ok: false, erro: "Prazo inválido — use AAAA-MM-DD." };
    }
    prazo = bruto;
  }

  const { error } = await admin
    .from("entregas")
    .update({
      transportadora: transportadora || null,
      rastreio,
      prazo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entregaId);
  if (error) return { ok: false, erro: `Falha ao salvar a entrega: ${error.message}` };

  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "entrega.atualizar",
    entity: "entregas",
    entity_id: entregaId,
    after: { transportadora, rastreio, prazo },
  });
  revalidatePath("/vendas");
  return { ok: true, msg: rastreio ? `Entrega atualizada — rastreio ${rastreio}.` : "Entrega atualizada." };
}

// AV-02: ocorrência em entrega em andamento vira status 'falhou' com motivo
// no historico (a linha passa a oferecer "Resolver entrega").
export async function registrarOcorrencia(entregaId: string, texto: string): Promise<Resultado> {
  if (!UUID.test(entregaId ?? "")) return { ok: false, erro: "Entrega inválida." };
  const acesso = await exigirGestao();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const motivo = String(texto ?? "").trim();
  if (!motivo) return { ok: false, erro: "Descreva a ocorrência." };
  if (motivo.length > 300) return { ok: false, erro: "Ocorrência muito longa (máx. 300 caracteres)." };

  const { data: entrega } = await admin
    .from("entregas")
    .select("id, status, orders(id, venda_numero, pedido_numero, customers(name, email))")
    .eq("id", entregaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!entrega) return { ok: false, erro: "Entrega não encontrada." };
  if (!["aguardando", "separado", "em_transito"].includes(entrega.status)) {
    return { ok: false, erro: "Só entregas em andamento recebem ocorrência." };
  }

  const { data: upd, error } = await admin
    .from("entregas")
    .update({
      status: "falhou",
      observacao: motivo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entregaId)
    .eq("status", entrega.status)
    .select("id");
  if (error) return { ok: false, erro: `Falha ao registrar: ${error.message}` };
  if (!upd || upd.length === 0) return { ok: false, erro: "Entrega mudou de estado — recarregue." };

  await admin.from("entrega_eventos").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    entrega_id: entregaId,
    de_status: entrega.status,
    para_status: "falhou",
    nota: motivo,
    created_by: userId,
  });
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "entrega.ocorrencia",
    entity: "entregas",
    entity_id: entregaId,
    after: { de: entrega.status, motivo },
  });

  const pedido = entrega.orders as unknown as {
    venda_numero?: string | null;
    pedido_numero?: string | null;
    customers?: { name?: string; email?: string } | null;
  } | null;
  const codigo = pedido?.venda_numero ?? pedido?.pedido_numero ?? "";
  await avisarCliente(entregaId, entrega, "falhou", codigo, userId);

  revalidatePath("/vendas");
  return { ok: true, msg: "Ocorrência registrada — entrega marcada com problema." };
}

// secao 4: pedidos pagos da loja (origem='loja' sem pedido_numero) viram
// documentos P- via RPC 0018 (idempotente; ids repetidos/nao-loja ignorados).
export async function importarPedidosLoja(ids: string[]): Promise<Resultado> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, erro: "Marque ao menos um pedido." };
  }
  if (ids.length > 200) return { ok: false, erro: "Máximo de 200 pedidos por importação." };
  if (!ids.every((id) => UUID.test(String(id)))) {
    return { ok: false, erro: "Lista de pedidos inválida." };
  }
  const acesso = await exigirGestao();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data, error } = await admin.rpc("vendas_import_loja", { p_ids: ids });
  if (error) return { ok: false, erro: `Falha ao importar: ${error.message}` };

  const n = Number((data as { importados?: number } | null)?.importados ?? 0);
  if (n > 0) {
    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: userId,
      action: "pedidos.importar",
      entity: "orders",
      entity_id: null,
      after: { quantidade: n, ids },
    });
  }
  revalidatePath("/vendas");
  if (n === 0) return { ok: true, msg: "Nenhum pedido novo para importar." };
  return {
    ok: true,
    msg: `${n} pedido${n > 1 ? "s" : ""} importado${n > 1 ? "s" : ""} com numeração P-.`,
  };
}

// aviso de rastreio/ocorrencia ao cliente (AV-02/AV-04): best-effort - sem
// RESEND_API_KEY o enviarEmail devolve resend_ausente sem gravar nada.
async function avisarCliente(
  entregaId: string,
  entrega: { rastreio?: unknown; transportadora?: unknown; orders?: unknown },
  destino: "em_transito" | "entregue" | "falhou",
  codigo: string,
  userId: string
): Promise<void> {
  try {
    // a relacao to-one volta como objeto ou array conforme os tipos gerados:
    // normaliza os dois lados (pedido e cliente) antes de ler.
    const rel = Array.isArray(entrega.orders) ? entrega.orders[0] : entrega.orders;
    const clientes = (rel as { customers?: unknown } | null | undefined)?.customers;
    const cli = (Array.isArray(clientes) ? clientes[0] : clientes) as
      | { name?: string | null; email?: string | null }
      | null
      | undefined;
    const email = String(cli?.email ?? "").trim();
    if (!email) return;
    const nome = String(cli?.name ?? "").trim();
    const primeiro = nome.split(/\s+/)[0] || "cliente";
    const rastreio = String(entrega.rastreio ?? "").trim();
    const transportadora = String(entrega.transportadora ?? "").trim();
    const assunto =
      destino === "em_transito"
        ? `Pedido ${codigo} postado — rastreio ${rastreio}`
        : destino === "entregue"
          ? `Pedido ${codigo} entregue`
          : `Ocorrência na entrega do pedido ${codigo}`;
    const corpo =
      destino === "em_transito"
        ? `<p style="font-family:sans-serif">Olá, ${primeiro}! Seu pedido ${codigo} foi postado pela ${transportadora || "transportadora"}.</p><p style="font-family:sans-serif">Código de rastreio: <strong>${rastreio}</strong>.</p>`
        : destino === "entregue"
          ? `<p style="font-family:sans-serif">Olá, ${primeiro}! Seu pedido ${codigo} foi entregue. Obrigado pela preferência!</p>`
          : `<p style="font-family:sans-serif">Olá, ${primeiro}! Houve uma ocorrência na entrega do pedido ${codigo}. Fale conosco para combinarmos o envio.</p>`;
    await enviarEmail(email, assunto, corpo, {
      fonte: "system",
      actorUserId: userId,
      relatedEntity: "entregas",
      relatedId: entregaId,
    });
  } catch (e) {
    console.error("[vendas] aviso de entrega falhou:", e);
  }
}
