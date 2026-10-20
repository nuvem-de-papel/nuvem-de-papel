// Entrega 6 (0039) — "carta de insights com IA" do dashboard.
//
// REGRA DE OURO (prompt de origem "Dashboard de gestão com IA"): QUEM CALCULA É
// O CÓDIGO, A I.A SÓ ESCREVE. Aqui o código:
//   1) calcularIndicadores(): monta um JSON FLAT de números (faturamento, pedidos,
//      ticket, clientes novos, contas a pagar/receber 7d, atrasadas, margem) a partir
//      das tabelas que JÁ existem (orders, order_items, financial_installments,
//      customers) — comparando o período atual com o anterior equivalente.
//   2) gerarCarta(): manda esse JSON pra IA (Gemini) escrever o texto com ETIQUETAS
//      {chave}; depois o código VALIDA (etiqueta inexistente ou número solto fora de
//      etiqueta => rejeita, tenta 1x de novo; se falhar de novo, marca incompleta) e
//      SUBSTITUI cada etiqueta pelo valor formatado. A IA nunca vê nem grava número.
// Best-effort: falha vira { ok:false, motivo } — quem chama (server action) decide.

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenantId } from "@/lib/tenant";
import { gerarTexto } from "@/lib/ia";

export type Formato = "brl" | "int" | "pct";

export type Indicadores = {
  /** valores planos; a IA só referencia por {chave} */
  valores: Record<string, number>;
  /** como formatar cada chave na substituição */
  formatos: Record<string, Formato>;
  /** frases que o CÓDIGO monta quando falta dado (a IA nunca chuta) */
  faltamDados: string[];
};

export type CartaTexto = {
  resumo: string;
  melhorou: string[];
  piorou: string[];
  atencao: string[];
  faltam_dados: string[];
  acoes: { texto: string; prazo: string }[];
};

const brlFmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const intFmt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pctFmt = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export function formatar(chave: string, valor: number, formatos: Record<string, Formato>): string {
  const f = formatos[chave] ?? "int";
  if (f === "brl") return brlFmt(valor);
  if (f === "pct") return pctFmt(valor);
  return intFmt(valor);
}

// ---------------------------------------------------------------------------
// 1) Indicadores: só código, tabelas existentes. Compara periodo x anterior.
// ---------------------------------------------------------------------------
export async function calcularIndicadores(inicio: Date, fim: Date): Promise<Indicadores> {
  const tenantId = getCurrentTenantId();
  const admin = createAdminClient();

  const durMs = fim.getTime() - inicio.getTime();
  const antInicio = new Date(inicio.getTime() - durMs);
  const antFim = inicio;
  const iso = (d: Date) => d.toISOString();
  const hoje = new Date().toISOString().slice(0, 10);
  const em7d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [pedCur, pedAnt, cliCur, receivable, payable, custos] = await Promise.all([
    admin
      .from("orders")
      .select("total_amount")
      .eq("tenant_id", tenantId)
      .gte("created_at", iso(inicio))
      .lt("created_at", iso(fim))
      .not("status", "in", "(cancelado,aguardando_pagamento)")
      .limit(5000),
    admin
      .from("orders")
      .select("total_amount")
      .eq("tenant_id", tenantId)
      .gte("created_at", iso(antInicio))
      .lt("created_at", iso(antFim))
      .not("status", "in", "(cancelado,aguardando_pagamento)")
      .limit(5000),
    admin
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .gte("created_at", iso(inicio))
      .lt("created_at", iso(fim))
      .limit(5000),
    admin
      .from("financial_installments")
      .select("due_date, principal_amount, paid_amount, status, financial_titles!inner(direction)")
      .eq("financial_titles.direction", "receivable")
      .in("status", ["aberto", "vencido"])
      .limit(1000),
    admin
      .from("financial_installments")
      .select("due_date, principal_amount, paid_amount, status, financial_titles!inner(direction)")
      .eq("financial_titles.direction", "payable")
      .in("status", ["aberto", "vencido"])
      .limit(1000),
    admin
      .from("order_items")
      .select("total, quantity, orders!inner(created_at, status), catalog_items(item_commercial_data(cost_price))")
      .eq("orders.tenant_id", tenantId)
      .gte("orders.created_at", iso(inicio))
      .lt("orders.created_at", iso(fim))
      .not("orders.status", "in", "(cancelado,aguardando_pagamento)")
      .limit(5000),
  ]);

  const somaTotal = (rows: { total_amount: number | string }[] | null) =>
    (rows ?? []).reduce((a, r) => a + Number(r.total_amount), 0);

  const fatPeriodo = somaTotal(pedCur.data);
  const fatAnterior = somaTotal(pedAnt.data);
  const pedidos = (pedCur.data ?? []).length;
  const pedidosAnt = (pedAnt.data ?? []).length;
  const ticket = pedidos > 0 ? fatPeriodo / pedidos : 0;
  const ticketAnt = pedidosAnt > 0 ? fatAnterior / pedidosAnt : 0;
  const clientesNovos = (cliCur.data ?? []).length;

  const parcelaSaldo = (p: { principal_amount: number | string; paid_amount: number | string }) =>
    Number(p.principal_amount) - Number(p.paid_amount);
  const receber7d = (receivable.data ?? [])
    .filter((p) => String(p.due_date) <= em7d)
    .reduce((a, p) => a + parcelaSaldo(p), 0);
  const pagar7d = (payable.data ?? [])
    .filter((p) => String(p.due_date) <= em7d)
    .reduce((a, p) => a + parcelaSaldo(p), 0);
  const atrasadas = [...(receivable.data ?? []), ...(payable.data ?? [])].filter(
    (p) => String(p.due_date) < hoje
  );
  const atrasadasValor = atrasadas.reduce((a, p) => a + parcelaSaldo(p), 0);

  let margem: number | null = null;
  let temCusto = false;
  let margemBase = 0;
  let custo = 0;
  for (const it of custos.data ?? []) {
    const cRaw = (it as { catalog_items: unknown }).catalog_items;
    const c = (Array.isArray(cRaw) ? cRaw[0] : cRaw) as { item_commercial_data: unknown } | null;
    const dRaw = c?.item_commercial_data;
    const d = (Array.isArray(dRaw) ? dRaw[0] : dRaw) as { cost_price: number | string } | null;
    if (d && d.cost_price != null) {
      temCusto = true;
      custo += Number(d.cost_price) * Number(it.quantity);
      margemBase += Number(it.total);
    }
  }
  if (temCusto) margem = margemBase - custo;

  const valores: Record<string, number> = {
    fat_periodo: fatPeriodo,
    fat_anterior: fatAnterior,
    var_fat: fatPeriodo - fatAnterior,
    var_fat_pct: fatAnterior > 0 ? ((fatPeriodo - fatAnterior) / fatAnterior) * 100 : 0,
    pedidos: pedidos,
    pedidos_anterior: pedidosAnt,
    ticket: ticket,
    ticket_anterior: ticketAnt,
    clientes_novos: clientesNovos,
    receber_7d: receber7d,
    pagar_7d: pagar7d,
    atrasadas_qtd: atrasadas.length,
    atrasadas_valor: atrasadasValor,
  };
  const formatos: Record<string, Formato> = {
    fat_periodo: "brl",
    fat_anterior: "brl",
    var_fat: "brl",
    var_fat_pct: "pct",
    pedidos: "int",
    pedidos_anterior: "int",
    ticket: "brl",
    ticket_anterior: "brl",
    clientes_novos: "int",
    receber_7d: "brl",
    pagar_7d: "brl",
    atrasadas_qtd: "int",
    atrasadas_valor: "brl",
  };
  if (margem != null) {
    valores.margem = margem;
    formatos.margem = "brl";
  }

  const faltamDados: string[] = [];
  if (pedidos === 0) faltamDados.push("nenhuma venda lançada neste período");
  if (!temCusto) faltamDados.push("sem custo cadastrado nos produtos, margem não calculada");
  if (receber7d === 0 && pagar7d === 0)
    faltamDados.push("nenhuma conta a pagar ou receber lançada para os próximos 7 dias");
  if (atrasadas.length === 0) faltamDados.push("nenhuma conta atrasada — ótimo");

  return { valores, formatos, faltamDados };
}

// ---------------------------------------------------------------------------
// 2) Validação (regra de ouro): etiqueta inexistente ou número solto => rejeita.
// ---------------------------------------------------------------------------
export function conferirCarta(texto: string, chaves: Set<string>): { ok: true } | { ok: false; motivo: string } {
  const etiquetas = texto.match(/\{[a-z_]+\}/gi) ?? [];
  for (const e of etiquetas) {
    if (!chaves.has(e.slice(1, -1).toLowerCase())) {
      return { ok: false, motivo: `etiqueta_inexistente:${e}` };
    }
  }
  const semEtiquetas = texto.replace(/\{[a-z_]+\}/gi, "");
  // Regra de ouro: rejeita DINHEIRO (R$ 1.234,56) ou decimal (12,5) escritos
  // direto = métrica inventada no lugar de uma etiqueta. Inteiro avulso em prosa
  // ("próximos 7 dias", "três clientes") passa - a IA o escreve por contexto.
  if (/R\$\s*[\d.,]/.test(semEtiquetas) || /\d+[.,]\d/.test(semEtiquetas)) {
    return { ok: false, motivo: "numero_fora_de_etiqueta" };
  }
  return { ok: true };
}

export function substituir(texto: string, ind: Indicadores): string {
  return texto.replace(/\{([a-z_]+)\}/gi, (m, chave: string) => {
    const k = chave.toLowerCase();
    const v = ind.valores[k];
    return v == null ? m : formatar(k, v, ind.formatos);
  });
}

// ---------------------------------------------------------------------------
// 3) Gerar a carta: IA escreve com etiquetas -> valida -> substitui.
// ---------------------------------------------------------------------------
export type ResultadoCarta =
  | { ok: true; carta: CartaTexto; status: "completa" | "incompleta" }
  | { ok: false; erro: string };

const FORMATO_JSON =
  '{"resumo":"uma frase","melhorou":["frase","frase"],"piorou":["frase"],"atencao":["frase"],"faltam_dados":["o que falta"],"acoes":[{"texto":"o que fazer","prazo":"prazo"}]}';

function promptCarta(ind: Indicadores, tipo: "semanal" | "mensal"): string {
  const chaves = Object.keys(ind.valores)
    .map((k) => `{${k}}`)
    .join(", ");
  const faltam = ind.faltamDados.length ? ind.faltamDados.join("; ") : "nenhuma";
  return [
    `Você escreve a ${tipo === "mensal" ? "carta do mês" : "carta da semana"} para o dono da Nuvem de Papel, uma papelaria. Tom de dono para dono, frases curtas, português simples, sem jargão.`,
    "REGRA DE OURO: você NÃO calcula nem inventa número. Use SOMENTE os valores via etiqueta {chave}; o sistema troca cada etiqueta pelo número real. NUNCA escreva valores monetários ou decimais com dígito (como R$ 1.234,56 ou 12,5%) — isso é rejeitado. Quantidades pequenas em prosa escreva por extenso (sete dias, três clientes) ou use a etiqueta certa.",
    "Se uma informação faltar (a seção faltam_dados diz o que falta), diga que falta e o que lançar — nunca estime.",
    "Nunca dê conselho de imposto, empréstimo ou jurídico: mande falar com o contador.",
    `Etiquetas disponíveis (use exatamente entre chaves): ${chaves}.`,
    `Dados faltantes informados pelo sistema: ${faltam}.`,
    "",
    "Responda SOMENTE com um JSON válido, sem markdown, exatamente neste formato:",
    FORMATO_JSON,
    "melhorou e piorou: no máximo 3 itens cada, comparando com o período anterior via etiqueta. acoes: 1 a 3. Use etiquetas como {fat_periodo}, {var_fat_pct}, {receber_7d}, {atrasadas_qtd} onde couber.",
  ].join("\n");
}

function parseCarta(json: string): CartaTexto | null {
  try {
    const obj = JSON.parse(json) as Partial<CartaTexto>;
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
    const acoes = Array.isArray(obj.acoes)
      ? obj.acoes.map((a) => ({ texto: String(a?.texto ?? ""), prazo: String(a?.prazo ?? "") }))
      : [];
    return {
      resumo: String(obj.resumo ?? ""),
      melhorou: arr(obj.melhorou),
      piorou: arr(obj.piorou),
      atencao: arr(obj.atencao),
      faltam_dados: arr(obj.faltam_dados),
      acoes,
    };
  } catch {
    return null;
  }
}

function validarESubstituir(
  carta: CartaTexto,
  ind: Indicadores
): { ok: true; carta: CartaTexto } | { ok: false; motivo: string } {
  const chaves = new Set(Object.keys(ind.valores));
  const todas = [
    carta.resumo,
    ...carta.melhorou,
    ...carta.piorou,
    ...carta.atencao,
    ...carta.faltam_dados,
    ...carta.acoes.map((a) => `${a.texto} ${a.prazo}`),
  ].filter(Boolean);
  for (const t of todas) {
    const c = conferirCarta(t, chaves);
    if (!c.ok) return c;
  }
  const sub = (t: string) => substituir(t, ind);
  return {
    ok: true,
    carta: {
      resumo: sub(carta.resumo),
      melhorou: carta.melhorou.map(sub),
      piorou: carta.piorou.map(sub),
      atencao: carta.atencao.map(sub),
      faltam_dados: carta.faltam_dados.map(sub),
      acoes: carta.acoes.map((a) => ({ texto: sub(a.texto), prazo: sub(a.prazo) })),
    },
  };
}

export async function gerarCarta(
  ind: Indicadores,
  tipo: "semanal" | "mensal"
): Promise<ResultadoCarta> {
  const prompt = promptCarta(ind, tipo);
  let ultimoMotivo = "";

  // até 2 tentativas: cobre FALHA transitória da IA (sobrecarga/timeout do
  // provedor) e FALHA de validação (etiqueta/número inventado). Só se as 2
  // tentativas de transporte falharem é que devolve erro de verdade.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await gerarTexto(prompt);
    if (!r.ok) {
      ultimoMotivo = `ia:${r.motivo}`;
      if (tentativa === 0) {
        await new Promise((s) => setTimeout(s, 2500)); // espera a pancada de demanda
        continue;
      }
      return { ok: false, erro: `ia_falhou:${r.motivo}` };
    }

    const bruto = r.texto.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = parseCarta(bruto);
    if (!parsed) {
      ultimoMotivo = "json_invalido";
      continue;
    }
    const val = validarESubstituir(parsed, ind);
    if (!val.ok) {
      ultimoMotivo = val.motivo;
      continue;
    }
    return { ok: true, carta: val.carta, status: "completa" };
  }

  return {
    ok: true,
    carta: {
      resumo: `Não consegui fechar a carta completa (${ultimoMotivo}). Os números do período estão no painel.`,
      melhorou: [],
      piorou: [],
      atencao: ind.faltamDados,
      faltam_dados: ind.faltamDados,
      acoes: [],
    },
    status: "incompleta",
  };
}
