import { NextRequest, NextResponse } from "next/server";
import { executarReativacao } from "@/lib/reativacao";
import { executarAvaliacoes } from "@/lib/avaliacoes";

// Cron de marketing (entrega 4): roda reativação de inativos + coleta de
// avaliações. Fail-closed: sem CRON_SECRET → 503. Auth: Bearer <CRON_SECRET>.
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

  const [reativacao, avaliacoes] = await Promise.all([
    executarReativacao(),
    executarAvaliacoes(),
  ]);

  const ok = reativacao.ok && avaliacoes.ok;
  return NextResponse.json({ reativacao, avaliacoes }, { status: ok ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  return rotear(req);
}

export async function POST(req: NextRequest) {
  return rotear(req);
}
