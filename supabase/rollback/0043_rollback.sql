-- 0043_rollback.sql
-- Desfaz 0043: remove group_name/subgroup_name de catalog_items.
-- ATENCAO: apaga qualquer valor ja gravado nessas colunas.

begin;

alter table catalog_items
  drop column if exists group_name,
  drop column if exists subgroup_name;

commit;
