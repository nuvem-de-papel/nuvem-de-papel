-- 0043_preflight.sql
-- Confere que as colunas group_name/subgroup_name AINDA NAO existem.
-- Esperado: 0 linhas.

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'catalog_items'
  and column_name in ('group_name', 'subgroup_name');
