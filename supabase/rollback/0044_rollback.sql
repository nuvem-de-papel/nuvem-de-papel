-- 0044_rollback.sql
-- Desfaz 0044: remove item_stock_by_location, stock_locations e as policies.
-- ATENCAO: apaga qualquer saldo por local ja cadastrado.
--
-- NAO remove o valor 'web' de sales_channel: Postgres nao tem DROP VALUE pra
-- enum (so ALTER TYPE ... ADD VALUE existe). O valor fica orfao no tipo mas
-- inofensivo — nenhuma linha em item_prices usa channel='web' a nao ser que
-- alguem tenha cadastrado preco web depois da 0044, caso em que o rollback
-- de tabela abaixo nao afeta item_prices (tabela de 0001, fora do escopo
-- desta migration).

begin;

drop policy if exists "le estoque por local (operacional)" on item_stock_by_location;
drop policy if exists "le locais de estoque (operacional)" on stock_locations;

drop table if exists item_stock_by_location;
drop table if exists stock_locations;

commit;
