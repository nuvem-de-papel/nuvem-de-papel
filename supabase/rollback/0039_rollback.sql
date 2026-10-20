-- 0039_rollback.sql - desfaz a carta de insights com IA.
-- Remove a tabela (cartas geradas sao descartadas - podem ser regeradas).

drop table if exists public.insight_cartas;
