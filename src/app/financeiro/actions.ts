"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { PAPEIS_GESTAO } from "@/lib/rbac";

// Server Actions do financeiro (F5): liquidação de parcelas. Títulos e
// parcelas são criados pelas RPCs do PDV (0008); aqui só entrada
// validada + RBAC de gestão + auditoria.

export type ResultadoFinanceiro = { ok: true; msg: string } | { ok: false; erro: string };

const METODOS = ["pix", "cartao", "debito", "dinheiro", "boleto", "transferencia"];

const brl = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ehUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

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
    return { erro: "Sem permissão para operar o financeiro." };
  }
  return { userId: user.id, admin };
}

export async function liquidarParcela(
  parcelaId: string,
  valor: number,
  metodo: string,
  notas: string
): Promise<ResultadoFinanceiro> {
  if (!ehUuid(parcelaId)) return { ok: false, erro: "Parcela inválida." };
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0 || v > 999999) {
    return { ok: false, erro: "Valor inválido (maior que 0)." };
  }
  if (!METODOS.includes(metodo)) return { ok: false, erro: "Método inválido." };

  const acesso = await exigirGestor();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data, error } = await admin.rpc("financial_settle", {
    p_installment_id: parcelaId,
    p_amount: v,
    p_method: metodo,
    p_idempotency_key: crypto.randomUUID(),
    p_notes: notas?.trim() ? notas.trim().slice(0, 200) : null,
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("SOBRELIQUIDACAO")) {
      return { ok: false, erro: "Valor acima do saldo em aberto desta parcela." };
    }
    if (m.includes("PARCELA_ENCERRADA")) {
      return { ok: false, erro: "Parcela já encerrada." };
    }
    return { ok: false, erro: m || "Falha ao liquidar." };
  }

  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "financeiro.liquidacao",
    entity: "financial_installments",
    entity_id: parcelaId,
    after: {
      valor: v,
      metodo,
      status: data?.installment_status ?? null,
    },
  });
  revalidatePath("/financeiro");
  const status = String(data?.installment_status ?? "");
  return {
    ok: true,
    msg:
      status === "liquidado"
        ? `Parcela liquidada (${brl(v)}).`
        : `Recebimento parcial de ${brl(v)} registrado.`,
  };
}

// ---------------------------------------------------------------------
// Despesas (Bloco 2 residual — tela + rateio por centro de custo)
//
// A gravacao em `expenses` e o UNICO passo: o gatilho adiado da 0023
// (trg_post_expense_accounting) le a linha e chama journal_post com
// idempotencia `despesa:<id>` - D conta da despesa, C caixa (se paid_at)
// ou 2.1.1 (em aberto), competencia = propria linha. Nada aqui escreve no
// diario direto, e nada apaga/edita: o livro e imutavel, correcao entra
// como novo lancamento.
// ---------------------------------------------------------------------

export type RateioLinha = { centroId: string; pct: number };

const r2 = (v: number) => Math.round(v * 100) / 100;

export async function criarDespesa(entrada: {
  descricao: string;
  competencia: string; // "AAAA-MM"
  conta: string;
  valor: number;
  pagoAgora: boolean;
  centroId?: string | null;
  rateio?: RateioLinha[] | null;
}): Promise<ResultadoFinanceiro> {
  const descricao = String(entrada.descricao ?? "").trim();
  if (descricao.length < 3) return { ok: false, erro: "Descrição precisa de ao menos 3 caracteres." };
  if (descricao.length > 160) return { ok: false, erro: "Descrição longa demais (máx. 160 caracteres)." };

  const competencia = String(entrada.competencia ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
    return { ok: false, erro: "Competência inválida (formato AAAA-MM)." };
  }

  const conta = String(entrada.conta ?? "");
  const v = Number(entrada.valor);
  if (!Number.isFinite(v) || v <= 0 || v > 9999999999) {
    return { ok: false, erro: "Valor inválido (maior que 0)." };
  }

  const acesso = await exigirGestor();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  // Conta tem de ser folha de despesa (classe 6): sem isto o gatilho da 0023
  // estouraria com DESPESA_CONTA_NAO_FOLHA depois do insert.
  const { data: contaRow } = await admin
    .from("account_catalog")
    .select("code, aceita_lancamento, classe")
    .eq("code", conta)
    .maybeSingle();
  if (!contaRow || !contaRow.aceita_lancamento || Number(contaRow.classe) !== 6) {
    return { ok: false, erro: "Conta inválida: escolha uma conta de despesa (classe 6) do plano." };
  }

  const { data: centros } = await admin.from("cost_centers").select("id, code").eq("ativo", true);
  const centrosValidos = new Set((centros ?? []).map((c) => String(c.id)));

  type Linha = { centro: string | null; valor: number };
  let linhas: Linha[] = [];

  const rateio = Array.isArray(entrada.rateio)
    ? entrada.rateio.filter((l) => l && Number(l.pct) > 0)
    : null;
  if (rateio && rateio.length > 0) {
    let soma = 0;
    for (const l of rateio) {
      const pct = Number(l.pct);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return { ok: false, erro: "Percentual do rateio inválido." };
      }
      if (!centrosValidos.has(String(l.centroId))) {
        return { ok: false, erro: "Centro de custo inválido no rateio." };
      }
      soma += pct;
    }
    if (Math.abs(soma - 100) > 0.01) {
      return { ok: false, erro: `O rateio precisa somar 100% (está em ${r2(soma)}%).` };
    }
    let acc = 0;
    linhas = rateio.map((l, i) => {
      const valor = i === rateio.length - 1 ? r2(v - acc) : r2((v * Number(l.pct)) / 100);
      acc = r2(acc + valor);
      return { centro: String(l.centroId), valor };
    });
    if (linhas.some((l) => l.valor <= 0)) {
      return { ok: false, erro: "O rateio gera linha zerada — ajuste os percentuais." };
    }
  } else {
    const centro = entrada.centroId ? String(entrada.centroId) : null;
    if (centro && !centrosValidos.has(centro)) {
      return { ok: false, erro: "Centro de custo inválido." };
    }
    linhas = [{ centro, valor: r2(v) }];
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const payload = linhas.map((l) => ({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    competencia: `${competencia}-01`,
    description: descricao,
    account_code: conta,
    cost_center_id: l.centro,
    amount: l.valor,
    recurring: false,
    paid_at: entrada.pagoAgora ? hoje : null,
    created_by: userId,
  }));

  const { data: criadas, error } = await admin.from("expenses").insert(payload).select("id, amount");
  if (error) {
    const m = error.message ?? "";
    if (m.includes("DESPESA_CONTA_NAO_FOLHA")) {
      return { ok: false, erro: "Conta não é folha do plano de contas." };
    }
    if (m.includes("exceeds")) return { ok: false, erro: "Valor grande demais para o lançamento." };
    return { ok: false, erro: m || "Falha ao lançar a despesa." };
  }

  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "despesa.criar",
    entity: "expenses",
    entity_id: (criadas ?? [])[0]?.id ?? null,
    after: {
      descricao,
      competencia,
      conta,
      valor_total: r2(v),
      pago: !!entrada.pagoAgora,
      linhas: linhas.map((l) => ({ centro: l.centro, valor: l.valor })),
    },
  });

  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro");
  return {
    ok: true,
    msg:
      `Despesa de ${brl(r2(v))} lançada na competência ${competencia}` +
      (linhas.length > 1 ? ` — rateada em ${linhas.length} centros de custo.` : "."),
  };
}

// ------------------------------------------------- conciliação bancária (0027)
// Importação de extrato (OFX/CSV) + conferência linha a linha contra
// liquidações de título e despesas pagas. Controle, não contabilidade:
// nada aqui entra no diário (o livro é só dos gatilhos da 0021-0023).

export type ExtratoLinhaEntrada = {
  data: string; // AAAA-MM-DD
  descricao: string;
  valor: number; // sinal do banco: entrada +, saída -
  fitid?: string | null;
};

function ehDataISO(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  return a >= 2000 && a <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

export async function importarExtrato(entrada: {
  fonte: string;
  arquivoNome?: string | null;
  competencia: string; // "AAAA-MM"
  linhas: ExtratoLinhaEntrada[];
}): Promise<ResultadoFinanceiro> {
  const competencia = String(entrada.competencia ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
    return { ok: false, erro: "Competência inválida (formato AAAA-MM)." };
  }
  const fonte = entrada.fonte === "ofx" ? "ofx" : entrada.fonte === "csv" ? "csv" : null;
  if (!fonte) return { ok: false, erro: "Fonte inválida (apenas OFX ou CSV)." };

  const brutas = Array.isArray(entrada.linhas) ? entrada.linhas : [];
  if (brutas.length === 0) {
    return { ok: false, erro: "Nenhuma linha válida no extrato (use data;descricao;valor ou OFX)." };
  }
  if (brutas.length > 500) {
    return { ok: false, erro: "Extrato longo demais (máx. 500 linhas por importação)." };
  }

  const linhas: ExtratoLinhaEntrada[] = [];
  for (const l of brutas) {
    const data = String(l?.data ?? "");
    if (!ehDataISO(data)) return { ok: false, erro: "Data inválida no extrato (use AAAA-MM-DD)." };
    const descricao = String(l?.descricao ?? "").trim();
    if (!descricao) return { ok: false, erro: "Linha sem descrição no extrato." };
    const valor = Number(l?.valor);
    if (!Number.isFinite(valor) || valor === 0 || Math.abs(valor) > 9999999999) {
      return { ok: false, erro: "Valor inválido no extrato (saída negativa, entrada positiva)." };
    }
    linhas.push({
      data,
      descricao: descricao.slice(0, 200),
      valor: r2(valor),
      fitid: l?.fitid ? String(l.fitid).slice(0, 120) : null,
    });
  }

  const acesso = await exigirGestor();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  // dedupe: FITID já importado antes + FITID repetido dentro do próprio arquivo
  const vistos = new Set<string>();
  const novas: ExtratoLinhaEntrada[] = [];
  let repetidas = 0;
  const fitids = linhas.filter((l) => l.fitid).map((l) => String(l.fitid));
  const existentes = new Set<string>();
  if (fitids.length > 0) {
    const { data: jaTem } = await admin
      .from("bank_linhas")
      .select("fitid")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .in("fitid", fitids);
    for (const r of jaTem ?? []) existentes.add(String(r.fitid));
  }
  for (const l of linhas) {
    const f = l.fitid ? String(l.fitid) : null;
    if (f && (existentes.has(f) || vistos.has(f))) {
      repetidas += 1;
      continue;
    }
    if (f) vistos.add(f);
    novas.push(l);
  }

  const { data: ext, error: erroExt } = await admin
    .from("bank_extratos")
    .insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      fonte,
      arquivo_nome: entrada.arquivoNome ? String(entrada.arquivoNome).slice(0, 160) : null,
      competencia: `${competencia}-01`,
      linhas_total: linhas.length,
      linhas_novas: novas.length,
      created_by: userId,
    })
    .select("id")
    .single();
  if (erroExt || !ext) {
    return { ok: false, erro: erroExt?.message || "Falha ao registrar a importação." };
  }

  let inseridas = 0;
  if (novas.length > 0) {
    const payload = novas.map((l, i) => ({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      extrato_id: ext.id,
      seq: i + 1,
      data: l.data,
      descricao: l.descricao,
      valor: l.valor,
      fitid: l.fitid ?? null,
    }));
    const { error } = await admin.from("bank_linhas").insert(payload);
    if (!error) {
      inseridas = payload.length;
    } else {
      // corrida com outra importação (FITID): linha a linha, as repetidas ficam de fora
      for (const p of payload) {
        const r = await admin.from("bank_linhas").insert(p).select("id");
        if (!r.error) inseridas += 1;
      }
      if (inseridas === 0) {
        await admin.from("bank_extratos").delete().eq("id", ext.id);
        return { ok: false, erro: "Nenhuma linha nova: o extrato já foi importado antes." };
      }
      await admin.from("bank_extratos").update({ linhas_novas: inseridas }).eq("id", ext.id);
      repetidas = linhas.length - inseridas;
    }
  }

  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "extrato.importar",
    entity: "bank_extratos",
    entity_id: ext.id,
    after: {
      fonte,
      arquivo: entrada.arquivoNome ?? null,
      competencia,
      total: linhas.length,
      novas: inseridas,
      repetidas,
    },
  });

  revalidatePath("/financeiro/conciliacao");
  revalidatePath("/financeiro");
  const msg =
    `${inseridas} linha(s) importada(s)` +
    (repetidas > 0 ? ` — ${repetidas} repetida(s) ignorada(s)` : "") +
    ".";
  return { ok: true, msg };
}

export async function conciliarLinha(
  linhaId: string,
  acao: string,
  ref?: { tipo: string; id: string } | null
): Promise<ResultadoFinanceiro> {
  if (!ehUuid(linhaId)) return { ok: false, erro: "Linha inválida." };
  const ativa = acao === "conciliar" || acao === "ignorar" || acao === "reabrir";
  if (!ativa && acao !== "desconciliar") return { ok: false, erro: "Ação inválida." };

  const acesso = await exigirGestor();
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const { userId, admin } = acesso;

  const { data: linha } = await admin
    .from("bank_linhas")
    .select("id, status, data, descricao, valor")
    .eq("id", linhaId)
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();
  if (!linha) return { ok: false, erro: "Linha do extrato não encontrada." };

  const status = String(linha.status);

  if (acao === "conciliar") {
    if (status !== "pendente") return { ok: false, erro: "Linha já tratada." };
    const tipo = ref?.tipo === "liquidacao" ? "liquidacao" : ref?.tipo === "despesa" ? "despesa" : null;
    if (!tipo || !ehUuid(String(ref?.id ?? ""))) {
      return { ok: false, erro: "Escolha o que conciliar (sugestão ou candidato da lista)." };
    }
    const tabela = tipo === "liquidacao" ? "financial_settlements" : "expenses";
    const { data: alvo } = await admin
      .from(tabela)
      .select("id")
      .eq("id", String(ref!.id))
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .maybeSingle();
    if (!alvo) {
      return { ok: false, erro: tipo === "liquidacao" ? "Liquidação não encontrada." : "Despesa não encontrada." };
    }
    const { error } = await admin
      .from("bank_linhas")
      .update({
        status: "conciliada",
        ref_tipo: tipo,
        ref_id: String(ref!.id),
        conciliada_em: new Date().toISOString(),
        conciliada_by: userId,
      })
      .eq("id", linhaId);
    if (error) return { ok: false, erro: error.message || "Falha ao conciliar a linha." };
    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: userId,
      action: "extrato.conciliar",
      entity: "bank_linhas",
      entity_id: linhaId,
      after: { linha, ref: { tipo, id: String(ref!.id) } },
    });
    revalidatePath("/financeiro/conciliacao");
    return { ok: true, msg: "Linha conciliada." };
  }

  if (acao === "ignorar") {
    if (status !== "pendente") return { ok: false, erro: "Linha já tratada." };
    const { error } = await admin
      .from("bank_linhas")
      .update({ status: "ignorada", ref_tipo: null, ref_id: null, conciliada_em: null, conciliada_by: null })
      .eq("id", linhaId);
    if (error) return { ok: false, erro: error.message || "Falha ao ignorar a linha." };
    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: userId,
      action: "extrato.ignorar",
      entity: "bank_linhas",
      entity_id: linhaId,
      after: { linha },
    });
    revalidatePath("/financeiro/conciliacao");
    return { ok: true, msg: "Linha marcada como ignorada." };
  }

  if (acao === "desconciliar") {
    if (status !== "conciliada") return { ok: false, erro: "Linha não está conciliada." };
    const { error } = await admin
      .from("bank_linhas")
      .update({ status: "pendente", ref_tipo: null, ref_id: null, conciliada_em: null, conciliada_by: null })
      .eq("id", linhaId);
    if (error) return { ok: false, erro: error.message || "Falha ao desconciliar a linha." };
    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: userId,
      action: "extrato.desconciliar",
      entity: "bank_linhas",
      entity_id: linhaId,
      after: { linha },
    });
    revalidatePath("/financeiro/conciliacao");
    return { ok: true, msg: "Linha voltou para pendente." };
  }

  // reabrir (ignorada -> pendente)
  if (status !== "ignorada") return { ok: false, erro: "Linha ignorada não encontrada." };
  const { error } = await admin
    .from("bank_linhas")
    .update({ status: "pendente" })
    .eq("id", linhaId);
  if (error) return { ok: false, erro: error.message || "Falha ao reabrir a linha." };
  await admin.from("audit_log").insert({
    tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
    actor_user_id: userId,
    action: "extrato.reabrir",
    entity: "bank_linhas",
    entity_id: linhaId,
    after: { linha },
  });
  revalidatePath("/financeiro/conciliacao");
  return { ok: true, msg: "Linha voltou para pendente." };
}
