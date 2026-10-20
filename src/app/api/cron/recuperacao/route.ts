import { NextRequest, NextResponse } from "next/server";
import { executarReguaRecuperacao } from "@/lib/cart-recovery";

// Cron da recuperação de carrinho abandonado (0036). Fail-closed: sem
// CRON_SECRET → 503. Autenticação: Authorization: Bearer <CRON_SECRET>.
// GET = o que o Vercel Cron dispara (vercel.json); POST = agendador externo
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

  const resumo = await executarReguaRecuperacao();
  return NextResponse.json(resumo, { status: resumo.ok ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  return rotear(req);
}

export async function POST(req: NextRequest) {
  return rotear(req);
}
