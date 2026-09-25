-- Preflight 0003 — confirma pré-requisitos antes de aplicar.
-- 1) enum sales_channel (criado em 0001) precisa existir.
select case when exists (select 1 from pg_type where typname = 'sales_channel')
  then 1 else 1/0 end as sales_channel_existe;

-- 2) as tabelas novas NÃO podem existir ainda (evita rodar 2x por engano).
select case when to_regclass('public.customers') is null then 1 else 1/0 end as customers_ainda_nao_existe;
select case when to_regclass('public.orders') is null then 1 else 1/0 end as orders_ainda_nao_existe;
select case when to_regclass('public.campaigns') is null then 1 else 1/0 end as campaigns_ainda_nao_existe;
