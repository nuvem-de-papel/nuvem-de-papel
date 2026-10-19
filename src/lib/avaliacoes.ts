// Motor de coleta de avaliações (entrega 4, parte B). Pedido que virou
// `entregue` há pelo menos marketing_config.avaliacao_atraso_dias (padrão 3)
// e ainda não tem review_request ganha um e-mail de agradecimento com o link
// de avaliação do Google. Regra do Google embutida: sai para TODOS os pedidos
// entregues por igual (sem review gating); nunca pede nota alta nem oferece
// vantagem (CDC). SEM IA nesta etapa. O clique é medido pela rota publica
// /avaliar/[orderId], que grava link_clicado_em e redireciona pro Google.
// Idempotência por unique (tenant_id, order_id) em review_requests. Best-effort.

import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { enviarEmail, templatePedidoAvaliado, codigoPedido } from "@/lib/email";

export type ResumoAvaliacoes = {
  ok: boolean;
  avaliados: number;
  enviadas: number;
  falhas: number;
  detalhe: string[];
};

const DIA_MS = 86400000;

export async function executarAvaliacoes(): Promise<ResumoAvaliacoes> {
  const admin = createAdminClient();
  const tenantId = NUVEM_DE_PAPEL_TENANT_ID;
  const agora = Date.now();

  const resumo: ResumoAvaliacoes = {
    ok: true,
    avaliados: 0,
    enviadas: 0,
    falhas: 0,
    detalhe: [],
  };

  const { data: cfg } = await admin
    .from("marketing_config")
    .select("google_review_link, avaliacao_atraso_dias")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const linkGoogle = String(cfg?.google_review_link ?? "").trim();
  if (!linkGoogle) {
    // sem link do Google configurado não há o que pedir — não envia nada
    return { ...resumo, detalhe: ["link do Google não configurado em marketing_config"] };
  }
  const atrasoDias = Number(cfg?.avaliacao_atraso_dias ?? 3);

  // 1. pedidos entregues, antigos o bastante, sem review_request
  const { data: entregues, error: erro } = await admin
    .from("orders")
    .select("id, customer_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "entregue")
    .lte("created_at", new Date(agora - atrasoDias * DIA_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(300);
  if (erro) return { ...resumo, ok: false, detalhe: [`pedidos: ${erro.message}`] };
  if ((entregues ?? []).length === 0) return resumo;

  const { data: jaEnviados } = await admin
    .from("review_requests")
    .select("order_id")
    .eq("tenant_id", tenantId);
  const temPedido = new Set((jaEnviados ?? []).map((r) => r.order_id));
  const pendentes = (entregues ?? []).filter((p) => !temPedido.has(p.id));
  if (pendentes.length === 0) return resumo;

  // 2. clientes
  const idsClientes = [...new Set(pendentes.map((p) => p.customer_id).filter(Boolean) as string[])];
  const info = new Map<string, { name: string; email: string }>();
  if (idsClientes.length > 0) {
    const { data: cli } = await admin
      .from("customers")
      .select("id, name, email")
      .eq("tenant_id", tenantId)
      .in("id", idsClientes);
    for (const c of cli ?? []) info.set(c.id, { name: c.name, email: c.email });
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

  for (const p of pendentes) {
    resumo.avaliados++;
    const c = p.customer_id ? info.get(p.customer_id) : undefined;
    const email = String(c?.email ?? "").trim();
    if (!email) continue;

    const codigo = codigoPedido(p.id);
    // link curto de medicao: /avaliar/[orderId] grava clique e redireciona
    const linkAvaliacao = `${base}/avaliar/${p.id}`;
    const t = templatePedidoAvaliado(String(c?.name ?? "").trim(), codigo, linkAvaliacao);
    const r = await enviarEmail(email, t.assunto, t.html, {
      fonte: "system",
      relatedEntity: "orders",
      relatedId: p.id,
    });

    await admin.from("review_requests").upsert(
      {
        tenant_id: tenantId,
        order_id: p.id,
        customer_id: p.customer_id,
        email_message_id: r.id ?? null,
      },
      { onConflict: "tenant_id,order_id" }
    );

    if (r.ok) {
      resumo.enviadas++;
      resumo.detalhe.push(`${codigo}: pedido de avaliação enviado`);
    } else {
      resumo.falhas++;
      resumo.detalhe.push(`${codigo}: falhou (${r.motivo})`);
    }
  }

  return resumo;
}
