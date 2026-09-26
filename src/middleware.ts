import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { PAPEIS_OPERACIONAIS } from "@/lib/rbac";

// Protege /crm e /configuracoes: exige sessao Supabase Auth + papel
// operacional em profiles (RBAC - migration 0004). Substitui o Basic Auth
// legado (Fase 1 do parecer-acesso-enterprise.md). Fail-closed: sem env de
// Supabase configuradas, bloqueia com 503.

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return new NextResponse("Area temporariamente indisponivel (credenciais nao configuradas).", {
      status: 503,
    });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !PAPEIS_OPERACIONAIS.includes(profile.role)) {
    return new NextResponse("Acesso restrito: perfil operacional nao encontrado.", { status: 403 });
  }

  return response;
}

export const config = {
  matcher: ["/crm/:path*", "/configuracoes/:path*"],
};
