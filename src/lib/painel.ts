import { createClient } from "@/lib/supabase/server";
import { PAPEIS_OPERACIONAIS } from "@/lib/rbac";

// true se a sessão atual é de um papel operacional (vê o menu lateral).
// Usado pelos layouts das páginas públicas (/produtos, /publicacoes): o
// visitante anônimo continua vendo a loja normal, o staff logado ganha o
// painel. Nas rotas protegidas pelo middleware isso já é garantido antes.
export async function podeVerPainel(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  return !!perfil && perfil.status === "ativo" && PAPEIS_OPERACIONAIS.includes(perfil.role);
}
