-- 0054_preflight.sql - rodar antes de aplicar. Tudo true = seguro.
-- Somente leitura.
select
  (select to_regprocedure('public.sale_cancel(uuid, text, uuid)') is null) as funcao_livre,
  (select not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'orders'
                         and column_name in ('cancelado_motivo', 'cancelado_por'))) as colunas_livres,
  (select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'orders'
                     and column_name = 'cancelado_em')) as cancelado_em_existe_0015,
  (select to_regprocedure('public.release_order_stock(uuid)') is not null) as release_stock_0007,
  (select to_regprocedure('public.manual_register_sale(jsonb, text, sales_channel, integer, numeric, uuid, jsonb, jsonb, text)') is not null) as venda_manual_0040,
  (select exists (select 1 from pg_trigger where tgname = 'trg_post_settlement_accounting')) as gatilho_liquidacao_0022,
  (select exists (select 1 from pg_trigger where tgname = 'trg_post_order_accounting')) as gatilho_pedido_0022;
