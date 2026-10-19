import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

// Opt-out LGPD por link (rota publica, sem auth). Quem clica em "sair da lista"
// no e-mail de reativação é marcado como `saiu` e nunca mais recebe nada, nem
// se a base for reimportada. Token = customer_reactivation.descadastro_token.
// GET porque clientes de e-mail não fazem POST em link.

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pagina(msg: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Nuvem de Papel</title>` +
      `<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#F6F4FA;margin:0">` +
      `<div style="max-width:420px;padding:32px;background:#fff;border-radius:16px;border:1px solid #E4E0EE;text-align:center">` +
      `<h1 style="font-size:20px;color:#2D2A32;margin:0 0 12px">Nuvem de Papel</h1>` +
      `<p style="font-size:15px;color:#4A4550;line-height:1.6;margin:0">${msg}</p>` +
      `</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token;
  if (!UUID_RE.test(token)) return pagina("Link inválido.");

  const admin = createAdminClient();
  const { data } = await admin
    .from("customer_reactivation")
    .update({ status: "saiu" })
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("descadastro_token", token)
    .neq("status", "saiu")
    .select("id");

  if (data && data.length === 1) {
    return pagina("Pronto! Você não vai mais receber mensagens nossas. Até logo.");
  }
  // já estava saiu ou token não encontrado: mesma mensagem amigável
  return pagina("Pronto! Você não vai mais receber mensagens nossas. Até logo.");
}
