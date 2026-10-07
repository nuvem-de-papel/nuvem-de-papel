import { createAdminClient } from "@/lib/supabase/admin";
import { obterAdapter } from "./adapters";
import type { ContaMarketplace, ProdutoMestre, TipoJobMarketplace } from "./types";

// Fila de jobs de marketplace - o KERNEL (Modulo 1).
//
// Regra dura: o kernel NAO inventa resposta de API. Ele so executa o que da
// para fazer sem rede (ping de heartbeat, validacao do produto-mestre, gravar
// webhook na fila); todo o resto cai no adaptador do canal - e com o registro
// de adaptadores vazio no M1, o job falha com "adaptador pendente (Modulo 2)"
// e fica visivel na tela ate o Modulo 2 ligar o Mercado Livre.
//
// Ciclo do job (banco): pendente -> processando -> concluido | pendente
// (backoff 2^attempts seg) | falhou (nao sai mais so - botao Reprocessar).

type Job = {
  id: string;
  channel_id: string;
  account_id: string | null;
  listing_id: string | null;
  tipo: TipoJobMarketplace;
  payload: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
};

export type ResumoFila = {
  processados: number;
  concluidos: number;
  retentativas: number;
  falhas: number;
};

type Admin = ReturnType<typeof createAdminClient>;

function agora(): string {
  return new Date().toISOString();
}

// Carrega o produto-mestre local: sku/nome, preco varejo (maior faixa <= 1 e,
// no empate, a linha mais nova) e estoque disponivel.
async function carregarProdutoMestre(admin: Admin, itemId: string): Promise<ProdutoMestre | null> {
  const { data: item } = await admin
    .from("catalog_items")
    .select("id, sku, name")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return null;

  const [{ data: precos }, { data: estoque }] = await Promise.all([
    admin
      .from("item_prices")
      .select("price")
      .eq("item_id", itemId)
      .eq("channel", "varejo")
      .order("min_quantity", { ascending: true })
      .order("valid_from", { ascending: false })
      .limit(1),
    admin.from("item_stock").select("stock_available").eq("item_id", itemId).maybeSingle(),
  ]);

  return {
    itemId: item.id,
    sku: item.sku,
    nome: item.name,
    preco: Number(precos?.[0]?.price ?? 0),
    estoque: estoque ? Number(estoque.stock_available) : null,
  };
}

// Dados minimos para um anuncio existir em QUALQUER canal. Requisito de canal
// especifico (gtin, ncm de frete, atributos) e do adaptador, nunca do core.
export function validarProdutoMestre(p: ProdutoMestre): string[] {
  const faltas: string[] = [];
  if (!p.sku?.trim()) faltas.push("sku");
  if (!p.nome?.trim()) faltas.push("nome");
  if (!(p.preco > 0)) faltas.push("preco varejo");
  if (p.estoque === null || p.estoque === undefined) faltas.push("estoque");
  return faltas;
}

async function marcarListingErro(admin: Admin, listingId: string, erro: string): Promise<void> {
  await admin
    .from("marketplace_listings")
    .update({ status: "erro", last_error: erro.slice(0, 500), updated_at: agora() })
    .eq("id", listingId);
}

async function executarJob(
  admin: Admin,
  job: Job,
  canais: Map<string, string>,
  contas: Map<string, ContaMarketplace>
): Promise<{ ok: boolean; mensagem: string }> {
  const slug = canais.get(job.channel_id) ?? "(canal desconhecido)";

  // ---- ping: heartbeat local, nao faz rede ---------------------------------
  if (job.tipo === "ping") {
    if (!job.account_id) return { ok: false, mensagem: "job ping sem conta vinculada" };
    const { error } = await admin
      .from("marketplace_accounts")
      .update({ last_ping_at: agora(), updated_at: agora() })
      .eq("id", job.account_id);
    if (error) return { ok: false, mensagem: error.message };
    return { ok: true, mensagem: "ping local ok (sem chamada de rede)" };
  }

  // ---- validar_item: checa o produto-mestre, sem rede -----------------------
  if (job.tipo === "validar_item") {
    const itemId = typeof job.payload?.item_id === "string" ? job.payload.item_id : "";
    if (!itemId) return { ok: false, mensagem: "payload sem item_id" };
    const produto = await carregarProdutoMestre(admin, itemId);
    if (!produto) return { ok: false, mensagem: "produto nao encontrado" };
    const faltas = validarProdutoMestre(produto);
    if (faltas.length) return { ok: false, mensagem: `dados incompletos: ${faltas.join(", ")}` };
    return { ok: true, mensagem: `produto-mestre valido: ${produto.sku}` };
  }

  // ---- daqui pra baixo o job pertence ao ADAPTADOR do canal ----------------
  const adapter = obterAdapter(slug);

  if (job.tipo === "publicar_item") {
    const listingId =
      job.listing_id ?? (typeof job.payload?.listing_id === "string" ? job.payload.listing_id : "");
    if (!listingId) return { ok: false, mensagem: "job publicar_item sem anuncio" };
    const { data: listing } = await admin
      .from("marketplace_listings")
      .select("id, item_id, account_id")
      .eq("id", listingId)
      .maybeSingle();
    if (!listing) return { ok: false, mensagem: "anuncio nao encontrado" };

    const produto = await carregarProdutoMestre(admin, listing.item_id);
    if (!produto) {
      await marcarListingErro(admin, listingId, "produto nao encontrado");
      return { ok: false, mensagem: "produto nao encontrado" };
    }

    const faltas = validarProdutoMestre(produto);
    if (faltas.length) {
      const msg = `dados incompletos: ${faltas.join(", ")}`;
      await marcarListingErro(admin, listingId, msg);
      return { ok: false, mensagem: msg };
    }

    if (!adapter) {
      const msg = `adaptador '${slug}' pendente de implementacao (Modulo 2)`;
      await marcarListingErro(admin, listingId, msg);
      return { ok: false, mensagem: msg };
    }

    const conta = job.account_id ? contas.get(job.account_id) ?? null : null;
    if (!conta) return { ok: false, mensagem: "conta do anuncio nao encontrada" };
    const r = await adapter.publicarItem(produto, conta);
    await admin
      .from("marketplace_listings")
      .update({
        status: r.ok ? "publicado" : "erro",
        last_error: r.ok ? null : r.mensagem.slice(0, 500),
        last_sync_at: agora(),
        updated_at: agora(),
      })
      .eq("id", listingId);
    return r;
  }

  if (job.tipo === "processar_webhook") {
    const webhookId = typeof job.payload?.webhook_id === "string" ? job.payload.webhook_id : "";
    if (!adapter) return { ok: false, mensagem: `adaptador '${slug}' pendente de implementacao (Modulo 2)` };
    const conta = job.account_id ? contas.get(job.account_id) ?? null : null;
    const topico = typeof job.payload?.topic === "string" ? job.payload.topic : "";
    const evento = job.payload?.evento ?? null;
    const r = await adapter.processarWebhook(topico, evento, conta);
    if (webhookId) {
      await admin
        .from("marketplace_webhooks")
        .update({
          status: r.ok ? "processado" : "erro",
          processed_at: agora(),
        })
        .eq("id", webhookId);
    }
    return r;
  }

  // atualizar_preco | atualizar_estoque | puxar_pedidos | refresh_token
  if (!adapter) return { ok: false, mensagem: `adaptador '${slug}' pendente de implementacao (Modulo 2)` };
  return { ok: false, mensagem: `tipo '${job.tipo}' ainda nao roda no kernel (Modulo 2)` };
}

// Drena a fila: retira ate `limite` jobs com SKIP LOCKED, executa o handler de
// cada um e fecha o job no banco. Dois cliques concorrentes (ou workers futuros)
// nunca processam o mesmo job.
export async function processarFila(limite = 10): Promise<ResumoFila> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("marketplace_claim", { p_limit: limite });
  if (error) throw new Error(`Falha ao drenar a fila: ${error.message}`);
  const jobs = (data ?? []) as unknown as Job[];

  const resumo: ResumoFila = { processados: jobs.length, concluidos: 0, retentativas: 0, falhas: 0 };
  if (jobs.length === 0) return resumo;

  const { data: canais } = await admin.from("marketplace_channels").select("id, slug");
  const mapaCanais = new Map<string, string>((canais ?? []).map((c) => [c.id, c.slug]));

  const contaIds = [...new Set(jobs.map((j) => j.account_id).filter((v): v is string => !!v))];
  const { data: contas } = contaIds.length
    ? await admin
        .from("marketplace_accounts")
        .select(
          "id, channel_id, label, client_ref, status, auth_mode, access_token, refresh_token, token_expires_at"
        )
        .in("id", contaIds)
    : { data: [] as ContaMarketplace[] };
  const mapaContas = new Map<string, ContaMarketplace>(
    ((contas ?? []) as ContaMarketplace[]).map((c) => [c.id, c])
  );

  for (const job of jobs) {
    let resultado: { ok: boolean; mensagem: string };
    try {
      resultado = await executarJob(admin, job, mapaCanais, mapaContas);
    } catch (e) {
      resultado = { ok: false, mensagem: e instanceof Error ? e.message : "erro inesperado no handler" };
    }
    const { error: erroFinish } = await admin.rpc("marketplace_finish", {
      p_job: job.id,
      p_ok: resultado.ok,
      p_msg: resultado.mensagem,
    });
    if (erroFinish) throw new Error(`Falha ao fechar o job ${job.id}: ${erroFinish.message}`);

    if (resultado.ok) resumo.concluidos++;
    else if (job.attempts >= job.max_attempts) resumo.falhas++; // finish marcou 'falhou'
    else resumo.retentativas++;
  }
  return resumo;
}
