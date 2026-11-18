-- 0055_preflight.sql - rodar antes de aplicar. Tudo true = seguro.
-- Somente leitura.
select
  (select not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'catalog_items'
                         and column_name = 'lancamento_ate')) as coluna_livre,
  (select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'catalog_items'
                     and column_name = 'em_oferta')) as oferta_0053,
  (select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'catalog_items'
                     and column_name = 'grupo_pai')) as grade_0051,
  (select has_table_privilege('anon', 'public.catalog_items', 'select')) as anon_le_catalogo;
