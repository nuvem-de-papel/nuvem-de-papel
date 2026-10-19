-- 0037_test.sql - reativação + avaliações.
-- Verifica: (a) 3 tabelas com RLS, (b) unique de idempotência (order_id e
-- customer_id), (c) config semeadado para todos os tenants.

select
  case when count(*) = 3
    then 'TESTE OK: 3 tabelas com RLS'
    else 'TESTE FALHOU: esperava 3 tabelas com RLS, achou ' || count(*)::text
  end as resultado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('marketing_config', 'customer_reactivation', 'review_requests')
  and c.relrowsecurity = true;

select
  case when count(*) >= 1
    then 'TESTE OK: unicidade (order_id) em review_requests'
    else 'TESTE FALHOU: falta unique order_id em review_requests'
  end as resultado
from pg_constraint
where conrelid = 'public.review_requests'::regclass
  and contype = 'u'
  and pg_get_constraintdef(oid) like '%order_id%';

select
  case when count(*) >= 1
    then 'TESTE OK: unicidade (customer_id) em customer_reactivation'
    else 'TESTE FALHOU: falta unique customer_id em customer_reactivation'
  end as resultado
from pg_constraint
where conrelid = 'public.customer_reactivation'::regclass
  and contype = 'u'
  and pg_get_constraintdef(oid) like '%customer_id%';

select
  case when (select count(*) from marketing_config) = (select count(*) from tenants)
    then 'TESTE OK: marketing_config semeadado para todos os tenants'
    else 'TESTE FALHOU: marketing_config (' ||
         (select count(*) from marketing_config)::text || ') != tenants (' ||
         (select count(*) from tenants)::text || ')'
  end as resultado;
