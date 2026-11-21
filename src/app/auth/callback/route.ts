import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { garantirClienteDoLogin } from "@/lib/cliente-login";

// Retorno do login social (Google - 20/11/2026). O Supabase devolve ?code=,
// trocamos pela sessao (cookie) e voltamos para o `next` (so caminho interno,
// nunca outro dominio). Erro volta para o /login com aviso.
// 21/11/2026: cliente da loja ganha (ou liga) a linha em customers; login da
// equipe vai para o /login, que manda para a tela do papel dele.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/conta";
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/conta";
  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const user = data.user;
      if (user) {
        const r = await garantirClienteDoLogin(createAdminClient(), user);
        if (r === "equipe") return NextResponse.redirect(new URL("/login", url.origin));
      }
      return NextResponse.redirect(new URL(destino, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?erro=google", url.origin));
}
