import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { BotaoAssinar } from "@/components/clube/BotaoAssinar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clube Nuvem de Papel - Assinatura",
  description:
    "Assinatura mensal com desconto em todas as compras, frete gratis e brindes exclusivos.",
};

type Plano = {
  id: string;
  code: string;
  name: string;
  description: string;
  price_monthly: number | string;
  discount_pct: number | string;
  free_shipping: boolean;
  gift: string;
  sort: number;
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default async function ClubePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: planos } = await supabase
    .from("club_plans")
    .select("id, code, name, description, price_monthly, discount_pct, free_shipping, gift, sort")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("active", true)
    .order("sort");

  let statusAssinatura: "ativa" | "pendente" | null = null;
  if (user) {
    const { data: assinatura } = await supabase
      .from("club_subscriptions")
      .select("status")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("profile_id", user.id)
      .in("status", ["pendente", "ativa"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    statusAssinatura = (assinatura?.status as "ativa" | "pendente" | undefined) ?? null;
  }

  const lista = (planos ?? []) as Plano[];

  return (
    <main style={{ background: "var(--bg-cotton)", minHeight: "calc(100vh - 64px)" }}>
      <section
        style={{
          background: "linear-gradient(120deg,#3a2f4a,#4a3a5c)",
          padding: "72px 32px",
          textAlign: "center",
        }}
      >
        <span
          style={{
            display: "inline-block",
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 12px",
            borderRadius: "var(--radius-chip, 999px)",
            textTransform: "uppercase",
            letterSpacing: 0.4,
            marginBottom: 14,
          }}
        >
          Clube exclusivo
        </span>
        <h1 className="display" style={{ fontSize: 34, color: "#fff", margin: "0 0 12px" }}>
          Clube Nuvem de Papel
        </h1>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.85)", maxWidth: 560, margin: "0 auto" }}>
          Assine por um valor mensal e ganhe desconto em todas as compras, frete gratis e um
          brinde exclusivo todo mes. Cancele quando quiser.
        </p>
        {statusAssinatura && (
          <p style={{ marginTop: 18 }}>
            <Link
              href="/conta/assinatura"
              style={{
                background: "var(--pink-600, #e084ac)",
                color: "#fff",
                padding: "12px 24px",
                borderRadius: "var(--radius-control, 10px)",
                fontWeight: 700,
                fontSize: 14,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              {statusAssinatura === "ativa" ? "Minha assinatura" : "Ativacao em andamento"}
            </Link>
          </p>
        )}
      </section>

      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "56px 32px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 24,
        }}
      >
        {lista.map((p) => (
          <article
            key={p.id}
            style={{
              background: "var(--bg-cloud, #fff)",
              border: "1px solid var(--border, #e6e1ea)",
              borderRadius: 16,
              padding: "28px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <h2 style={{ fontSize: 20, margin: 0, color: "var(--ink, #241c2b)" }}>{p.name}</h2>
            <p style={{ fontSize: 13, color: "var(--ink-soft, #6d6478)", margin: 0, minHeight: 38 }}>
              {p.description}
            </p>
            <p style={{ margin: "6px 0 0" }}>
              <span className="display" style={{ fontSize: 30, color: "var(--ink, #241c2b)" }}>
                {brl(Number(p.price_monthly))}
              </span>
              <span style={{ fontSize: 13, color: "var(--ink-soft, #6d6478)" }}>/mes</span>
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "6px 0 14px",
                fontSize: 14,
                color: "var(--ink, #241c2b)",
                display: "grid",
                gap: 8,
              }}
            >
              <li>
                <strong>{Number(p.discount_pct)}% de desconto</strong> em todas as compras
              </li>
              <li>{p.free_shipping ? "Frete gratis" : "Frete com desconto"} em todo o mes</li>
              <li>Brinde exclusivo: {p.gift}</li>
            </ul>
            <div style={{ marginTop: "auto" }}>
              {statusAssinatura ? (
                <Link
                  href="/conta/assinatura"
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "13px 20px",
                    border: "1px solid var(--border, #e6e1ea)",
                    borderRadius: "var(--radius-control, 10px)",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--ink, #241c2b)",
                    textDecoration: "none",
                  }}
                >
                  Ver minha assinatura
                </Link>
              ) : (
                <BotaoAssinar planId={p.id} logado={Boolean(user)} />
              )}
            </div>
          </article>
        ))}
        {lista.length === 0 && (
          <p style={{ color: "var(--ink-soft, #6d6478)", gridColumn: "1/-1", textAlign: "center" }}>
            Os planos do Clube voltam em breve.
          </p>
        )}
      </section>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "0 32px 72px" }}>
        <h2 style={{ fontSize: 22, color: "var(--ink, #241c2b)", textAlign: "center" }}>
          Como funciona
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 20,
            marginTop: 20,
          }}
        >
          {[
            ["1. Escolha o plano", "Selecione o plano ideal e assine com o seu usuario da loja."],
            ["2. Pagamento aprovado", "A cobranca mensal e feita pelo Mercado Pago com cartao."],
            [
              "3. Desconto sozinho",
              "Estando ativo, o desconto entra automatico em toda compra - sem cupom.",
            ],
          ].map(([titulo, texto]) => (
            <div
              key={titulo}
              style={{
                background: "var(--bg-cloud, #fff)",
                border: "1px solid var(--border, #e6e1ea)",
                borderRadius: 16,
                padding: 22,
              }}
            >
              <h3 style={{ fontSize: 16, margin: "0 0 8px", color: "var(--ink, #241c2b)" }}>
                {titulo}
              </h3>
              <p style={{ fontSize: 14, color: "var(--ink-soft, #6d6478)", margin: 0 }}>{texto}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
