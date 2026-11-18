-- 0055_rollback.sql - remove a data de lancamento.
-- ATENCAO: reverter ANTES o deploy que le catalog_items.lancamento_ate
-- (getStoreProducts / getPaginaProduto / cadastro / catalogo admin), senao a
-- vitrine quebra no select. As datas gravadas se perdem.
begin;
alter table public.catalog_items drop column if exists lancamento_ate;
commit;
