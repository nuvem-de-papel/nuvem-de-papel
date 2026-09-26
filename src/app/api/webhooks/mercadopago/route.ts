import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { buscarPagamento, validarAssinaturaWebhook } from "@/lib/mercadopago";

// Webhook Mercado Pago (F3). Fail-closed: sem MP_WEBHOOK_SECRET → 503.
// Idempotência: webhook_events (provider, external_id, event_type) único —
// evento repetido é confirmado e ignorado; se o processamento falhar, o
// registro é removido para o MP poder reenviar (retry).
// Mapa de status: approved → pago; cancelled/rejected → cancelado
// (nunca reescreve pedido já em separação/entrega).

export const dynamic = "force-dynamic";

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

  let body: { type?: string; topic?: string; data?: { id?: string | number } };
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

  const pagamento = await buscarPagamento(externalId);
  if (!pagamento.status || !pagamento.externalReference) {
    // não conseguiu processar → libera o retry do MP
    await admin.from("webhook_events").delete().eq("id", eventoId);
    return NextResponse.json({ erro: "falha ao processar pagamento" }, { status: 500 });
  }

  if (pagamento.status === "approved") {
    const { error } = await admin
      .from("orders")
      .update({ status: "pago", mp_payment_id: externalId })
      .eq("id", pagamento.externalReference)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .in("status", ["aguardando_pagamento"]);
    if (error) {
      await admin.from("webhook_events").delete().eq("id", eventoId);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }
  } else if (pagamento.status === "cancelled" || pagamento.status === "rejected") {
    const { error } = await admin
      .from("orders")
      .update({ status: "cancelado", mp_payment_id: externalId })
      .eq("id", pagamento.externalReference)
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .in("status", ["aguardando_pagamento", "pago"]);
    if (error) {
      await admin.from("webhook_events").delete().eq("id", eventoId);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ status: "processado" });
}
