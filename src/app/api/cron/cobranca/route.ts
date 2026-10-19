import { NextRequest, NextResponse } from "next/server";
import { executarReguaCobranca } from "@/lib/cobranca";

// Cron da régua de cobrança (0035). Fail-closed: sem CRON_SECRET → 503.
// Autenticação: header Authorization: Bearer <CRON_SECRET>. Pode ser chamada
// por um agendador externo (ex.: Vercel Cron, cron-job.org) ou pelo botão
// manual do painel (server action executarCobrancaManual).

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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
