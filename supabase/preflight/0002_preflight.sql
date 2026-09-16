-- Preflight 0002 — espera 0 antes de aplicar pela primeira vez.
select count(*) as publications_exists
from information_schema.tables
where table_name = 'publications';
