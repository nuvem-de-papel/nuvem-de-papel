-- 0034_test.sql - Zeragem de dados fictícios.
-- Verifica que (a) todas as tabelas operacionais estão vazias e (b) o
-- cadastro-base sobreviveu com as linhas certas.

-- 1. tabelas operacionais devem estar vazias
select
  case when count(*) = 0
    then 'TESTE OK: 0 linhas em todas as tabelas operacionais'
    else 'TESTE FALHOU: ainda ha dados em: ' || string_agg(tabela, ', ' order by tabela)
  end as resultado
from (
  select 'journal_entries' as tabela from journal_entries where true
  union all select 'journal_entry_lines' from journal_entry_lines where true
  union all select 'orders'               from orders where true
  union all select 'order_items'          from order_items where true
  union all select 'purchase_orders'      from purchase_orders where true
  union all select 'purchase_receipts'    from purchase_receipts where true
  union all select 'financial_titles'     from financial_titles where true
  union all select 'financial_installments'from financial_installments where true
  union all select 'financial_settlements'from financial_settlements where true
  union all select 'expenses'             from expenses where true
  union all select 'caixa_sessions'       from caixa_sessions where true
  union all select 'caixa_movements'      from caixa_movements where true
  union all select 'stock_movements'      from stock_movements where true
  union all select 'item_stock'           from item_stock where true
  union all select 'entregas'             from entregas where true
  union all select 'club_subscriptions'   from club_subscriptions where true
  union all select 'sellers'              from sellers where true
  union all select 'customers'            from customers where true
  union all select 'suppliers'            from suppliers where true
  union all select 'catalog_items'        from catalog_items where true
  union all select 'bank_extratos'        from bank_extratos where true
  union all select 'marketplace_accounts' from marketplace_accounts where true
  union all select 'marketplace_listings' from marketplace_listings where true
  union all select 'email_messages'       from email_messages where true
  union all select 'campaigns'            from campaigns where true
  union all select 'audit_log'            from audit_log where true
  union all select 'addresses'            from addresses where true
  union all select 'webhook_events'       from webhook_events where true
  union all select 'nfe_emissoes'         from nfe_emissoes where true
  union all select 'nfe_recebidas'        from nfe_recebidas where true
  union all select 'notas_entrada'        from notas_entrada where true
) as vazias;

-- 2. cadastro-base deve ter linhas
select
  case when min(n) > 0
    then 'TESTE OK: cadastro-base preservado (' || string_agg(tabela || '=' || n, ', ' order by tabela) || ')'
    else 'TESTE FALHOU: cadastro-base vazio em: ' || string_agg(case when n = 0 then tabela end, ', ')
  end as resultado
from (
  select 'auth.users'       as tabela, count(*) as n from auth.users
  union all select 'profiles',             count(*) from profiles
  union all select 'tenants',              count(*) from tenants
  union all select 'account_catalog',      count(*) from account_catalog
  union all select 'tenant_accounts',      count(*) from tenant_accounts
  union all select 'cost_centers',         count(*) from cost_centers
  union all select 'club_plans',           count(*) from club_plans
  union all select 'freight_tabelas',      count(*) from freight_tabelas
  union all select 'marketplace_channels', count(*) from marketplace_channels
) as base;
