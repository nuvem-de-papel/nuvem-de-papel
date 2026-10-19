-- 0036_test.sql - recuperação de carrinho abandonado.
-- Verifica: (a) tabelas com RLS, (b) coluna orders.mp_init_point, (c) 3 regras
-- semeadas, (d) unique de idempotência.

select
  case when count(*) = 2
    then 'TESTE OK: cart_recovery_rules e cart_recovery_sends existem com RLS'
    else 'TESTE FALHOU: esperava 2 tabelas com RLS, achou ' || count(*)::text
  end as resultado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('cart_recovery_rules', 'cart_recovery_sends')
  and c.relrowsecurity = true;

select
  case when count(*) = 1
    then 'TESTE OK: orders.mp_init_point existe'
    else 'TESTE FALHOU: falta orders.mp_init_point'
  end as resultado
from information_schema.columns
where table_schema = 'public' and table_name = 'orders' and column_name = 'mp_init_point';

select
  case when count(*) = 3
    then 'TESTE OK: 3 regras padrao (+1, +3, +7)'
    else 'TESTE FALHOU: esperava 3 regras, achou ' || count(*)::text ||
         ' (dias: ' || string_agg(dias::text, ',' order by dias) || ')'
  end as resultado
from cart_recovery_rules;

select
  case when count(*) >= 1
    then 'TESTE OK: unicidade (order_id, rule_id) presente'
    else 'TESTE FALHOU: falta a unique de cart_recovery_sends'
  end as resultado
from pg_constraint
where conrelid = 'public.cart_recovery_sends'::regclass
  and contype = 'u'
  and pg_get_constraintdef(oid) like '%order_id%'
  and pg_get_constraintdef(oid) like '%rule_id%';
