import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { BotaoCancelarAssinatura } from "@/components/clube/BotaoCancelarAssinatura";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Minha assinatura - Nuvem de Papel",
  description: "Acompanhe e cancele sua assinatura do Clube Nuvem de Papel.",
};

type Assinatura = {
  id: string;
  status: string;
  created_at: string;
  current_period_start: string | null;
  current_period_end: string | null;
  updated_at: string;
  club_plans: {
    name: string;
    price_monthly: number | string;
    discount_pct: number | string;
    free_shipping: boolean;
    gift: string;
  } | null;
};

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  ativa: { label: "Ativa", bg: "var(--blue-100, #e3f0ff)", fg: "var(--blue-600, #2456a6)" },
  pendente: { label: "Aguardando pagamento", bg: "#FFF3CD", fg: "#8A6D00" },
  cancelada: { label: "Cancelada", bg: "var(--bg-cotton, #f6f3f7)", fg: "var(--ink-soft, #6d6478)" },
  pausada: { label: "Pausada", bg: "#FFF3CD", fg: "#8A6D00" },
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function dataBR(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function MinhaAssinaturaPage({
  searchParams,
}: {
  searchParams: { novo?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/conta/assinatura");

  const { data } = await supabase
    .from("club_subscriptions")
    .select(
      `id, status, created_at, current_period_start, current_period_end, updated_at,
       club_plans (name, price_monthly, discount_pct, free_shipping, gift)`
    )
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const assinatura = data as Assinatura | null;
  const plano = assinatura?.club_plans ?? null;
  const st = assinatura ? (STATUS[assinatura.status] ?? STATUS.cancelada) : null;
  const podeCancelar = assinatura && ["ativa", "pendente"].includes(assinatura.status);

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "40px 24px 72px",
        background: "var(--bg-cotton)",
        minHeight: "calc(100vh - 64px)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 26, color: "var(--ink, #241c2b)", margin: 0 }}>
          Minha assinatura
        </h1>
        <Link href="/conta/pedidos" style={{ fontSize: 14, color: "var(--pink-600, #e084ac)" }}>
          Ver meus pedidos
        </Link>
      </div>

      {searchParams.novo === "1" && !assinatura && (
        <p
          style={{
            background: "var(--blue-100, #e3f0ff)",
            color: "var(--blue-600, #2456a6)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 14,
          }}
        >
          Assinatura iniciada. Assim que o pagamento for aprovada ela fica ativa.
        </p>
      )}

      {!assinatura && (
        <section
          style={{
            background: "var(--bg-cloud, #fff)",
            border: "1px solid var(--border, #e6e1ea)",
            borderRadius: 16,
            padding: 32,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 15, color: "var(--ink-soft, #6d6478)", margin: "0 0 18px" }}>
            Voce ainda nao tem uma assinatura do Clube. Assine e ganhe desconto em todas as compras.
          </p>
          <Link
            href="/clube"
            style={{
              display: "inline-block",
              background: "var(--pink-600, #e084ac)",
              color: "var(--on-accent, #fff)",
              padding: "13px 26px",
              borderRadius: "var(--radius-control, 10px)",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Conhecer os planos
          </Link>
        </section>
      )}

      {assinatura && plano && (
        <>
          {searchParams.novo === "1" && assinatura.status === "pendente" && (
            <p
              style={{
                background: "#FFF3CD",
                color: "#8A6D00",
                borderRadius: 10,
                padding: "12px 16px",
                fontSize: 14,
                margin: "0 0 16px",
              }}
            >
              Assinatura iniciada. Assim que o pagamento for aprovada ela fica ativa - leva poucos
              segundos.
            </p>
          )}
          <section
            style={{
              background: "var(--bg-cloud, #fff)",
              border: "1px solid var(--border, #e6e1ea)",
              borderRadius: 16,
              padding: 28,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div>
                <h2 style={{ fontSize: 20, margin: 0, color: "var(--ink, #241c2b)" }}>
                  {plano.name}
                </h2>
                <p style={{ fontSize: 13, color: "var(--ink-soft, #6d6478)", margin: "4px 0 0" }}>
                  {brl(Number(plano.price_monthly))}/mes -{" "}
                  {Number(plano.discount_pct)}% de desconto nas compras
                </p>
              </div>
              <span
                style={{
                  background: st!.bg,
                  color: st!.fg,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "5px 12px",
                  borderRadius: 999,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                {st!.label}
              </span>
            </div>

            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 16,
                margin: "0 0 20px",
              }}
            >
              <div>
                <dt style={{ fontSize: 12, color: "var(--ink-soft, #6d6478)" }}>Assinante desde</dt>
                <dd style={{ margin: "2px 0 0", fontSize: 15, color: "var(--ink, #241c2b)" }}>
                  {dataBR(assinatura.created_at)}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: 12, color: "var(--ink-soft, #6d6478)" }}>
                  {assinatura.status === "ativa" ? "Proxima cobranca" : "Periodo"}
                </dt>
                <dd style={{ margin: "2px 0 0", fontSize: 15, color: "var(--ink, #241c2b)" }}>
                  {assinatura.status === "ativa"
                    ? dataBR(assinatura.current_period_end)
                    : `${dataBR(assinatura.current_period_start)} - ${dataBR(assinatura.current_period_end)}`}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: 12, color: "var(--ink-soft, #6d6478)" }}>Brinde do plano</dt>
                <dd style={{ margin: "2px 0 0", fontSize: 15, color: "var(--ink, #241c2b)" }}>
                  {plano.gift}
                </dd>
              </div>
            </dl>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 22px",
                display: "grid",
                gap: 8,
                fontSize: 14,
                color: "var(--ink, #241c2b)",
              }}
            >
              <li>
                <strong>{Number(plano.discount_pct)}% de desconto</strong> aplicado sozinho no
                checkout
              </li>
              <li>{plano.free_shipping ? "Frete gratis" : "Frete com desconto"} no mes</li>
            </ul>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {podeCancelar && <BotaoCancelarAssinatura />}
              <Link
                href="/clube"
                style={{
                  display: "inline-block",
                  padding: "12px 22px",
                  border: "1px solid var(--border, #e6e1ea)",
                  borderRadius: "var(--radius-control, 10px)",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "var(--ink, #241c2b)",
                  textDecoration: "none",
                }}
              >
                Ver planos
              </Link>
            </div>
          </section>
        </>
      )}

      <p style={{ marginTop: 24, fontSize: 13, color: "var(--ink-soft, #6d6478)" }}>
        O cancelamento encerra a assinatura na hora e o desconto deixa de valer nas proximas
        compras.
      </p>
    </main>
  );
}
