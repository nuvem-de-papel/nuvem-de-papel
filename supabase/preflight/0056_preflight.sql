-- 0056_preflight.sql - rodar antes de aplicar. Tudo true = seguro.
-- Somente leitura.
select
  (select not exists (select 1 from storage.buckets where id = 'produtos')) as bucket_livre,
  (select exists (select 1 from information_schema.tables
                   where table_schema = 'public' and table_name = 'item_images')) as item_images_0048,
  (select not exists (select 1 from pg_policies
                       where schemaname = 'storage' and tablename = 'objects'
                         and (coalesce(qual, '') ilike '%produtos%'
                              or coalesce(with_check, '') ilike '%produtos%'))) as sem_policy_produtos;
