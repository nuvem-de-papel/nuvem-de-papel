import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

// Webhook generico de marketplace (Modulo 1 - intake). Fail-closed (mesmo
// ritual do Mercado Pago, F3): sem MARKETPLACE_WEBHOOK_SECRET → 503; sem o
// header x-marketplace-secret → 401. Idempotencia: unique (channel_id,
// event_id) - o replay do canal vira "duplicado" e nao enche a fila.
//
// O evento NUNCA e processado aqui: o handler de cada canal roda DEPOIS, na
// fila (job processar_webhook), para respeitar rate limit e nao segurar a
// requisicao do marketplace aberta.

export const dynamic = "force-dynamic";

type CorpoWebhook = {
  channel_slug?: unknown;
  event_id?: unknown;
  topic?: unknown;
  payload?: unknown;
};

export async function POST(req: NextRequest) {
  const secret = process.env.MARKETPLACE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ erro: "webhook nao configurado" }, { status: 503 });
  }
  if (req.headers.get("x-marketplace-secret") !== secret) {
    return NextResponse.json({ erro: "assinatura invalida" }, { status: 401 });
  }

  let body: CorpoWebhook;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const channelSlug = typeof body.channel_slug === "string" ? body.channel_slug : "";
  const eventId = typeof body.event_id === "string" ? body.event_id : "";
  const topic = typeof body.topic === "string" && body.topic ? body.topic : "desconhecido";
  if (!channelSlug || !eventId) {
    return NextResponse.json({ erro: "channel_slug e event_id sao obrigatorios" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: canal } = await admin
    .from("marketplace_channels")
    .select("id")
    .eq("slug", channelSlug)
    .maybeSingle();
  if (!canal) {
    return NextResponse.json({ erro: "canal desconhecido" }, { status: 404 });
  }

  // idempotencia: linha nova; replay = linha antiga, fila intocada
  const { data: registrado } = await admin
    .from("marketplace_webhooks")
    .upsert(
      {
        tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
        channel_id: canal.id,
        event_id: eventId,
        topic,
        payload: (body.payload ?? {}) as Record<string, unknown>,
      },
      { onConflict: "channel_id,event_id", ignoreDuplicates: true }
    )
    .select("id");
  if (!registrado || registrado.length === 0) {
    return NextResponse.json({ status: "duplicado", processado: false });
  }

  // o que acontece com o evento depende do ADAPTADOR do canal - e so a fila
  // decide (dedupe impede o replay de enfileirar o mesmo evento duas vezes)
  const { error: erroJob } = await admin.rpc("marketplace_enqueue", {
    p_tenant: NUVEM_DE_PAPEL_TENANT_ID,
    p_channel: canal.id,
    p_tipo: "processar_webhook",
    p_payload: { webhook_id: registrado[0].id, topic, event_id: eventId },
    p_dedupe: `webhook:${channelSlug}:${eventId}`,
  });
  if (erroJob) {
    // evento ja gravado: devolve 500 para o canal reenviar (o dedupe cobre o
    // reenvio - a linha ja existe, so o job novo entra)
    return NextResponse.json({ erro: erroJob.message }, { status: 500 });
  }

  return NextResponse.json({ status: "recebido", processado: true });
}
