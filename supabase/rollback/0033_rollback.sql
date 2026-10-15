-- 0033_rollback.sql - desfaz o preco de custo separado do custo medio.
--
-- ATENCAO: remove a coluna preco_custo de item_commercial_data (o preco de
-- custo digitado em CADA produto). `cost_price` NAO e mexido - ele continua
-- sendo o custo medio ponderado. Depois do rollback o form volta a gravar o
-- preco digitado em `cost_price` (formato anterior).

alter table item_commercial_data drop constraint if exists item_commercial_data_preco_custo_check;
alter table item_commercial_data drop column if exists preco_custo;
