import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkoutAberto } from "@/lib/checkout";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout — Nuvem de Papel",
  description: "Confirme itens, endereço e forma de pagamento.",
};

type EnderecoSalvo = {
  id: string;
  recipient_name: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
};

export default async function CheckoutPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/checkout");

  if (!checkoutAberto()) {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "72px 32px", textAlign: "center" }}>
        <h1 className="display" style={{ fontSize: 30, marginBottom: 12 }}>
          Checkout em breve
        </h1>
        <p style={{ color: "var(--ink-soft)", marginBottom: 26 }}>
          Estamos ativando o pagamento online. Seu carrinho continua salvo —
          em instantes você já pode finalizar por aqui.
        </p>
        <Link
          href="/produtos"
          style={{
            background: "var(--pink-600)",
            color: "#FFF",
            padding: "13px 26px",
            borderRadius: 999,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Continuar comprando
        </Link>
      </main>
    );
  }

  const [{ data: enderecos }, { data: perfil }] = await Promise.all([
    supabase
      .from("addresses")
      .select("id, recipient_name, cep, logradouro, numero, complemento, bairro, cidade, uf")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <CheckoutForm
      enderecos={(enderecos ?? []) as EnderecoSalvo[]}
      nomePadrao={perfil?.full_name ?? ""}
      email={user.email ?? ""}
    />
  );
}
