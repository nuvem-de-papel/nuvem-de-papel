// Motor de reativação de clientes inativos (entrega 4, parte A). Cliente que
// já comprou e não volta há N dias (marketing_config.reativacao_dias, padrão
// 90) recebe e-mail citando a última compra, com opt-out LGPD. SEM IA (stack
// não tem provedor) e SEM WhatsApp nesta etapa — regras simples, só Resend.
// Para sozinho quando o cliente volta a comprar (deixa de ser inativo) ou sai
// da lista (status saiu/nao_incomodar). Cooldown: não re-contata dentro de
// marketing_config.reativacao_cooldown_dias (padrão 60). Idempotência por
// unique (tenant_id, customer_id) em customer_reactivation. Best-effort, mesmo
// contrato de src/lib/cart-recovery.ts (0036) e src/lib/cobranca.ts (0035).

import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { enviarEmail, templateReativacao } from "@/lib/email";

export type ResumoReativacao = {
  ok: boolean;
  avaliados: number;
  enviadas: number;
  falhas: number;
  detalhe: string[];
};

const DIA_MS = 86400000;
// status que nunca entram em campanha (opt-out / já voltou)
const BLOQUEADOS = ["saiu", "nao_incomodar", "voltou", "em_campanha"];

export async function executarReativacao(): Promise<ResumoReativacao> {
  const admin = createAdminClient();
  const tenantId = NUVEM_DE_PAPEL_TENANT_ID;
  const agora = Date.now();

  const resumo: ResumoReativacao = {
    ok: true,
    avaliados: 0,
    enviadas: 0,
    falhas: 0,
    detalhe: [],
  };

  const { data: cfg } = await admin
    .from("marketing_config")
    .select("reativacao_dias, reativacao_cooldown_dias")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const diasInativo = Number(cfg?.reativacao_dias ?? 90);
  const cooldownDias = Number(cfg?.reativacao_cooldown_dias ?? 60);

  // 1. última compra por cliente (pedidos não cancelados)
  const { data: pedidos, error: erroPed } = await admin
    .from("orders")
    .select("id, customer_id, created_at")
    .eq("tenant_id", tenantId)
    .neq("status", "cancelado")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (erroPed) return { ...resumo, ok: false, detalhe: [`pedidos: ${erroPed.message}`] };

  const ultimoPorCliente = new Map<string, { orderId: string; data: string }>();
  for (const p of pedidos ?? []) {
    if (!p.customer_id) continue;
    if (!ultimoPorCliente.has(p.customer_id)) {
      ultimoPorCliente.set(p.customer_id, { orderId: p.id, data: p.created_at });
    }
  }

  // filtra inativos (última compra mais velha que o limiar)
  const limiar = agora - diasInativo * DIA_MS;
  const inativos: { customerId: string; orderId: string }[] = [];
  for (const [customerId, u] of ultimoPorCliente) {
    if (new Date(u.data).getTime() <= limiar) inativos.push({ customerId, orderId: u.orderId });
  }
  if (inativos.length === 0) return resumo;

  const idsClientes = inativos.map((i) => i.customerId);

  // 2. estado de reativação (cooldown + opt-out)
  const { data: reac } = await admin
    .from("customer_reactivation")
    .select("customer_id, status, ultimo_contato_em")
    .eq("tenant_id", tenantId)
    .in("customer_id", idsClientes);
  const estado = new Map<string, { status: string; ultimo: string | null; token?: string }>();
  for (const r of reac ?? []) estado.set(r.customer_id, { status: r.status, ultimo: r.ultimo_contato_em });

  // 3. clientes (e-mail + nome)
  const { data: clientes } = await admin
    .from("customers")
    .select("id, name, email, ativo")
    .eq("tenant_id", tenantId)
    .in("id", idsClientes);
  const info = new Map<string, { name: string; email: string; ativo: boolean }>();
  for (const c of clientes ?? []) info.set(c.id, { name: c.name, email: c.email, ativo: c.ativo });

  // 4. último item de cada pedido inativo
  const idsPedidos = inativos.map((i) => i.orderId);
  const itens = new Map<string, string>();
  if (idsPedidos.length > 0) {
    const { data: oi } = await admin
      .from("order_items")
      .select("order_id, name")
      .in("order_id", idsPedidos);
    for (const o of oi ?? []) if (!itens.has(o.order_id)) itens.set(o.order_id, o.name);
  }

  for (const inat of inativos) {
    resumo.avaliados++;
    const c = info.get(inat.customerId);
    if (!c || !c.ativo) continue;

    const email = String(c.email ?? "").trim();
    if (!email) continue;

    const st = estado.get(inat.customerId);
    // opt-out / já em campanha / bloqueado: pula
    if (st && BLOQUEADOS.includes(st.status)) continue;
    // cooldown: contatado há pouco, espera
    if (st?.ultimo && agora - new Date(st.ultimo).getTime() < cooldownDias * DIA_MS) continue;

    // upsert ANTES do envio para obter o descadastro_token (o link de opt-out
    // precisa dele; se criássemos depois, o e-mail sairia sem token)
    const { data: up } = await admin
      .from("customer_reactivation")
      .upsert(
        {
          tenant_id: tenantId,
          customer_id: inat.customerId,
          status: "em_campanha",
          ultimo_contato_em: new Date().toISOString(),
        },
        { onConflict: "tenant_id,customer_id" }
      )
      .select("descadastro_token");
    const token = String(up?.[0]?.descadastro_token ?? st?.token ?? "");
    const linkSair = token
      ? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/sair/${token}`
      : `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/sair`;

    const primeiroNome = String(c.name ?? "").trim().split(/\s+/)[0] || "cliente";
    const item = itens.get(inat.orderId) ?? "";

    const t = templateReativacao(primeiroNome, item, linkSair);
    const r = await enviarEmail(email, t.assunto, t.html, {
      fonte: "system",
      relatedEntity: "customers",
      relatedId: inat.customerId,
    });

    if (r.ok) {
      resumo.enviadas++;
      resumo.detalhe.push(`${primeiroNome}: e-mail enviado`);
    } else {
      resumo.falhas++;
      resumo.detalhe.push(`${primeiroNome}: falhou (${r.motivo})`);
    }
    void up;
  }

  return resumo;
}
