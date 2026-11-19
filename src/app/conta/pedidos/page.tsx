import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mpConfigurado } from "@/lib/mercadopago";
import { reconciliarPedido, type ResultadoReconciliacao } from "@/lib/pagamento-confirmar";

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
  frete: number | string | null;
  discount_amount: number | string | null;
  payment_method: string | null;
  created_at: string;
  address_snapshot: { cidade?: string; uf?: string } | null;
  order_items: { sku: string; name: string; unit_price: number | string; quantity: number; total: number | string }[];
};

// Reconciliação na volta do cliente (17/11/2026): se o aviso do MP não
// chegou, o pedido pago ficava "Aguardando pagamento" para sempre. Ao abrir
// esta página, os pedidos pendentes recentes DESTE cliente (RLS) são
// conferidos direto no MP; aprovado vira "pago" pela mesma regra do webhook.
// Teto de 5 pedidos / 30 dias e 6 s para a página nunca travar.
const RECONCILIAR_MAX = 5;
const RECONCILIAR_DIAS = 30;
const RECONCILIAR_TIMEOUT_MS = 6000;

async function reconciliarPendentes(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  if (!mpConfigurado()) return 0;
  // E2E local (MP_MOCK=1) não consulta o MP de verdade — mesma regra do webhook
  if (process.env.MP_MOCK === "1" && process.env.VERCEL !== "1") return 0;
  const desde = new Date(Date.now() - RECONCILIAR_DIAS * 24 * 3600 * 1000).toISOString();
  const { data: pendentes } = await supabase
    .from("orders")
    .select("id")
    .eq("status", "aguardando_pagamento")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(RECONCILIAR_MAX);
  if (!pendentes || pendentes.length === 0) return 0;

  const admin = createAdminClient();
  const todas = Promise.all(
    pendentes.map((p) =>
      reconciliarPedido(admin, p.id as string).catch(
        (e): ResultadoReconciliacao => ({ situacao: "falha", motivo: String(e) })
      )
    )
  );
  const limite = new Promise<null>((r) => setTimeout(() => r(null), RECONCILIAR_TIMEOUT_MS));
  const resultados = await Promise.race([todas, limite]);
  if (!resultados) return 0;
  for (const [i, r] of resultados.entries()) {
    if (r.situacao === "falha") {
      console.error(`[conta/pedidos] reconciliar pedido=${pendentes[i].id}: ${r.motivo}`);
    }
  }
  return resultados.filter((r) => r.situacao === "pago" && r.transicionou).length;
}

export default async function MeusPedidosPage({
  searchParams,
}: {
  searchParams: { novo?: string; mp?: string; payment_id?: string; collection_status?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/conta/pedidos");

  const confirmados = await reconciliarPendentes(supabase);
  const voltouDoMp = !!searchParams.payment_id || !!searchParams.collection_status;

  const { data } = await supabase
    .from("orders")
    .select(
      "id, status, total_amount, frete, discount_amount, payment_method, created_at, address_snapshot, order_items(sku, name, unit_price, quantity, total)"
    )
    .order("created_at", { ascending: false });

  const pedidos = (data ?? []) as unknown as LinhaPedido[];

  return (
    <main className="conta-pagina">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 className="display" style={{ fontSize: 32, marginBottom: 6 }}>
            Meus pedidos
          </h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0 }}>
            {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"} · {user.email}
          </p>
        </div>
      </div>

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

      {!searchParams.novo && (confirmados > 0 || voltouDoMp) && (
        <p
          role="status"
          style={{
            background: confirmados > 0 ? "var(--blue-100)" : "#FFF3CD",
            color: confirmados > 0 ? "var(--blue-600)" : "#8A6D00",
            fontWeight: 600,
            fontSize: 14,
            padding: "12px 16px",
            borderRadius: 10,
            marginBottom: 20,
          }}
        >
          {confirmados > 0
            ? confirmados === 1
              ? "Pagamento confirmado! Seu pedido já está como Pago."
              : `Pagamento confirmado em ${confirmados} pedidos.`
            : "Recebemos sua volta do Mercado Pago. Se o pagamento ainda aparece como pendente, a confirmação pode levar alguns minutos — atualize esta página."}
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
                  {/* frete e desconto explicam a diferenca entre itens e total
                      (antes o cliente via R$ 15,60 de item e R$ 38,90 de total) */}
                  {Number(p.frete ?? 0) > 0 && (
                    <tr style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "9px 0", color: "var(--ink-soft)" }}>Frete</td>
                      <td style={{ padding: "9px 0", textAlign: "right", fontWeight: 600 }}>
                        {brl(Number(p.frete))}
                      </td>
                    </tr>
                  )}
                  {Number(p.discount_amount ?? 0) > 0 && (
                    <tr style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "9px 0", color: "var(--ink-soft)" }}>Desconto</td>
                      <td style={{ padding: "9px 0", textAlign: "right", fontWeight: 600 }}>
                        − {brl(Number(p.discount_amount))}
                      </td>
                    </tr>
                  )}
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
