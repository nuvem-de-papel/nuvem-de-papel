-- 0037_preflight.sql - reativação + avaliações.
-- Objetivo: impedir ciclo duplo. Se as tabelas da 0037 já existem, para antes.

select
  case when count(*) = 0
    then 'PREFLIGHT OK: nada da 0037 existe - pode aplicar'
    else 'PREFLIGHT FALHOU - ja existe: ' || string_agg(alvo, ', ' order by alvo)
  end as resultado
from (
  select table_name::text as alvo
    from information_schema.tables
   where table_schema = 'public'
     and table_name in ('marketing_config', 'customer_reactivation', 'review_requests')
) as existentes;
