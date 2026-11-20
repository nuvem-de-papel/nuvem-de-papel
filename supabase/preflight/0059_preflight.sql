-- 0059 - preflight: base existe, objetos novos ainda nao, nenhum pedido com origem fora da lista nova.
select
  to_regclass('public.customers') is not null and to_regclass('public.orders') is not null as base_ok,
  to_regclass('public.corporate_accounts') is null as accounts_novo,
  to_regclass('public.corporate_buyers') is null as buyers_novo,
  to_regclass('public.corporate_alerts') is null as alerts_novo,
  not exists (select 1 from information_schema.columns where table_schema='public'
               and table_name='orders' and column_name='corporate_account_id') as coluna_nova,
  not exists (select 1 from public.orders
               where origem not in ('erp','pdv','loja','manual','corporativo')) as origens_ok;
