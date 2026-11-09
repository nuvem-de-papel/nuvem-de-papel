-- 0045_rollback.sql
-- Desfaz 0045: remove a coluna detalhes_produto.
-- ATENCAO: apaga qualquer texto ja digitado/importado nesse campo.

begin;

alter table catalog_items drop column if exists detalhes_produto;

commit;
