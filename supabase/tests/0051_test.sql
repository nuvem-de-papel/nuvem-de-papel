-- 0051_test.sql — SQL puro (pgTAP nao instalado no staging/producao, ver 0042).
-- Grade: colunas grupo_pai/cor, indice parcial e grupo_pai anulavel.
-- Gate: a ultima linha de falhas tem que ser 0. Somente leitura.
with checks as (
  select 'grupo_pai existe' as teste,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'catalog_items' and column_name = 'grupo_pai') as ok
  union all
  select 'cor existe',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'catalog_items' and column_name = 'cor')
  union all
  select 'indice idx_catalog_items_grupo_pai existe',
    exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_catalog_items_grupo_pai')
  union all
  select 'grupo_pai aceita null (item sem grade)',
    coalesce((select is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'catalog_items' and column_name = 'grupo_pai'), false)
)
select teste, ok from checks
union all
select 'FALHAS', count(*) = 0 from checks where not ok;
