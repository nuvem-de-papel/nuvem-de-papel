// Modulo 1 - contratos do kernel de marketplaces (decisao do cliente 06/10/2026).
//
// Regra de arquitetura: o produto-mestre e NORMALIZADO NO NOSSO LADO e cada
// marketplace e apenas um ADAPTADOR que mapeia ProdutoMestre para a API de
// destino. Adicionar o 11o canal nao mexe no core - entra so um adaptador novo
// no registro (src/lib/marketplace/adapters.ts).
//
// O ProdutoMestre nasce dos dados que JA existem no sistema:
//   * catalog_items -> sku, nome
//   * item_prices   -> preco varejo (canal padrao do checkout)
//   * item_stock    -> estoque disponivel
// Campos especificos de canal (gtin, atributos, dimensoes de frete) sao
// pedido DO ADAPTADOR - o kernel nao guarda copia de regra de marketplace.

export type ProdutoMestre = {
  itemId: string;
  sku: string;
  nome: string;
  preco: number;
  // null = produto sem linha em item_stock (dado faltando, diferente de 0)
  estoque: number | null;
};

export type ContaMarketplace = {
  id: string;
  channel_id: string;
  label: string;
  client_ref: string | null;
  status: "desconectado" | "conectado" | "erro";
  auth_mode: "oauth2" | "api_key";
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
};

export type ResultadoAdaptador = { ok: boolean; mensagem: string };

// Ciclo de um adaptador: todos os canais falam a MESMA interface - e assim que
// o mapeamento de campos de cada marketplace fica isolado do core.
export interface MarketplaceAdapter {
  readonly slug: string;
  /** requisicoes por minuto aceitas pelo canal - a fila respeita esse teto */
  readonly limiteRequisicoes: number;
  publicarItem(produto: ProdutoMestre, conta: ContaMarketplace): Promise<ResultadoAdaptador>;
  atualizarPreco(produto: ProdutoMestre, conta: ContaMarketplace): Promise<ResultadoAdaptador>;
  atualizarEstoque(produto: ProdutoMestre, conta: ContaMarketplace): Promise<ResultadoAdaptador>;
  puxarPedidos(conta: ContaMarketplace): Promise<ResultadoAdaptador & { importados: number }>;
  processarWebhook(
    topico: string,
    payload: unknown,
    conta: ContaMarketplace | null
  ): Promise<ResultadoAdaptador>;
  renovarToken(conta: ContaMarketplace): Promise<ResultadoAdaptador>;
}

export type TipoJobMarketplace =
  | "ping"
  | "validar_item"
  | "publicar_item"
  | "atualizar_preco"
  | "atualizar_estoque"
  | "puxar_pedidos"
  | "refresh_token"
  | "processar_webhook";
