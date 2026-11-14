-- 0053_test.sql — SQL puro (pgTAP nao instalado no staging/producao, ver 0042).
-- Flags de vitrine: em_oferta e em_destaque, boolean not null default false.
-- Gate: a ultima linha FALHAS tem que ser true. Somente leitura.
with cols as (
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'catalog_items'
    and column_name in ('em_oferta', 'em_destaque')
),
checks as (
  select 'em_oferta existe' as teste, exists (select 1 from cols where column_name = 'em_oferta') as ok
  union all
  select 'em_destaque existe', exists (select 1 from cols where column_name = 'em_destaque')
  union all
  select 'em_oferta boolean not null',
    coalesce((select data_type = 'boolean' and is_nullable = 'NO' from cols where column_name = 'em_oferta'), false)
  union all
  select 'em_destaque boolean not null',
    coalesce((select data_type = 'boolean' and is_nullable = 'NO' from cols where column_name = 'em_destaque'), false)
  union all
  select 'defaults false',
    coalesce((select bool_and(column_default = 'false') from cols), false)
)
select teste, ok from checks
union all
select 'FALHAS', count(*) = 0 from checks where not ok;
