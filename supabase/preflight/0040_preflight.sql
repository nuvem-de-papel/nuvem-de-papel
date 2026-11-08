-- 0040_preflight.sql - venda manual (telefone/balcao).
-- Objetivo: impedir ciclo duplo. Se a funcao manual_register_sale ja existe,
-- para (a migration ja foi aplicada nesta base).

select
  case when count(*) = 0
    then 'PREFLIGHT OK: manual_register_sale nao existe - pode aplicar'
    else 'PREFLIGHT FALHOU - ja existe a funcao manual_register_sale'
  end as resultado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'manual_register_sale';
