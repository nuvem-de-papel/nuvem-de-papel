-- 0035_preflight.sql - régua de cobrança automática.
-- Objetivo: impedir ciclo duplo. Se as tabelas da 0035 já existem, a query
-- devolve a lista e o ritual para antes de aplicar.

select
  case when count(*) = 0
    then 'PREFLIGHT OK: nada da 0035 existe - pode aplicar'
    else 'PREFLIGHT FALHOU - ja existe: ' || string_agg(alvo, ', ' order by alvo)
  end as resultado
from (
  select table_name::text as alvo
    from information_schema.tables
   where table_schema = 'public'
     and table_name in ('cobranca_reguas', 'cobranca_envios')
) as existentes;
