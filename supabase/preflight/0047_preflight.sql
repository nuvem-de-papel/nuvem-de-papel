-- 0047_preflight.sql
-- Confere que RLS ainda NAO esta ligado em ncm_referencia. Esperado: 'f' (false).
select relrowsecurity
from pg_class
where relname = 'ncm_referencia' and relnamespace = 'public'::regnamespace;
