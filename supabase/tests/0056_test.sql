-- 0056_test.sql - SQL puro (pgTAP nao instalado no staging/producao, ver 0042).
-- Bucket `produtos`: existe, publico, teto 2 MB, so imagem, e nenhuma policy
-- em storage.objects abre escrita/listagem dele para anon/authenticated.
-- Gate: a ultima linha FALHAS tem que ser true. Somente leitura.
with b as (
  select public, file_size_limit, allowed_mime_types
  from storage.buckets where id = 'produtos'
),
checks as (
  select 'bucket produtos existe' as teste, exists (select 1 from b) as ok
  union all
  select 'bucket publico (vitrine le pela URL)', coalesce((select public from b), false)
  union all
  select 'teto de 2 MB por arquivo', coalesce((select file_size_limit = 2097152 from b), false)
  union all
  select 'so jpeg/png/webp',
    coalesce((select allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']
                     and cardinality(allowed_mime_types) = 3 from b), false)
  union all
  select 'nenhuma policy de storage.objects cita produtos',
    not exists (select 1 from pg_policies
                where schemaname = 'storage' and tablename = 'objects'
                  and (coalesce(qual, '') ilike '%produtos%'
                       or coalesce(with_check, '') ilike '%produtos%'))
)
select teste, ok from checks
union all
select 'FALHAS', count(*) = 0 from checks where not ok;
