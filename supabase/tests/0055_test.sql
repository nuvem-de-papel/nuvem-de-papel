-- 0055_test.sql - SQL puro (pgTAP nao instalado no staging/producao, ver 0042).
-- Lancamento: catalog_items.lancamento_ate date, nullable, sem default,
-- legivel por anon/authenticated (a vitrine le com a chave publica).
-- Gate: a ultima linha FALHAS tem que ser true. Somente leitura.
with col as (
  select data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'catalog_items'
    and column_name = 'lancamento_ate'
),
existe as (select exists (select 1 from col) as sim),
checks as (
  select 'lancamento_ate existe' as teste, (select sim from existe) as ok
  union all
  select 'tipo date', coalesce((select data_type = 'date' from col), false)
  union all
  select 'aceita null (produto normal)', coalesce((select is_nullable = 'YES' from col), false)
  union all
  select 'sem default (nada nasce lancamento)', coalesce((select column_default is null from col), false)
  union all
  select 'anon le a coluna (vitrine)',
    case when (select sim from existe)
      then has_column_privilege('anon', 'public.catalog_items', 'lancamento_ate', 'select')
      else false end
  union all
  select 'authenticated le a coluna',
    case when (select sim from existe)
      then has_column_privilege('authenticated', 'public.catalog_items', 'lancamento_ate', 'select')
      else false end
  union all
  select 'comentario documentado',
    coalesce((select col_description('public.catalog_items'::regclass, a.attnum) is not null
              from pg_attribute a
              where a.attrelid = 'public.catalog_items'::regclass
                and a.attname = 'lancamento_ate' and not a.attisdropped), false)
)
select teste, ok from checks
union all
select 'FALHAS', count(*) = 0 from checks where not ok;
