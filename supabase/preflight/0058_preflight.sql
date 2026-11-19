-- 0058 - preflight: catalog_grupos existe (0057) e a coluna ainda nao.
select
  to_regclass('public.catalog_grupos') is not null as tem_0057,
  not exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='catalog_grupos' and column_name='na_barra') as coluna_nova;
