-- 0027_preflight.sql - Conciliacao bancaria.
-- Objetivo: garantir que o ciclo NAO roda duas vezes. Se qualquer objeto da
-- 0027 ja existe, a query devolve a lista e o ritual para antes de aplicar.

select
  case when count(*) = 0
    then 'PREFLIGHT OK: nenhum objeto da 0027 existe - pode aplicar'
    else 'PREFLIGHT FALHOU - objetos ja existem: ' || string_agg(obj, ', ' order by obj)
  end as resultado
from (
  select relname::text as obj
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and relkind = 'r'
     and relname in ('bank_extratos', 'bank_linhas')
) as existentes;
