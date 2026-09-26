import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

// Webhook Resend (F6.5): status do outbound (sent/delivered/opened/clicked/
// bounced/complained) + inbound da caixa (email.received). Fail-closed sem
// RESEND_WEBHOOK_SECRET → 503. Assinatura svix/Standard Webhooks com HMAC
// nativo (secret whsec_) e janela de replay de 5min; idempotência em
// webhook_events (provider 'resend', 0006). Status nunca regrexe e
// bounced/complained/failed/canceled são terminais. Inbound: corpo baixado da
// Receiving API (o evento traz só metadados), dedupe por Message-ID, anexos
// baixados na hora (signed URL expira) para o bucket privado email-attachments.

export const dynamic = "force-dynamic";

type Evento = {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    attachments?: unknown[];
  };
};

type EmailRecebido = {
  id: string;
  from?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string> | null;
  message_id?: string | null;
  attachments?: { id: string; filename?: string }[];
};

type AnexoResend = {
  id: string;
  filename?: string;
  content_type?: string;
  size?: number;
  download_url?: string;
};

const RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
};
const TERMINAIS = ["bounced", "complained", "failed", "canceled"];

function verificarAssinatura(
  payload: string,
  id: string | null,
  timestamp: string | null,
  assinatura: string | null,
  secret: string
): boolean {
  if (!id || !timestamp || !assinatura) return false;
  if (!/^\d{1,15}$/.test(timestamp)) return false;
  const desvio = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (desvio > 300) return false;
  const segredo = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const esperado = createHmac("sha256", Buffer.from(segredo, "base64"))
    .update(`${id}.${timestamp}.${payload}`)
    .digest();
  for (const parte of assinatura.trim().split(/\s+/)) {
    const [versao, valor] = parte.split(",", 2);
    if (versao !== "v1" || !valor) continue;
    const recebido = Buffer.from(valor, "base64");
    if (recebido.length === esperado.length && timingSafeEqual(recebido, esperado)) {
      return true;
    }
  }
  return false;
}

function extrairRemetente(bruto: string): { email: string; nome: string | null } {
  const m = /^(.*)<([^>]+)>$/.exec((bruto ?? "").trim());
  if (m) {
    const nome = m[1].trim().replace(/^"|"$/g, "");
    return { email: m[2].trim().toLowerCase(), nome: nome || null };
  }
  return { email: (bruto ?? "").trim().toLowerCase(), nome: null };
}

function sanitizarNomeArquivo(nome: string): string {
  const base = (nome || "anexo").split(/[\\/]/).pop() ?? "anexo";
  return base.replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "").slice(0, 80) || "anexo";
}

function statusPermitidos(destino: string): string[] {
  if (TERMINAIS.includes(destino)) return ["queued", "sent", "delivered", "opened", "clicked"];
  const alvo = RANK[destino];
  return Object.entries(RANK)
    .filter(([, rank]) => rank < alvo)
    .map(([nome]) => nome);
}

async function processarEventosStatus(
  admin: ReturnType<typeof createAdminClient>,
  tipo: string,
  emailId: string
): Promise<void> {
  const destino = tipo.replace("email.", "");
  if (destino === "clicked" || RANK[destino] || destino === "bounced" || destino === "complained") {
    const permitidos = statusPermitidos(destino);
    if (permitidos.length === 0) return;
    await admin
      .from("email_messages")
      .update({ status: destino, updated_at: new Date().toISOString() })
      .eq("resend_id", emailId)
      .eq("direction", "outbound")
      .in("status", permitidos);
  }
}

async function processarRecebido(
  admin: ReturnType<typeof createAdminClient>,
  emailId: string
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const auth = { Authorization: `Bearer ${process.env.RESEND_API_KEY}` };

  const resp = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: auth,
    signal: AbortSignal.timeout(15000),
  });
  if (resp.status === 404) {
    return { status: 200, corpo: { status: "email_ausente" } };
  }
  if (!resp.ok) {
    return { status: 500, corpo: { erro: `receiving_${resp.status}` } };
  }
  const email = (await resp.json()) as EmailRecebido;

  // anexos: metadados + download na hora (URL assinada expira) → bucket privado
  const guardados: {
    filename: string;
    content_type: string | null;
    size: number | null;
    storage_path: string;
  }[] = [];
  if (Array.isArray(email.attachments) && email.attachments.length > 0) {
    try {
      const listaResp = await fetch(
        `https://api.resend.com/emails/receiving/${emailId}/attachments`,
        { headers: auth, signal: AbortSignal.timeout(15000) }
      );
      if (listaResp.ok) {
        const lista = (await listaResp.json()) as { data?: AnexoResend[] };
        for (const att of lista.data ?? []) {
          if (!att.download_url) continue;
          const bin = await fetch(att.download_url, { signal: AbortSignal.timeout(20000) });
          if (!bin.ok) throw new Error(`download_${bin.status}`);
          const buffer = Buffer.from(await bin.arrayBuffer());
          const caminho = `${emailId}/${att.id}-${sanitizarNomeArquivo(att.filename ?? "")}`;
          const up = await admin.storage
            .from("email-attachments")
            .upload(caminho, buffer, {
              contentType: att.content_type || "application/octet-stream",
              upsert: true,
            });
          if (up.error) throw new Error(up.error.message);
          guardados.push({
            filename: att.filename ?? "anexo",
            content_type: att.content_type ?? null,
            size: att.size ?? null,
            storage_path: caminho,
          });
        }
      }
    } catch (e) {
      // anexo é best-effort: o e-mail entra mesmo sem ele (URL expira depois)
      console.error("[resend] anexo perdido:", e instanceof Error ? e.message : e);
    }
  }

  const remetente = extrairRemetente(email.from ?? "");
  const { data: linha, error } = await admin
    .from("email_messages")
    .insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      direction: "inbound",
      status: "received",
      source: "system",
      from_email: remetente.email || "desconhecido@invalido",
      from_name: remetente.nome,
      to_emails: email.to ?? [],
      cc_emails: email.cc ?? [],
      subject: email.subject ?? "",
      html: email.html ?? null,
      text: email.text ?? null,
      headers: email.headers ?? null,
      external_message_id: email.message_id || `resend:${emailId}`,
      attachments: guardados,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { status: 200, corpo: { status: "duplicado" } };
    console.error("[resend] insert inbound:", error.message);
    return { status: 500, corpo: { erro: "insert_falhou" } };
  }
  return { status: 200, corpo: { status: "recebido", id: linha?.id } };
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ erro: "webhook nao configurado" }, { status: 503 });
  }

  const payload = await req.text();
  const ok = verificarAssinatura(
    payload,
    req.headers.get("svix-id"),
    req.headers.get("svix-timestamp"),
    req.headers.get("svix-signature"),
    secret
  );
  if (!ok) {
    return NextResponse.json({ erro: "assinatura invalida" }, { status: 401 });
  }

  let evento: Evento;
  try {
    evento = JSON.parse(payload);
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const tipo = evento.type ?? "";
  const emailId = evento.data?.email_id;
  if (!tipo || !emailId) {
    return NextResponse.json({ status: "ignorado" });
  }

  const admin = createAdminClient();

  // idempotência (mesmo svix-id nunca reprocessa; falha apaga o registro p/ retry)
  const { data: registrado } = await admin
    .from("webhook_events")
    .upsert(
      {
        tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
        provider: "resend",
        external_id: emailId + ":" + tipo,
        event_type: tipo,
        payload: evento as unknown as Record<string, unknown>,
      },
      { onConflict: "provider,external_id,event_type", ignoreDuplicates: true }
    )
    .select("id");
  if (!registrado || registrado.length === 0) {
    return NextResponse.json({ status: "duplicado" });
  }
  const eventoId = registrado[0].id as string;

  if (tipo === "email.received") {
    const r = await processarRecebido(admin, emailId);
    if (r.status >= 500) await admin.from("webhook_events").delete().eq("id", eventoId);
    return NextResponse.json(r.corpo, { status: r.status });
  }

  if (tipo.startsWith("email.")) {
    try {
      await processarEventosStatus(admin, tipo, emailId);
    } catch (e) {
      console.error("[resend] status:", e instanceof Error ? e.message : e);
      await admin.from("webhook_events").delete().eq("id", eventoId);
      return NextResponse.json({ erro: "falha_status" }, { status: 500 });
    }
    return NextResponse.json({ status: "processado", tipo });
  }

  return NextResponse.json({ status: "ignorado", tipo });
}
