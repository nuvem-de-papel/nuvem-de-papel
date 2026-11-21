import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Retorno do login social (Google - 20/11/2026). O Supabase devolve ?code=,
// trocamos pela sessao (cookie) e voltamos para o `next` (so caminho interno,
// nunca outro dominio). Erro volta para o /login com aviso.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/conta";
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/conta";
  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destino, url.origin));
  }
  return NextResponse.redirect(new URL("/login?erro=google", url.origin));
}
