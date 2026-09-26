import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { papelPermitidoNoModulo } from "@/lib/rbac";

// Protege areas privadas (/crm, /configuracoes, /pdv, /financeiro, /compras,
// /portal): exige sessao Supabase Auth, perfil ativo e papel autorizado pelo
// módulo (RBAC - migrations 0004/0005/0009). Substitui o Basic Auth legado
// (Fase 1 do parecer-acesso-enterprise.md). Fail-closed: sem env de Supabase
// configuradas, bloqueia com 503.

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
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return new NextResponse("Acesso restrito: perfil nao encontrado.", { status: 403 });
  }

  if (profile.status !== "ativo") {
    return new NextResponse("Acesso restrito: perfil desativado.", { status: 403 });
  }

  if (!papelPermitidoNoModulo(request.nextUrl.pathname, profile.role)) {
    return new NextResponse("Acesso restrito: seu papel nao tem permissao neste modulo.", {
      status: 403,
    });
  }

  return response;
};

export const config = {
  matcher: [
    "/crm/:path*",
    "/configuracoes/:path*",
    "/logistica/:path*",
    "/pdv/:path*",
    "/financeiro/:path*",
    "/compras/:path*",
    "/portal/:path*",
  ],
};
