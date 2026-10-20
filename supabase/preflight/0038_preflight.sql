-- 0038_preflight.sql - descrição de produto com IA.
-- Objetivo: impedir ciclo duplo. Se catalog_items.description já existe, para.

select
  case when count(*) = 0
    then 'PREFLIGHT OK: description nao existe - pode aplicar'
    else 'PREFLIGHT FALHOU - ja existe: catalog_items.description'
  end as resultado
from information_schema.columns
where table_schema = 'public' and table_name = 'catalog_items' and column_name = 'description';
