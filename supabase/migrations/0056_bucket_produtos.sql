-- 0056_bucket_produtos.sql - bucket publico de fotos de produto (18/11/2026).
--
-- Por que: as fotos do catalogo JQ (pacote jq_export_2026-11-16: 764 SKUs,
-- 3.820 fotos, 3.133 arquivos unicos ~176 MB) vao para o Supabase Storage
-- (decisao do dono 16/11/2026), nao para public/ do repositorio. Ate aqui o
-- unico bucket era `email-attachments` (privado).
--
-- Desenho:
--  - publico: a vitrine monta <img src> com a URL publica
--    (/storage/v1/object/public/produtos/...), que passa no FOTO_REMOTA_OK
--    (https + .jpg|.jpeg|.png|.webp) de src/components/ProductImage.tsx;
--  - SEM policy em storage.objects: anon/authenticated nao listam nem
--    enviam nada. Quem grava e o importador (scripts/importar-jq.cjs) com a
--    service_role, que passa por cima do RLS. A URL publica nao depende de
--    policy de leitura;
--  - teto de 2 MB por arquivo (o maior do pacote tem 589 KB) e so imagem;
--  - caminho por conteudo: jq/<sha256>.jpg - o mesmo arquivo usado em varios
--    slots/SKUs sobe uma vez so, e reimportar nao duplica.
-- Idempotente (on conflict).
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;
