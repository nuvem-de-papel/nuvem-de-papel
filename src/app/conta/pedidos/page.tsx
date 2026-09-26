import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Meus pedidos — Nuvem de Papel",
  description: "Acompanhe seus pedidos e o status de cada um.",
};

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  aguardando_pagamento: { label: "Aguardando pagamento", bg: "#FFF3CD", fg: "#8A6D00" },
  pago: { label: "Pago", bg: "var(--blue-100)", fg: "var(--blue-600)" },
  processando: { label: "Em separação", bg: "var(--lilac-100)", fg: "var(--lilac-600)" },
  em_rota: { label: "Em rota", bg: "var(--pink-100)", fg: "var(--pink-600)" },
  entregue: { label: "Entregue", bg: "var(--blue-100)", fg: "var(--blue-600)" },
  cancelado: { label: "Cancelado", bg: "var(--bg-cotton)", fg: "var(--ink-soft)" },
};

const PAGAMENTO: Record<string, string> = {
  pix: "Pix",
  cartao: "Cartão",
  boleto: "Boleto",
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type LinhaPedido = {
  id: string;
  status: string;
  total_amount: number | string;
  payment_method: string | null;
  created_at: string;
  address_snapshot: { cidade?: string; uf?: string } | null;
  order_items: { sku: string; name: string; unit_price: number | string; quantity: number; total: number | string }[];
};

export default async function MeusPedidosPage({
  searchParams,
}: {
  searchParams: { novo?: string; mp?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/conta/pedidos");

  const { data } = await supabase
    .from("orders")
    .select(
      "id, status, total_amount, payment_method, created_at, address_snapshot, order_items(sku, name, unit_price, quantity, total)"
    )
    .order("created_at", { ascending: false });

  const pedidos = (data ?? []) as unknown as LinhaPedido[];

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "48px 32px 72px" }}>
      <h1 className="display" style={{ fontSize: 32, marginBottom: 6 }}>
        Meus pedidos
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 24 }}>
        {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"} · {user.email}
      </p>

      {searchParams.novo && (
        <p
          style={{
            background: searchParams.mp === "0" ? "#FFF3CD" : "var(--blue-100)",
            color: searchParams.mp === "0" ? "#8A6D00" : "var(--blue-600)",
            fontWeight: 600,
            fontSize: 14,
            padding: "12px 16px",
            borderRadius: 10,
            marginBottom: 20,
          }}
        >
          {searchParams.mp === "0"
            ? "Pedido registrado! O pagamento online será ativado em breve — ele aparecerá aqui assim que confirmado."
            : "Pedido confirmado! Acompanhe o status por aqui."}
        </p>
      )}

      {pedidos.length === 0 && (
        <div
          style={{
            background: "var(--bg-cloud)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: 40,
            textAlign: "center",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <p style={{ color: "var(--ink-soft)", marginBottom: 20 }}>
            Você ainda não fez nenhum pedido.
          </p>
          <Link
            href="/produtos"
            style={{
              background: "var(--pink-600)",
              color: "#FFF",
              padding: "12px 24px",
              borderRadius: 999,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Começar a comprar
          </Link>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {pedidos.map((p) => {
          const st = STATUS[p.status] ?? { label: p.status, bg: "var(--bg-cotton)", fg: "var(--ink-soft)" };
          return (
            <article
              key={p.id}
              style={{
                background: "var(--bg-cloud)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-card)",
                padding: 22,
                boxShadow: "var(--shadow-card)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginBottom: 14,
                }}
              >
                <div>
                  <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
                    Pedido <strong style={{ color: "var(--ink)" }}>{p.id.slice(0, 8).toUpperCase()}</strong>
                    {" · "}{quando(p.created_at)}
                    {p.address_snapshot?.cidade ? ` · ${p.address_snapshot.cidade}/${p.address_snapshot.uf}` : ""}
                    {p.payment_method ? ` · ${PAGAMENTO[p.payment_method] ?? p.payment_method}` : ""}
                  </p>
                </div>
                <span
                  style={{
                    background: st.bg,
                    color: st.fg,
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: "4px 12px",
                    borderRadius: "var(--radius-chip)",
                  }}
                >
                  {st.label}
                </span>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <tbody>
                  {(p.order_items ?? []).map((it, idx) => (
                    <tr key={idx} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "9px 0", color: "var(--ink)" }}>
                        {it.quantity}× {it.name}
                        <span style={{ color: "var(--ink-soft)", fontSize: 12 }}> · {it.sku}</span>
                      </td>
                      <td style={{ padding: "9px 0", textAlign: "right", fontWeight: 600 }}>
                        {brl(Number(it.total))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ paddingTop: 12, fontWeight: 700 }}>Total</td>
                    <td style={{ paddingTop: 12, textAlign: "right", fontWeight: 700 }}>
                      {brl(Number(p.total_amount))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </article>
          );
        })}
      </div>
    </main>
  );
}
