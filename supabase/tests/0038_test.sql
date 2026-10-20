-- 0038_test.sql - descrição de produto com IA.
select
  case when count(*) = 1
    then 'TESTE OK: catalog_items.description existe'
    else 'TESTE FALHOU: falta catalog_items.description (' || count(*)::text || ')'
  end as resultado
from information_schema.columns
where table_schema = 'public' and table_name = 'catalog_items' and column_name = 'description';
