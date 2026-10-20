import { NextRequest, NextResponse } from "next/server";
import { executarReguaCobranca } from "@/lib/cobranca";

// Cron da régua de cobrança (0035). Fail-closed: sem CRON_SECRET → 503.
// Autenticação: header Authorization: Bearer <CRON_SECRET>. GET = o que o
// Vercel Cron dispara (vercel.json); POST = agendador externo (cron-job.org)
// ou teste manual. O botão do painel é server action e não passa por aqui.

export const dynamic = "force-dynamic";

async function rotear(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ erro: "cron nao configurado" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const resumo = await executarReguaCobranca();
  return NextResponse.json(resumo, { status: resumo.ok ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  return rotear(req);
}

export async function POST(req: NextRequest) {
  return rotear(req);
}
