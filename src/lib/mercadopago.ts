import { createHmac, timingSafeEqual } from "node:crypto";

// Camada Mercado Pago (F3) — REST direto (sem SDK), server-side apenas.
// Token nunca sai do servidor. Assinatura de webhook valida HMAC-SHA256 do
// manifesto "id:...;request-id:...;ts:..." (docs MP: x-signature).

type ResultadoPref =
  | { ok: true; initPoint: string; preferenceId: string }
  | { ok: false; motivo: string };

export function mpConfigurado(): boolean {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN ?? "";
  return token.length > 20 && token.includes("-");
}

function siteBase(): string {
  const custom = process.env.NEXT_PUBLIC_SITE_URL;
  if (custom) return custom.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? "3000"}`;
}

export async function criarPreferencia(input: {
  pedidoId: string;
  itens: { title: string; unit_price: number; quantity: number; id: string }[];
  pagador: { email: string; name: string };
  total: number;
}): Promise<ResultadoPref> {
  if (!mpConfigurado()) return { ok: false, motivo: "mp_ausente" };

  const base = siteBase();
  try {
    const resp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: input.itens.map((i) => ({ ...i, currency_id: "BRL" })),
        payer: input.pagador,
        external_reference: input.pedidoId,
        statement_descriptor: "NUVEM DE PAPEL",
        back_urls: {
          success: `${base}/conta/pedidos`,
          failure: `${base}/carrinho`,
          pending: `${base}/conta/pedidos`,
        },
        notification_url: `${base}/api/webhooks/mercadopago`,
      }),
      cache: "no-store",
    });
    if (!resp.ok) {
      return { ok: false, motivo: `mp_http_${resp.status}` };
    }
    const data = (await resp.json()) as { id?: string; init_point?: string };
    if (!data.id || !data.init_point) return { ok: false, motivo: "mp_resposta_invalida" };
    return { ok: true, initPoint: data.init_point, preferenceId: data.id };
  } catch {
    return { ok: false, motivo: "mp_rede" };
  }
}

export async function buscarPagamento(paymentId: string): Promise<{
  status: string | null;
  externalReference: string | null;
}> {
  if (!mpConfigurado()) return { status: null, externalReference: null };
  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
      cache: "no-store",
    });
    if (!resp.ok) return { status: null, externalReference: null };
    const data = (await resp.json()) as { status?: string; external_reference?: string };
    return { status: data.status ?? null, externalReference: data.external_reference ?? null };
  } catch {
    return { status: null, externalReference: null };
  }
}

type ResultadoPreapproval =
  | { ok: true; preapprovalId: string }
  | { ok: false; motivo: string };

// Assinatura recorrente (F7 - Clube): preapproval do MP com cobranca mensal
// automatica. O status final chega pelo webhook (topico preapproval).
export async function criarPreapproval(input: {
  subscriptionId: string;
  payerEmail: string;
  reason: string;
  transactionAmount: number;
}): Promise<ResultadoPreapproval> {
  if (!mpConfigurado()) return { ok: false, motivo: "mp_ausente" };
  try {
    const resp = await fetch("https://api.mercadopago.com/v1/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: input.reason,
        external_reference: input.subscriptionId,
        payer_email: input.payerEmail,
        back_url: `${siteBase()}/conta/assinatura`,
        status: "pending",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: input.transactionAmount,
          currency_id: "BRL",
        },
      }),
      cache: "no-store",
    });
    if (!resp.ok) return { ok: false, motivo: `mp_http_${resp.status}` };
    const data = (await resp.json()) as { id?: string };
    if (!data.id) return { ok: false, motivo: "mp_resposta_invalida" };
    return { ok: true, preapprovalId: data.id };
  } catch {
    return { ok: false, motivo: "mp_rede" };
  }
}

export async function buscarPreapproval(preapprovalId: string): Promise<{
  status: string | null;
  dateCreated: string | null;
  nextPaymentDate: string | null;
}> {
  if (!mpConfigurado()) return { status: null, dateCreated: null, nextPaymentDate: null };
  try {
    const resp = await fetch(
      `https://api.mercadopago.com/v1/preapproval/${encodeURIComponent(preapprovalId)}`,
      {
        headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
        cache: "no-store",
      }
    );
    if (!resp.ok) return { status: null, dateCreated: null, nextPaymentDate: null };
    const data = (await resp.json()) as {
      status?: string;
      date_created?: string;
      next_payment_date?: string;
    };
    return {
      status: data.status ?? null,
      dateCreated: data.date_created ?? null,
      nextPaymentDate: data.next_payment_date ?? null,
    };
  } catch {
    return { status: null, dateCreated: null, nextPaymentDate: null };
  }
}

// cancelamento best-effort: o estado final da assinatura e confirmado
// localmente pela server action (o webhook apenas reforca).
export async function cancelarPreapproval(preapprovalId: string): Promise<boolean> {
  if (!mpConfigurado()) return false;
  try {
    const resp = await fetch(
      `https://api.mercadopago.com/v1/preapproval/${encodeURIComponent(preapprovalId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
        cache: "no-store",
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

function extrairIdDoCorpo(raw: string): string | null {
  try {
    const body = JSON.parse(raw) as { data?: { id?: string | number } };
    const id = body?.data?.id;
    if (id === undefined || id === null) return null;
    return String(id);
  } catch {
    return null;
  }
}

export function validarAssinaturaWebhook(
  rawBody: string,
  xSignature: string | null,
  xRequestId: string | null,
  secret: string
): boolean {
  if (!xSignature) return false;

  const campos: Record<string, string> = {};
  for (const parte of xSignature.split(",")) {
    const idx = parte.indexOf("=");
    if (idx <= 0) continue;
    campos[parte.slice(0, idx).trim()] = parte.slice(idx + 1).trim();
  }
  const ts = campos.ts;
  const v1 = campos.v1;
  if (!ts || !v1) return false;

  // ordem fixa do manifesto; campos ausentes são omitidos (regra do MP)
  let manifesto = "";
  const id = extrairIdDoCorpo(rawBody);
  if (id) manifesto += `id:${id};`;
  if (xRequestId) manifesto += `request-id:${xRequestId};`;
  manifesto += `ts:${ts};`;

  const esperado = createHmac("sha256", secret).update(manifesto).digest("hex");
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
