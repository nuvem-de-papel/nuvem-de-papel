-- 0032_preflight.sql - foto do produto (Bloco 2, follow-up).
-- Objetivo: garantir que o ciclo NAO roda duas vezes. Se a coluna/constraint
-- da 0032 ja existe, a query devolve a lista e o ritual para antes de aplicar.

select
  case when count(*) = 0
    then 'PREFLIGHT OK: nada da 0032 existe - pode aplicar'
    else 'PREFLIGHT FALHOU - ja existe: ' || string_agg(alvo, ', ' order by alvo)
  end as resultado
from (
  -- coluna nova em catalog_items
  select ('catalog_items.'||column_name)::text as alvo
    from information_schema.columns
   where table_schema = 'public' and table_name = 'catalog_items'
     and column_name in ('foto_url')
  union all
  -- constraint nova em catalog_items
  select ('constraint:'||conname)::text
    from pg_constraint
   where conname = 'catalog_items_foto_url_check'
) as existentes;
