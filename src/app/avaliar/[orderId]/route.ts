import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

// Link curto de medição (rota publica, sem auth). Quem clica no pedido de
// avaliação tem o clique registrado em review_requests.link_clicado_em e cai no
// link real do Perfil da Empresa no Google (marketing_config.google_review_link).
// Idempotente: só grava o clique na primeira vez (evita sobrescrever com o
// horário de um segundo clique). Se não houver link configurado, mostra aviso.

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function aviso(msg: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Nuvem de Papel</title>` +
      `<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#F6F4FA;margin:0">` +
      `<div style="max-width:420px;padding:32px;background:#fff;border-radius:16px;border:1px solid #E4E0EE;text-align:center">` +
      `<p style="font-size:15px;color:#4A4550;line-height:1.6;margin:0">${msg}</p>` +
      `</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const orderId = params.orderId;
  if (!UUID_RE.test(orderId)) return aviso("Link inválido.");

  const admin = createAdminClient();

  // registra o clique (só na primeira vez)
  await admin
    .from("review_requests")
    .update({ link_clicado_em: new Date().toISOString() })
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("order_id", orderId)
    .is("link_clicado_em", null);

  const { data: cfg } = await admin
    .from("marketing_config")
    .select("google_review_link")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .maybeSingle();

  const link = String(cfg?.google_review_link ?? "").trim();
  if (!link) {
    return aviso("O link de avaliação ainda não foi configurado. Obrigado pelo interesse!");
  }
  return NextResponse.redirect(link, 302);
}
