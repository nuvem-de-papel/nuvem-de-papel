-- 0049_preflight.sql — rodar antes de aplicar. Tudo true = seguro.
select
  (select count(*) = 0 from pg_views where viewname = 'item_stock_cd_public') as view_livre,
  (select to_regclass('public.quote_requests') is null) as tabela_livre,
  (select to_regclass('public.item_stock_by_location') is not null) as depende_0044_ok,
  (select to_regclass('public.stock_locations') is not null) as depende_0044_ok2;
