import { NextRequest, NextResponse } from "next/server";

// Gate de acesso pro /crm - nao existe login de admin real ainda no projeto,
// entao isso e a protecao minima pra nao deixar dado de cliente/faturamento
// publico. Fail-closed: se as env vars nao estiverem configuradas, bloqueia.
export function middleware(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const user = process.env.CRM_BASIC_AUTH_USER;
  const pass = process.env.CRM_BASIC_AUTH_PASS;

  if (!user || !pass) {
    return new NextResponse("CRM temporariamente indisponivel (credenciais nao configuradas).", {
      status: 503,
    });
  }

  if (auth) {
    const [, encoded] = auth.split(" ");
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const [reqUser, reqPass] = decoded.split(":");
    if (reqUser === user && reqPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Autenticacao necessaria.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Nuvem de Papel CRM"' },
  });
}

export const config = {
  matcher: ["/crm/:path*"],
};