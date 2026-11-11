-- 0050_preflight.sql — rodar antes de aplicar. Tudo true = seguro.
select
  (select count(*) = 0 from quote_requests) as sem_orcamentos_0049,
  (select to_regclass('public.quote_request_items') is null) as tabela_items_livre,
  (select not exists (select 1 from information_schema.columns
                       where table_schema='public' and table_name='customers'
                         and column_name='auth_user_id')) as coluna_auth_livre;
