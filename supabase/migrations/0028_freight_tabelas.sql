-- 0028_freight_tabelas.sql - Calculadora de frete por tabela de referencia.
--
-- Contexto da pesquisa (08/10/2026): o Mercado Pago NAO serve como fonte de
-- frete - e gateway de pagamento, nao tem tabela de frete, e a "API de
-- Envios" deles (cotação com logistica do Mercado Livre) foi descontinuada
-- (doc 404 + endpoint POST /shipments 404). A API oficial dos Correios
-- (api.correios.com.br/preco/v1) existe e devolve preco + prazo, mas e
-- restrita a clientes de contrato (servico 38202 no contrato + cartao de
-- postagem). O caminho SEM credencial e a tabela publica deles: o simulador
-- www2.correios.com.br/sistemas/precosPrazos responde a POST sem login e sem
-- captcha - e de la que o script scripts/importar-frete-correios.cjs importa
-- a matriz (10 regioes de CEP x 8 faixas de peso x PAC/SEDEX).
--
-- Regras:
--   * granularidade = 1 regiao por PRIMEIRO DIGITO do CEP destino (0..9,
--     aproximacao da faixa real dos Correios - aceitavel como referencia;
--     o cliente ainda nao usa o sistema e a linha e editavel);
--   * peso_ate = TETO da faixa em kg (a cotação pega o menor teto >= peso
--     do pedido; acima do maior teto o checkout trava com aviso);
--   * origem_cep = CEP da loja no momento da importação - se a loja mudar
--     de endereco a tabela antiga fica historica e a nova importação grava
--     as linhas com o CEP novo (o unique cobre os dois);
--   * preco nunca vem do navegador: cotarFrete e finalizarCheckout leem a
--     tabela no servidor com service_role (mesma regra de ouro dos precos);
--   * RLS ligado com ZERO policies (deny-all, igual as 6 tabelas da 0026):
--     o browser nao lê nem escreve - leitura e escrita sao do servidor;
--   * fonte = 'correios_publica' documenta a origem dos numeros; a
--     atualização e manual (rodar o importador quando os Correios mudarem
--     a tabela de precos).

create table if not exists freight_tabelas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  origem_cep text not null check (origem_cep ~ '^[0-9]{8}$'),
  destino_regiao char(1) not null check (destino_regiao ~ '^[0-9]$'),
  servico text not null check (servico in ('pac', 'sedex')),
  peso_ate numeric(6,3) not null check (peso_ate > 0),
  valor numeric(12,2) not null check (valor >= 0),
  prazo_dias integer not null check (prazo_dias >= 0),
  fonte text not null default 'correios_publica',
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, origem_cep, destino_regiao, servico, peso_ate)
);

create index if not exists idx_freight_cotacao
  on freight_tabelas(tenant_id, origem_cep, destino_regiao, peso_ate);

alter table freight_tabelas enable row level security;
-- deny-all deliberado: nenhuma policy. Cotação roda no servidor (service_role
-- ignora RLS); o anon/authenticated nao enxerga linha nenhuma.
