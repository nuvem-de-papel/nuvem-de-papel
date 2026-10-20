-- 0039_preflight.sql - carta de insights com IA.
-- Objetivo: impedir ciclo duplo. Se insight_cartas ja existe, para.

select
  case when count(*) = 0
    then 'PREFLIGHT OK: insight_cartas nao existe - pode aplicar'
    else 'PREFLIGHT FALHOU - ja existe a tabela insight_cartas'
  end as resultado
from information_schema.tables
where table_schema = 'public' and table_name = 'insight_cartas';
