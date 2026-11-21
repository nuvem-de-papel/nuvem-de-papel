import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { ContaSecao } from "@/components/conta/ContaSecao";
import { CadastroForm } from "@/components/conta/CadastroForm";

export const dynamic = "force-dynamic";

// Autoatendimento (20/11/2026): o cliente edita os proprios dados; CPF/CNPJ fica
// travado (identidade fiscal). Toda troca vira linha `cliente.*` no audit_log,
// listada abaixo como "Historico de alteracoes".
const ROTULO: Record<string, string> = {
  name: "Nome", email: "E-mail", telefone: "Telefone", whatsapp: "WhatsApp", nascimento: "Nascimento",
  foto_url: "Foto",
};
const ACAO: Record<string, string> = {
  "cliente.dados_alterados": "Dados alterados",
  "cliente.senha_alterada": "Senha alterada",
  "cliente.foto_alterada": "Foto alterada",
  "cliente.endereco_criado": "Endereço incluído",
  "cliente.endereco_alterado": "Endereço alterado",
  "cliente.endereco_removido": "Endereço removido",
};

export default async function MeuCadastroPage() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) redirect("/login?next=/conta/cadastro");

  const admin = createAdminClient();
  const { data: c } = await admin
    .from("customers")
    .select("name, email, documento, telefone, whatsapp, nascimento")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const { data: hist } = await admin
    .from("audit_log")
    .select("id, action, before, after, created_at")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("actor_user_id", user.id)
    .like("action", "cliente.%")
    .order("created_at", { ascending: false })
    .limit(30);

  const resumo = (h: { action: string; before: unknown; after: unknown }) => {
    if (h.action !== "cliente.dados_alterados") return "";
    const a = (h.before ?? {}) as Record<string, unknown>;
    const d = (h.after ?? {}) as Record<string, unknown>;
    return Object.keys(d)
      .map((k) => `${ROTULO[k] ?? k}: ${String(a[k] ?? "—")} → ${String(d[k] ?? "—")}`)
      .join(" · ");
  };

  return (
    <>
      <ContaSecao titulo="Meu cadastro">
        <p className="conta-vazio" style={{ margin: "0 0 14px" }}>
          CPF/CNPJ: <strong>{c?.documento || "—"}</strong> (para trocar, fale com a loja)
        </p>
        <CadastroForm
          inicial={{
            nome: c?.name ?? "",
            email: c?.email ?? user.email ?? "",
            telefone: c?.telefone ?? "",
            whatsapp: c?.whatsapp ?? "",
            nascimento: c?.nascimento ?? "",
          }}
        />
      </ContaSecao>
      <ContaSecao titulo="Histórico de alterações">
        {(hist ?? []).length === 0 ? (
          <p className="conta-vazio">Nenhuma alteração registrada.</p>
        ) : (
          <ul className="conta-lista" aria-label="Histórico de alterações">
            {(hist ?? []).map((h) => (
              <li key={h.id}>
                <strong>{ACAO[h.action] ?? h.action}</strong>
                <span className="pedido-sub">{new Date(h.created_at).toLocaleString("pt-BR")}</span>
                {resumo(h) && <span>{resumo(h)}</span>}
              </li>
            ))}
          </ul>
        )}
      </ContaSecao>
    </>
  );
}
