-- 0048_rollback.sql
-- Desfaz 0048: remove item_images, product_reviews e as policies.
-- ATENCAO: apaga qualquer foto/avaliacao ja cadastrada nessas tabelas.

begin;

drop policy if exists product_reviews_public_read on product_reviews;
drop policy if exists item_images_public_read on item_images;

drop table if exists product_reviews;
drop table if exists item_images;

commit;
