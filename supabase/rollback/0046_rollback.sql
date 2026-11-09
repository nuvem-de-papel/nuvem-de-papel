-- 0046_rollback.sql
-- Desfaz 0046: remove a tabela ncm_referencia (so referencia manual,
-- nao ha FK de outra tabela apontando pra ela).
begin;
drop table if exists ncm_referencia;
commit;
