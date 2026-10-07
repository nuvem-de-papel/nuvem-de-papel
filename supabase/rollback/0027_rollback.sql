-- 0027_rollback.sql - desfaz a conciliacao bancaria.
-- Ordem: filha antes da pais.
--
-- ATENCAO: apaga o historico de extratos importados e todas as
-- conciliacoes. As linhas do diario NAO sao afetadas - conciliacao nao
-- gera lancamento nenhum. Rodar so se a 0027 precisar ser retirada.

drop table if exists public.bank_linhas cascade;
drop table if exists public.bank_extratos cascade;
