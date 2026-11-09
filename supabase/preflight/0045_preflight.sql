-- 0045_preflight.sql
-- Confere que a coluna da 0045 ainda nao existe. Esperado: 0 linhas.

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'catalog_items'
  and column_name = 'detalhes_produto';
