-- 0054_test.sql - SQL puro (pgTAP nao instalado no staging/producao, ver 0042).
-- Estrutura do cancelamento de venda. Somente leitura (roda nas duas bases).
-- O comportamento (estorno, estoque, diario) e testado em
-- 0054_smoke_staging.sql, que escreve e por isso roda SO no staging.
-- Gate: a ultima linha FALHAS tem que ser true.
with fn as (
  select p.oid, p.prosecdef, p.proconfig
    from pg_proc p
   where p.oid = to_regprocedure('public.sale_cancel(uuid, text, uuid)')
),
checks as (
  select 'sale_cancel existe' as teste, exists (select 1 from fn) as ok
  union all
  select 'sale_cancel security definer', coalesce((select prosecdef from fn), false)
  union all
  select 'search_path fixo',
    coalesce((select proconfig::text like '%search_path=public%' from fn), false)
  union all
  select 'service_role executa',
    coalesce((select has_function_privilege('service_role', oid, 'execute') from fn), false)
  union all
  select 'anon nao executa',
    coalesce((select not has_function_privilege('anon', oid, 'execute') from fn), false)
  union all
  select 'authenticated nao executa',
    coalesce((select not has_function_privilege('authenticated', oid, 'execute') from fn), false)
  union all
  select 'orders.cancelado_motivo text',
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'orders'
               and column_name = 'cancelado_motivo' and data_type = 'text')
  union all
  select 'orders.cancelado_por uuid',
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'orders'
               and column_name = 'cancelado_por' and data_type = 'uuid')
  union all
  select 'check do motivo',
    exists (select 1 from pg_constraint
             where conname = 'orders_cancelado_motivo_check'
               and conrelid = 'public.orders'::regclass)
)
select teste, ok from checks
union all
select 'FALHAS', count(*) = 0 from checks where not ok;
