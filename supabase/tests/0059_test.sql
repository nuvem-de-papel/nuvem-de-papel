-- 0059 - teste (so leitura). Ultima coluna: FALHAS = true quando tudo passou.
with c as (
  select
    to_regclass('public.corporate_accounts') is not null as t_accounts,
    to_regclass('public.corporate_buyers') is not null as t_buyers,
    to_regclass('public.corporate_alerts') is not null as t_alerts,
    (select relrowsecurity from pg_class where oid = 'public.corporate_accounts'::regclass)
      and (select relrowsecurity from pg_class where oid = 'public.corporate_buyers'::regclass)
      and (select relrowsecurity from pg_class where oid = 'public.corporate_alerts'::regclass) as rls_on,
    (select count(*) from pg_policy where polrelid in ('public.corporate_accounts'::regclass,
       'public.corporate_buyers'::regclass, 'public.corporate_alerts'::regclass)) = 3 as tres_policies,
    not has_table_privilege('anon', 'public.corporate_accounts', 'select') as anon_nao_le,
    has_table_privilege('authenticated', 'public.corporate_accounts', 'select')
      and not has_table_privilege('authenticated', 'public.corporate_accounts', 'insert') as auth_so_le,
    has_table_privilege('service_role', 'public.corporate_accounts', 'insert') as service_escreve,
    exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'orders' and column_name = 'corporate_account_id') as coluna_orders,
    pg_get_constraintdef((select oid from pg_constraint where conname = 'orders_origem_check'
       and conrelid = 'public.orders'::regclass)) like '%corporativo%' as origem_corporativo,
    exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'corporate_accounts' and column_name = 'limite_credito'
             and column_default like '0%') as limite_padrao_zero,
    exists (select 1 from pg_constraint where conname = 'corporate_accounts_ativa_aprovada') as check_ativa,
    exists (select 1 from pg_indexes where tablename = 'corporate_alerts'
             and indexdef like '%UNIQUE%order_id%') as alerta_unico,
    exists (select 1 from pg_indexes where tablename = 'corporate_buyers'
             and indexdef like '%UNIQUE%auth_user_id%') as login_unico
)
select *, (t_accounts and t_buyers and t_alerts and rls_on and tres_policies and anon_nao_le and auth_so_le
  and service_escreve and coluna_orders and origem_corporativo and limite_padrao_zero and check_ativa
  and alerta_unico and login_unico) as "FALHAS"
from c;
