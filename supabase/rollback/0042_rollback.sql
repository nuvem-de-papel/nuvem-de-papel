-- 0042_rollback.sql
-- Desfaz 0042: move o pgtap de volta pra "public".
-- ATENCAO: isso reintroduz o ruido no pg_dump (achado original da auditoria).
-- So usar se 0042 causar regressao real.

begin;

alter extension pgtap set schema public;

commit;
