-- 0048_preflight.sql
-- Confere que nada da 0048 existe ainda. Esperado: 0 linhas.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('item_images', 'product_reviews');
