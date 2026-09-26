import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { buscarPagamento, validarAssinaturaWebhook } from "@/lib/mercadopago";

// Webhook Mercado Pago (F3) + estoque (F4). Fail-closed: sem MP_WEBHOOK_SECRET
// → 503. Idempotência: webhook_events (provider, external_id, event_type) único.
// Mapa de status: approved → pago (+ settle de estoque: venda+liberacao);
// cancelled/rejected → cancelado (+ release: libera reserva ou devolve via
// devolucao). Baixa/liberação são idempotentes (marcadores no ledger) — o
// evento pode ser reprocessado após falha parcial sem descontar em dobro.
// MP_MOCK=1 (só fora da Vercel) lê o status direto no payload para o E2E
// local não depender da API do MP; em produção o status vem sempre do MP.

export const dynamic = "force-dynamic";

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
  if (!registrado || registrado.length === 0) {
    return NextResponse.json({ status: "duplicado" });
  }
  const eventoId = registrado[0].id as string;

  if (String(tipo) !== "payment") {
    return NextResponse.json({ status: "ignorado", tipo });
  }

  const mock = process.env.MP_MOCK === "1" && process.env.VERCEL !== "1";
  const pagamento = mock
    ? { status: body.status ?? null, externalReference: body.external_reference ?? null }
    : await buscarPagamento(externalId);
  if (!pagamento.status || !pagamento.externalReference) {
    // não conseguiu processar → libera o retry do MP
    await admin.from("webhook_events").delete().eq("id", eventoId);
    return NextResponse.json({ erro: "falha ao processar pagamento" }, { status: 500 });
  }

  const ref = pagamento.externalReference;

  if (pagamento.status === "approved") {
    const { error } = await admin
      .from("orders")
      .update({ status: "pago", mp_payment_id: externalId })
      .eq("id", ref)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .in("status", ["aguardando_pagamento"]);
    if (error) {
      await admin.from("webhook_events").delete().eq("id", eventoId);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }
    // settle só quando o pedido chegou (ou já está) em fase pós-pagamento —
    // cobre retry após falha parcial (status ok, estoque falhou antes);
    // referência desconhecida vira 200 para não entrar em loop de retry.
    const { data: pedido } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", ref)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .maybeSingle();
    if (pedido && ["pago", "processando", "em_rota", "entregue"].includes(pedido.status)) {
      const { error: erroBaixa } = await admin.rpc("settle_order_stock", { p_order_id: ref });
      if (erroBaixa) {
        await admin.from("webhook_events").delete().eq("id", eventoId);
        return NextResponse.json({ erro: erroBaixa.message }, { status: 500 });
      }
    }
  } else if (pagamento.status === "cancelled" || pagamento.status === "rejected") {
    const { error } = await admin
      .from("orders")
      .update({ status: "cancelado", mp_payment_id: externalId })
      .eq("id", ref)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .in("status", ["aguardando_pagamento", "pago"]);
    if (error) {
      await admin.from("webhook_events").delete().eq("id", eventoId);
      return NextResponse.json({ erro: error.message }, { status: 500 });
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
        await admin.from("webhook_events").delete().eq("id", eventoId);
        return NextResponse.json({ erro: erroLibera.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ status: "processado" });
}
