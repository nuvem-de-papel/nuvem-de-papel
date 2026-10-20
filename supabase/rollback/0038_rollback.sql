-- 0038_rollback.sql - desfaz a descrição de produto com IA.
-- Remove só a coluna; nenhum dado de produto é perdido além das descrições.

alter table catalog_items drop column if exists description;
