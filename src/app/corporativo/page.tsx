import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SolicitarCorporativoForm } from "@/components/corporativo/SolicitarCorporativoForm";

export const metadata: Metadata = {
  title: "Corporativo — Nuvem de Papel",
  description: "Atendimento a empresas com compras recorrentes.",
};

// Corporativo (0059 - 20/11/2026): pedido de conta PJ. A empresa nasce
// 'pendente' e a gestao aprova em Cadastros > Revenda (limite e prazo).
// O painel do comprador (pedidos, prazos, novo pedido) e a etapa 3.

type Empresa = { razao_social: string; status: string; limite_credito: number; prazo_dias: number; motivo: string | null };

const TEXTO_STATUS: Record<string, string> = {
  pendente: "Recebemos o pedido da sua empresa. A equipe confere o CNPJ e libera a conta em até 1 dia útil.",
  ativa: "Conta aprovada. O painel de compras da empresa entra no ar na próxima etapa.",
  bloqueada: "Conta bloqueada. Fale com nosso atendimento pelo botão do canto da tela.",
  recusada: "Pedido não aprovado. Fale com nosso atendimento pelo botão do canto da tela.",
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default async function CorporativoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let empresa: Empresa | null = null;
  let equipe = false;
  if (user) {
    const admin = createAdminClient();
    const [{ data: vinculo }, { data: perfil }] = await Promise.all([
      admin
        .from("corporate_buyers")
        .select("account:corporate_accounts!inner(razao_social, status, limite_credito, prazo_dias, motivo)")
        .eq("auth_user_id", user.id)
        .maybeSingle(),
      admin.from("profiles").select("id").eq("id", user.id).maybeSingle(),
    ]);
    const conta = (vinculo as { account?: Empresa | Empresa[] } | null)?.account;
    empresa = (Array.isArray(conta) ? conta[0] : conta) ?? null;
    equipe = !!perfil;
  }

  return (
    <main className="conta-shell">
      <section className="conta-secao">
        <h1 className="display">Atendimento corporativo</h1>
        <p>
          Empresas com compras recorrentes contam com condições comerciais próprias: prazos de pagamento,
          faturamento por CNPJ, acompanhamento de pedidos em aberto e promoções exclusivas.
        </p>
      </section>

      {empresa ? (
        <section className="conta-secao" aria-label="Situação da conta corporativa">
          <h2>{empresa.razao_social}</h2>
          <p>
            <span className={`ct-pill-corp ct-pill-corp-${empresa.status}`}>{empresa.status}</span>
          </p>
          <p>{TEXTO_STATUS[empresa.status] ?? ""}</p>
          {empresa.status === "ativa" && (
            <p>
              Limite de crédito: <strong>{brl(Number(empresa.limite_credito))}</strong> · prazo:{" "}
              <strong>{empresa.prazo_dias > 0 ? `${empresa.prazo_dias} dias` : "à vista"}</strong>
            </p>
          )}
          {empresa.motivo && empresa.status !== "ativa" && <p>Motivo: {empresa.motivo}</p>}
          <p>
            <Link href="/conta">Ir para minha conta</Link>
          </p>
        </section>
      ) : equipe ? (
        <section className="conta-secao">
          <p>Você está logado com um acesso da equipe. As contas corporativas são aprovadas em Cadastros → Revenda.</p>
        </section>
      ) : (
        <section className="conta-secao">
          <h2>Solicitar conta corporativa</h2>
          <p>
            {user
              ? "Seu login atual vira o acesso de administrador da empresa."
              : "Cadastre a empresa e o acesso de quem vai comprar. Já tem cadastro na loja? "}
            {!user && <Link href="/login?next=/corporativo">Entre primeiro</Link>}
          </p>
          <SolicitarCorporativoForm logado={!!user} />
        </section>
      )}
    </main>
  );
}
