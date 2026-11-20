-- 0059 - rollback: so funciona sem pedido com origem 'corporativo'.
begin;
alter table public.orders drop constraint if exists orders_origem_check;
alter table public.orders add constraint orders_origem_check
  check (origem in ('erp', 'pdv', 'loja', 'manual'));
drop index if exists public.idx_orders_corporate_account;
alter table public.orders drop column if exists corporate_account_id;
drop table if exists public.corporate_alerts;
drop table if exists public.corporate_buyers;
drop table if exists public.corporate_accounts;
commit;
