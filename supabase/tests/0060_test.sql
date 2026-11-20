-- 0060 - teste (so leitura). Ultima coluna: FALHAS = true quando tudo passou.
with c as (
  select
    to_regprocedure('public.corporate_place_order(uuid,jsonb,jsonb,text,text)') is not null as rpc_existe,
    to_regprocedure('public.corporate_credit(uuid)') is not null as credito_existe,
    (select prosecdef from pg_proc where oid = to_regprocedure('public.corporate_place_order(uuid,jsonb,jsonb,text,text)')) as rpc_definer,
    not has_function_privilege('anon', 'public.corporate_place_order(uuid,jsonb,jsonb,text,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.corporate_place_order(uuid,jsonb,jsonb,text,text)', 'execute') as rpc_fechada,
    has_function_privilege('service_role', 'public.corporate_place_order(uuid,jsonb,jsonb,text,text)', 'execute') as rpc_service,
    not has_function_privilege('anon', 'public.corporate_credit(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.corporate_credit(uuid)', 'execute') as credito_fechado,
    (select count(*) from pg_proc where proname = 'corporate_place_order') = 1 as sem_sobrecarga,
    pg_get_constraintdef((select oid from pg_constraint where conname = 'financial_titles_source_type_check'))
      like '%corporativo%' as titulo_corporativo,
    pg_get_constraintdef((select oid from pg_constraint where conname = 'orders_condicao_check'))
      like '%dias$%' as condicao_dias,
    public.corporate_credit('00000000-0000-0000-0000-000000000000') is null as credito_conta_inexistente
)
select *, (rpc_existe and credito_existe and rpc_definer and rpc_fechada and rpc_service and credito_fechado
  and sem_sobrecarga and titulo_corporativo and condicao_dias and credito_conta_inexistente) as "FALHAS"
from c;
