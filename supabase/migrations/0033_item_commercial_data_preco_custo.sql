-- 0033_item_commercial_data_preco_custo.sql - preco de custo x custo medio.
--
-- Contexto (regra 15/10/2026 - staging primeiro):
--   * a linha financeira do cadastro de produto passa a ter 4 informacoes:
--     preco de custo, margem, custo medio e preco de venda;
--   * ANTES so existia um numero: `cost_price`, escrito pelo form ("preco de
--     custo") E reescrito pelo modulo de Compras como custo medio PONDERADO
--     das entradas (migration 0017:471-494) - dois conceitos brigando pela
--     mesma coluna;
--   * o CMV (0022:32) e o patrimonio leem `cost_price` como custo medio
--     corrente, entao a coluna tem de continuar sendo a media e NAO o ultimo
--     preco digitado.
--
-- Decisao: separa em duas colunas.
--   * `preco_custo`  = o que o operador digita no form (editavel);
--   * `cost_price`   = custo medio ponderado - continua com o Compras
--                      reescrevendo, e vira campo so de leitura na tela.
-- O backfill copia o valor atual para preco_custo: e o que o form ja mostrava
-- (para produto que passou por Compras vale como melhor aproximacao).
--
-- RLS nao muda (coluna nova em tabela existente com deny-all da 0001).

begin;

alter table item_commercial_data
  add column if not exists preco_custo numeric(12, 4);

alter table item_commercial_data
  drop constraint if exists item_commercial_data_preco_custo_check;
alter table item_commercial_data
  add constraint item_commercial_data_preco_custo_check
  check (preco_custo is null or preco_custo >= 0);

-- backfill: o preco que o form ja gravava em cost_price vira preco_custo.
update item_commercial_data
   set preco_custo = cost_price
 where preco_custo is null
   and cost_price is not null;

commit;
