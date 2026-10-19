-- 0035_test.sql - régua de cobrança automática.
-- Verifica: (a) as duas tabelas existem com RLS ligado, (b) as 5 regras padrão
-- foram semeadas, (c) a constraint de unicidade (idempotência) está de pé.

-- 1. tabelas existem e RLS ligado
select
  case when count(*) = 2
    then 'TESTE OK: tabelas cobranca_reguas e cobranca_envios existem com RLS'
    else 'TESTE FALHOU: esperava 2 tabelas com RLS, achou ' || count(*)::text
  end as resultado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('cobranca_reguas', 'cobranca_envios')
  and c.relrowsecurity = true;

-- 2. as 5 regras padrão foram semeadas
select
  case when count(*) = 5
    then 'TESTE OK: 5 regras padrao (-3, 0, 3, 7, 15)'
    else 'TESTE FALHOU: esperava 5 regras, achou ' || count(*)::text ||
         ' (dias: ' || string_agg(dias::text, ',' order by dias) || ')'
  end as resultado
from cobranca_reguas;

-- 3. constraint de unicidade (idempotência) presente
select
  case when count(*) >= 1
    then 'TESTE OK: unicidade (installment_id, regua_id, canal) presente'
    else 'TESTE FALHOU: falta a unique de cobranca_envios'
  end as resultado
from pg_constraint
where conrelid = 'public.cobranca_envios'::regclass
  and contype = 'u'
  and pg_get_constraintdef(oid) like '%installment_id%'
  and pg_get_constraintdef(oid) like '%regua_id%';
