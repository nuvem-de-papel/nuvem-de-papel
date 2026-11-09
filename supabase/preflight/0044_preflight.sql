-- 0044_preflight.sql
-- Confere que nada da 0044 existe ainda. Esperado: as duas consultas abaixo
-- devolvem 0 linhas.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('stock_locations', 'item_stock_by_location');

select e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname = 'sales_channel'
  and e.enumlabel = 'web';
