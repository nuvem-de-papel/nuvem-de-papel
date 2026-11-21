import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NUVEM_DE_PAPEL_TENANT_ID } from "./tenant";

// Login social (Google - 21/11/2026): o cliente da loja e encontrado por
// customers.auth_user_id (0050) na /conta, no checkout e no /corporativo.
// Quem entra pelo Google nao passou pelo cadastro do checkout, entao a volta
// do OAuth garante a linha: liga o cadastro que ja existe com o mesmo e-mail
// (sem login) ou cria um novo. Equipe (tem profiles) fica de fora.
// Best-effort: nunca derruba o login; devolve o que fez para o teste conferir.
export type ResultadoClienteLogin = "equipe" | "existente" | "vinculado" | "criado" | "sem_email" | "erro";

export async function garantirClienteDoLogin(admin: SupabaseClient, user: User): Promise<ResultadoClienteLogin> {
  try {
    const { data: perfil } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (perfil) return "equipe";

    const { data: ja } = await admin
      .from("customers")
      .select("id")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (ja) return "existente";

    const email = (user.email ?? "").trim().toLowerCase();
    if (!email) return "sem_email";
    const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
    const nome = (meta.full_name || meta.name || email.split("@")[0]).trim().slice(0, 160);

    const { data: mesmoEmail } = await admin
      .from("customers")
      .select("id, auth_user_id")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("email", email)
      .maybeSingle();

    let id: string;
    let acao: "vinculado" | "criado";
    if (mesmoEmail) {
      // cadastro de outro login com o mesmo e-mail: nao mexe
      if (mesmoEmail.auth_user_id) return "erro";
      const { error } = await admin
        .from("customers")
        .update({ auth_user_id: user.id })
        .eq("id", mesmoEmail.id)
        .is("auth_user_id", null);
      if (error) return "erro";
      id = mesmoEmail.id;
      acao = "vinculado";
    } else {
      const { data: novo, error } = await admin
        .from("customers")
        .insert({
          tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
          auth_user_id: user.id,
          name: nome,
          email,
          tier: "bronze",
          points: 0,
          ativo: true,
        })
        .select("id")
        .single();
      if (error || !novo) return "erro";
      id = novo.id;
      acao = "criado";
    }

    await admin.from("audit_log").insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      actor_user_id: user.id,
      action: acao === "criado" ? "cadastro.criado_google" : "cadastro.vinculado_google",
      entity: "customers",
      entity_id: id,
      after: { email, nome, provedor: user.app_metadata?.provider ?? null },
    });
    return acao;
  } catch {
    return "erro";
  }
}
