import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { buscarPagamento, buscarPreapproval, validarAssinaturaWebhook } from "@/lib/mercadopago";
import { notificarStatusPedido } from "@/lib/pedido-notificar";
import { confirmarPagamentoAprovado } from "@/lib/pagamento-confirmar";

// Webhook Mercado Pago (F3) + estoque (F4). Fail-closed: sem MP_WEBHOOK_SECRET
// → 503. Idempotência: webhook_events (provider, external_id, event_type) único.
// Mapa de status: approved → pago (+ settle de estoque: venda+liberacao);
// cancelled/rejected → cancelado (+ release: libera reserva ou devolve via
// devolucao). Baixa/liberação são idempotentes (marcadores no ledger) — o
// evento pode ser reprocessado após falha parcial sem descontar em dobro.
// MP_MOCK=1 (só fora da Vercel) lê o status direto no payload para o E2E
// local não depender da API do MP; em produção o status vem sempre do MP.
// Falha NÃO apaga mais a linha de webhook_events (17/11/2026): grava
// payload._falha e o retry do MP reprocessa — ver bloco "Rastro de falha".

export const dynamic = "force-dynamic";

type Falha = { motivo: string; em: string; tentativas: number };

type CorpoWebhook = {
  type?: string;
  topic?: string;
  data?: { id?: string | number };
  status?: string;
  external_reference?: string;
};

export async function POST(req: NextRequest) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ erro: "webhook nao configurado" }, { status: 503 });
  }

  const raw = await req.text();
  const assinaturaOk = validarAssinaturaWebhook(
    raw,
    req.headers.get("x-signature"),
    req.headers.get("x-request-id"),
    secret
  );
  if (!assinaturaOk) {
    return NextResponse.json({ erro: "assinatura invalida" }, { status: 401 });
  }

  let body: CorpoWebhook;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const tipo = body.type ?? body.topic ?? "desconhecido";
  const externalId = body.data?.id !== undefined ? String(body.data.id) : null;
  if (!externalId) {
    return NextResponse.json({ status: "sem_evento" });
  }

  const admin = createAdminClient();

  // idempotência
  const { data: registrado } = await admin
    .from("webhook_events")
    .upsert(
      {
        tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
        provider: "mercadopago",
        external_id: externalId,
        event_type: String(tipo),
        payload: body as unknown as Record<string, unknown>,
      },
      { onConflict: "provider,external_id,event_type", ignoreDuplicates: true }
    )
    .select("id");

  // Rastro de falha (17/11/2026): antes, toda falha APAGAVA a linha para
  // liberar o retry do MP — e o rastro sumia (2 Pix pagos ficaram em
  // aguardando_pagamento sem nenhum registro do porquê). Agora a falha fica
  // gravada em payload._falha {motivo, em, tentativas}; um evento repetido
  // que tem _falha é REPROCESSADO (o retry do MP continua funcionando) e um
  // repetido sem _falha continua "duplicado". Reprocessar é seguro: a troca
  // de status é guardada por .in("status", [...]) e settle/release de
  // estoque são idempotentes.
  let eventoId: string;
  let falhaAnterior: Falha | null = null;
  if (registrado && registrado.length > 0) {
    eventoId = registrado[0].id as string;
  } else {
    const { data: existente } = await admin
      .from("webhook_events")
      .select("id, payload")
      .eq("provider", "mercadopago")
      .eq("external_id", externalId)
      .eq("event_type", String(tipo))
      .maybeSingle();
    const falha = (existente?.payload as { _falha?: Falha } | null)?._falha;
    if (!existente || !falha) {
      return NextResponse.json({ status: "duplicado" });
    }
    eventoId = existente.id as string;
    falhaAnterior = falha;
  }

  const falhar = async (motivo: string, http = 500) => {
    const tentativas = (falhaAnterior?.tentativas ?? 0) + 1;
    console.error(
      `[webhook-mp] falha tipo=${tipo} id=${externalId} tentativa=${tentativas}: ${motivo}`
    );
    await admin
      .from("webhook_events")
      .update({
        payload: { ...body, _falha: { motivo, em: new Date().toISOString(), tentativas } },
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventoId);
    return NextResponse.json({ erro: motivo }, { status: http });
  };

  // sucesso depois de falha: limpa o _falha (o próximo repetido vira duplicado)
  const concluir = async (resposta: Record<string, unknown>) => {
    if (falhaAnterior) {
      await admin
        .from("webhook_events")
        .update({
          payload: { ...body, _resolvido: { apos_tentativas: falhaAnterior.tentativas } },
          processed_at: new Date().toISOString(),
        })
        .eq("id", eventoId);
    }
    return NextResponse.json(resposta);
  };

  // Clube (F7): topico preapproval = ativa/pausa/cancela a assinatura do
  // cliente. Mesmo contrato dos pagamentos: idempotente (webhook_events),
  // MP_MOCK=1 le o status do payload (E2E local), producao consulta a API.
  if (String(tipo) === "preapproval") {
    const mockPre = process.env.MP_MOCK === "1" && process.env.VERCEL !== "1";
    const pre = mockPre
      ? { status: body.status ?? null, nextPaymentDate: null, motivo: "mock_sem_status" }
      : await buscarPreapproval(externalId);
    if (!pre.status) {
      // nao conseguiu processar → grava o motivo; o retry do MP reprocessa
      return falhar(`assinatura: ${pre.motivo ?? "sem_status"}`);
    }
    const mapaStatus: Record<string, string> = {
      approved: "ativa",
      authorized: "ativa",
      pending: "pendente",
      paused: "pausada",
      cancelled: "cancelada",
    };
    const novo = mapaStatus[pre.status];
    if (!novo) {
      return concluir({ status: "ignorado", tipo: pre.status });
    }
    const agora = new Date();
    const patch: Record<string, unknown> = {
      status: novo,
      updated_at: agora.toISOString(),
    };
    if (novo === "ativa") {
      patch.current_period_start = agora.toISOString();
      patch.current_period_end =
        pre.nextPaymentDate ??
        new Date(agora.getTime() + 30 * 24 * 3600 * 1000).toISOString();
    }
    // cancelada nunca volta: um evento tardio nao ressuscita a assinatura
    const { data: alterada, error: erroSub } = await admin
      .from("club_subscriptions")
      .update(patch)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("mp_preapproval_id", externalId)
      .in("status", ["pendente", "ativa", "pausada"])
      .select("id");
    if (erroSub) {
      return falhar(`assinatura_update: ${erroSub.message}`);
    }
    // referencia desconhecida vira 200 para o MP nao entrar em loop de retry
    return concluir({
      status: alterada && alterada.length > 0 ? "processado" : "sem_assinatura",
    });
  }

  if (String(tipo) !== "payment") {
    return concluir({ status: "ignorado", tipo });
  }

  const mock = process.env.MP_MOCK === "1" && process.env.VERCEL !== "1";
  const pagamento = mock
    ? {
        status: body.status ?? null,
        externalReference: body.external_reference ?? null,
        motivo: body.status ? null : "mock_sem_status",
      }
    : await buscarPagamento(externalId);
  if (!pagamento.status || !pagamento.externalReference) {
    // não conseguiu processar → grava o motivo; o retry do MP reprocessa
    return falhar(`pagamento: ${pagamento.motivo ?? "sem_status_ou_referencia"}`);
  }

  const ref = pagamento.externalReference;

  if (pagamento.status === "approved") {
    // mesma regra da volta do cliente e do botão da logística
    // (src/lib/pagamento-confirmar.ts): troca de status 1x, e-mail 1x,
    // settle idempotente; referência desconhecida vira 200 (sem loop de retry)
    const r = await confirmarPagamentoAprovado(admin, ref, externalId);
    if (!r.ok) {
      return falhar(r.motivo);
    }
  } else if (pagamento.status === "cancelled" || pagamento.status === "rejected") {
    const { data: cancelado, error } = await admin
      .from("orders")
      .update({ status: "cancelado", mp_payment_id: externalId })
      .eq("id", ref)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .in("status", ["aguardando_pagamento", "pago"])
      .select("id");
    if (error) {
      return falhar(`pedido_cancelado: ${error.message}`);
    }
    // aviso de cancelamento (entrega 2): só na transição real, 1x — uma
    // reentrega do MP não repete (best-effort: nunca derruba o webhook)
    if (cancelado && cancelado.length === 1) {
      await notificarStatusPedido(admin, ref, "cancelado");
    }
    const { data: pedido } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", ref)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .maybeSingle();
    if (pedido && pedido.status === "cancelado") {
      const { error: erroLibera } = await admin.rpc("release_order_stock", { p_order_id: ref });
      if (erroLibera) {
        return falhar(`libera_estoque: ${erroLibera.message}`);
      }
    }
  }

  return concluir({ status: "processado" });
}
