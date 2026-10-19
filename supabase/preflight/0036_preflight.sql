-- 0036_preflight.sql - recuperação de carrinho abandonado.
-- Objetivo: impedir ciclo duplo. Se as tabelas da 0036 já existem, para antes.

select
  case when count(*) = 0
    then 'PREFLIGHT OK: nada da 0036 existe - pode aplicar'
    else 'PREFLIGHT FALHOU - ja existe: ' || string_agg(alvo, ', ' order by alvo)
  end as resultado
from (
  select table_name::text as alvo
    from information_schema.tables
   where table_schema = 'public'
     and table_name in ('cart_recovery_rules', 'cart_recovery_sends')
  union all
  select 'orders.mp_init_point'
    from information_schema.columns
   where table_schema = 'public' and table_name = 'orders'
     and column_name = 'mp_init_point'
) as existentes;
