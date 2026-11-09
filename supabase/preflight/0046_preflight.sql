-- 0046_preflight.sql
-- Confere que a tabela da 0046 ainda nao existe. Esperado: 0 linhas.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'ncm_referencia';
