-- 0026_preflight.sql - Modulo 1 (kernel de marketplaces).
-- Objetivo: garantir que o ciclo NAO roda duas vezes. Se qualquer objeto da
-- 0026 ja existe, a query devolve a lista e o ritual para antes de aplicar.

select
  case when count(*) = 0
    then 'PREFLIGHT OK: nenhum objeto da 0026 existe - pode aplicar'
    else 'PREFLIGHT FALHOU - objetos ja existem: ' || string_agg(obj, ', ' order by obj)
  end as resultado
from (
  select relname::text as obj
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and relkind = 'r'
     and relname in (
       'marketplace_channels', 'marketplace_accounts', 'marketplace_listings',
       'marketplace_jobs', 'marketplace_orders', 'marketplace_webhooks'
     )
  union all
  select proname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and proname in (
       'marketplace_enqueue', 'marketplace_claim',
       'marketplace_finish', 'marketplace_reprocess'
     )
) as existentes;
