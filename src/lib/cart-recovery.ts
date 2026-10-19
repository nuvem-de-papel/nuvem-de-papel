// Motor da régua de recuperação de carrinho abandonado (0036). Pedido que
// ficou parado em `aguardando_pagamento` recebe lembrete por e-mail (Resend)
// 1, 3 e 7 dias depois de criado — só a etapa mais recente que faltar, com o
// link de pagamento (orders.mp_init_point) que o checkout passou a gravar.
// PARA sozinha: só considera pedidos ainda em `aguardando_pagamento` (ao virar
// `pago` pelo webhook 0007:97 ou `cancelado`, saem da consulta). Idempotência
// por unique (order_id, rule_id) em cart_recovery_sends. Best-effort, mesmo
// contrato de src/lib/cobranca.ts (0035).

import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { enviarEmail, codigoPedido } from "@/lib/email";

export type ResumoRecuperacao = {
  ok: boolean;
  avaliadas: number;
  enviadas: number;
  falhas: number;
  puladasSemLink: number;
  detalhe: string[];
};

type Regra = { id: string; dias: number; ativo: boolean; texto: string };

const EMPRESA = "Nuvem de Papel";
const DIA_MS = 86400000;

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function preencher(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (_m, chave: string) => vars[chave] ?? "");
}

function montarHtml(corpo: string): string {
  const linhas = escaparHtml(corpo).replace(/\n/g, "<br>");
  return (
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#2D2A32">' +
    `<p>${linhas}</p>` +
    '<p style="color:#8A8296;font-size:12px;margin-top:24px">' +
    `${EMPRESA} — esta é uma mensagem automática. Para falar com uma pessoa, responda este e-mail.</p>` +
    "</div>"
  );
}

export async function executarReguaRecuperacao(): Promise<ResumoRecuperacao> {
  const admin = createAdminClient();
  const tenantId = NUVEM_DE_PAPEL_TENANT_ID;
  const agora = Date.now();

  const resumo: ResumoRecuperacao = {
    ok: true,
    avaliadas: 0,
    enviadas: 0,
    falhas: 0,
    puladasSemLink: 0,
    detalhe: [],
  };

  // 1. régua ativa
  const { data: regras, error: erroRegras } = await admin
    .from("cart_recovery_rules")
    .select("id, dias, ativo, texto")
    .eq("tenant_id", tenantId)
    .eq("ativo", true)
    .order("dias", { ascending: true });

  if (erroRegras) {
    return { ...resumo, ok: false, detalhe: [`regua: ${erroRegras.message}`] };
  }
  const regrasAtivas: Regra[] = regras ?? [];
  if (regrasAtivas.length === 0) {
    return { ...resumo, detalhe: ["regua vazia - nada a fazer"] };
  }

  // janela: pedidos velhos o bastante para a MENOR regra já ter vencido
  // (minDias, nao maxDias — senão um pedido de 2 dias ficaria fora da janela
  // de 1..7 e nunca receberia o toque +1d)
  const minDias = Math.min(...regrasAtivas.map((r) => r.dias));
  const limite = new Date(agora - minDias * DIA_MS).toISOString();

  // 2. pedidos parados no aguardando_pagamento (o status e o filtro de parada)
  const { data: pedidos, error: erroPedidos } = await admin
    .from("orders")
    .select("id, created_at, total_amount, mp_init_point, customer_id")
    .eq("tenant_id", tenantId)
    .eq("status", "aguardando_pagamento")
    .lte("created_at", limite)
    .order("created_at", { ascending: true })
    .limit(300);

  if (erroPedidos) {
    return { ...resumo, ok: false, detalhe: [`pedidos: ${erroPedidos.message}`] };
  }
  const linhas = pedidos ?? [];
  if (linhas.length === 0) return resumo;

  // 3. clientes dos pedidos (join manual customer_id -> customers)
  const idsClientes = [...new Set(linhas.map((l) => l.customer_id).filter(Boolean) as string[])];
  const clientes = new Map<string, { name: string; email: string | null }>();
  if (idsClientes.length > 0) {
    const { data } = await admin
      .from("customers")
      .select("id, name, email")
      .in("id", idsClientes);
    for (const c of data ?? []) clientes.set(c.id, { name: c.name, email: c.email });
  }

  // 4. toques ja enviados (idempotencia)
  const idsPedidos = linhas.map((l) => l.id);
  const enviados = new Set<string>();
  const { data: toques } = await admin
    .from("cart_recovery_sends")
    .select("order_id, rule_id")
    .in("order_id", idsPedidos);
  for (const t of toques ?? []) enviados.add(`${t.order_id}|${t.rule_id}`);

  // 5. processa cada pedido
  for (const p of linhas) {
    resumo.avaliadas++;

    const cliente = p.customer_id ? clientes.get(p.customer_id) : undefined;
    const email = String(cliente?.email ?? "").trim();
    const link = String(p.mp_init_point ?? "").trim();
    if (!email || !link) {
      // sem link nao ha "clique e pague" - toque vira muro de texto, entao pula
      resumo.puladasSemLink++;
      continue;
    }

    const diffDias = Math.floor((agora - new Date(p.created_at).getTime()) / DIA_MS);
    const devidas = regrasAtivas.filter((r) => r.dias <= diffDias && !enviados.has(`${p.id}|${r.id}`));
    if (devidas.length === 0) continue;
    // so a etapa mais recente que falta (nunca 3 atrasadas de uma vez)
    const etapa = devidas.reduce((a, b) => (b.dias > a.dias ? b : a));

    const vars = {
      nome: String(cliente?.name ?? "").trim().split(/\s+/)[0] || "cliente",
      empresa: EMPRESA,
      codigo: codigoPedido(p.id),
      valor: brl(Number(p.total_amount)),
      link,
    };
    const corpo = preencher(etapa.texto, vars);
    const assunto = `Seu pedido ${vars.codigo} ainda aguarda pagamento`;

    const r = await enviarEmail(email, assunto, montarHtml(corpo), {
      fonte: "system",
      relatedEntity: "orders",
      relatedId: p.id,
    });

    await admin.from("cart_recovery_sends").insert({
      tenant_id: tenantId,
      order_id: p.id,
      rule_id: etapa.id,
      sucesso: r.ok,
      erro: r.motivo ?? null,
      email_message_id: r.id ?? null,
    });

    if (r.ok) {
      resumo.enviadas++;
      resumo.detalhe.push(`${vars.codigo}: toque ${etapa.dias}d → ${email}`);
    } else {
      resumo.falhas++;
      resumo.detalhe.push(`${vars.codigo}: falhou (${r.motivo})`);
    }
  }

  return resumo;
}
