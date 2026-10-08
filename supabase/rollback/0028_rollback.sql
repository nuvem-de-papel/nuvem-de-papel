-- 0028_rollback.sql - desfaz a tabela de frete.
--
-- ATENCAO: apaga a tabela de cotações (preços/prazos importados dos
-- Correios). O checkout volta a ficar sem cálculo de frete (a seção de
-- frete some com erro fail-closed). Nenhuma outra tabela e afetada.

drop table if exists public.freight_tabelas cascade;
