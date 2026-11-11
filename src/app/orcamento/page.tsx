import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { OrcamentoForm } from "@/components/orcamento/OrcamentoForm";

// Lista de orcamento (0050). Quem tem login de CLIENTE envia direto; quem
// nao tem cria o cadastro no proprio envio. Login de EQUIPE (profiles) nao
// conta como cliente: a tela avisa e bloqueia o envio.
export default async function OrcamentoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let equipeEmail: string | null = null;
  let usuario: { email: string; nome: string } | null = null;

  if (user) {
    const { data: perfil } = await createAdminClient()
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (perfil) {
      equipeEmail = user.email ?? "equipe";
    } else if (user.email) {
      usuario = {
        email: user.email,
        nome: ((user.user_metadata?.full_name as string | undefined) ?? "").trim(),
      };
    }
  }

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 30, margin: "0 0 8px", color: "var(--navy)" }}>
        Seu orçamento
      </h1>
      <p style={{ fontSize: 15, color: "var(--ink-soft)", margin: "0 0 24px" }}>
        Monte a lista com os produtos que quer e envie em um único pedido.
      </p>
      <OrcamentoForm usuario={usuario} equipeEmail={equipeEmail} />
    </main>
  );
}
