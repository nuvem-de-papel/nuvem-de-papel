-- 0034_preflight.sql - Zeragem de dados fictícios.
-- Objetivo: mostrar o que SERÁ apagado (contagens das tabelas operacionais)
-- e confirmar que o cadastro-base EXISTE antes de rodar (para garantir que a
-- zeragem não vai deixar o sistema órfão). Se a base estiver vazia, PARAR.

-- 1. cadastro-base que DEVE sobreviver (se algum estiver 0, abortar)
select
  case when min(n) = 0
    then 'PREFLIGHT FALHOU - cadastro-base vazio: ' ||
         string_agg(case when n = 0 then tabela end, ', ')
    else 'PREFLIGHT OK: cadastro-base presente - pode aplicar a 0034'
  end as resultado
from (
  select 'tenants'              as tabela, count(*) as n from tenants
  union all select 'account_catalog',  count(*) from account_catalog
  union all select 'tenant_accounts',  count(*) from tenant_accounts
  union all select 'cost_centers',     count(*) from cost_centers
  union all select 'club_plans',       count(*) from club_plans
  union all select 'freight_tabelas',  count(*) from freight_tabelas
  union all select 'marketplace_channels', count(*) from marketplace_channels
) as base;

-- 2. o que será apagado (tabelas operacionais)
select 'OPERACIONAIS (serao zeradas)' as grupo,
       'journal_entries' as tabela, count(*)::text as linhas from journal_entries
union all select '', 'journal_entry_lines', count(*)::text from journal_entry_lines
union all select '', 'orders',               count(*)::text from orders
union all select '', 'order_items',          count(*)::text from order_items
union all select '', 'purchase_orders',      count(*)::text from purchase_orders
union all select '', 'purchase_receipts',    count(*)::text from purchase_receipts
union all select '', 'financial_titles',     count(*)::text from financial_titles
union all select '', 'financial_installments',count(*)::text from financial_installments
union all select '', 'financial_settlements',count(*)::text from financial_settlements
union all select '', 'expenses',             count(*)::text from expenses
union all select '', 'caixa_sessions',       count(*)::text from caixa_sessions
union all select '', 'caixa_movements',      count(*)::text from caixa_movements
union all select '', 'stock_movements',      count(*)::text from stock_movements
union all select '', 'item_stock',           count(*)::text from item_stock
union all select '', 'entregas',             count(*)::text from entregas
union all select '', 'club_subscriptions',   count(*)::text from club_subscriptions
union all select '', 'sellers',              count(*)::text from sellers
union all select '', 'customers',            count(*)::text from customers
union all select '', 'suppliers',            count(*)::text from suppliers
union all select '', 'catalog_items',        count(*)::text from catalog_items
union all select '', 'bank_extratos',        count(*)::text from bank_extratos
union all select '', 'marketplace_accounts', count(*)::text from marketplace_accounts
union all select '', 'marketplace_listings', count(*)::text from marketplace_listings
union all select '', 'email_messages',       count(*)::text from email_messages
union all select '', 'campaigns',            count(*)::text from campaigns
union all select '', 'audit_log',            count(*)::text from audit_log
union all select '', 'addresses',            count(*)::text from addresses
union all select '', 'webhook_events',       count(*)::text from webhook_events
union all select '', 'nfe_emissoes',         count(*)::text from nfe_emissoes
union all select '', 'nfe_recebidas',        count(*)::text from nfe_recebidas
union all select '', 'notas_entrada',        count(*)::text from notas_entrada
order by 2;
