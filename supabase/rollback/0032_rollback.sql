-- 0032_rollback.sql - desfaz a foto do produto (Bloco 2, follow-up).
--
-- ATENCAO: remove a coluna foto_url de catalog_items (a URL da foto de TODOS
-- os produtos). catalog_items em si NAO e apagado. A tela de produto volta ao
-- formato anterior (sem campo Foto). A vitrine continua usando a foto
-- ilustrativa por categoria.

alter table catalog_items drop constraint if exists catalog_items_foto_url_check;
alter table catalog_items drop column if exists foto_url;
