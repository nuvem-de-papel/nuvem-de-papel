-- 0033_preflight.sql - preco de custo x custo medio.
-- Objetivo: garantir que o ciclo NAO roda duas vezes. Se a coluna/constraint
-- da 0033 ja existe, a query devolve a lista e o ritual para antes de aplicar.

select
  case when count(*) = 0
    then 'PREFLIGHT OK: nada da 0033 existe - pode aplicar'
    else 'PREFLIGHT FALHOU - ja existe: ' || string_agg(alvo, ', ' order by alvo)
  end as resultado
from (
  -- coluna nova em item_commercial_data
  select ('item_commercial_data.'||column_name)::text as alvo
    from information_schema.columns
   where table_schema = 'public' and table_name = 'item_commercial_data'
     and column_name in ('preco_custo')
  union all
  -- constraint nova em item_commercial_data
  select ('constraint:'||conname)::text
    from pg_constraint
   where conname = 'item_commercial_data_preco_custo_check'
) as existentes;
