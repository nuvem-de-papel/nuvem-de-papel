-- 0042_preflight.sql
-- Confere que o pgtap esta instalado e em "public" antes de mover.
-- Esperado: 1 linha com schema = 'public'.

select e.extname, n.nspname as schema, e.extversion
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgtap';
