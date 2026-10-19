-- 0034_zeragem_dados.sql - Zera todos os dados fictícios de teste (vendas,
-- pedidos, compras, títulos, despesas, caixa, estoque, diário, clientes,
-- fornecedores, produtos, assinaturas, marketplaces operacionais, e-mail,
-- campanhas, endereços, eventos de webhook, audit log, sellers) e preserva
-- o cadastro-base que o sistema precisa para funcionar:
--
--   auth.users, profiles (RBAC), tenants, tenant_branding, tenant_company,
--   sefaz_config, account_catalog (plano de contas), tenant_accounts,
--   cost_centers (centros de custo), club_plans (planos do clube),
--   freight_tabelas (matriz de frete), marketplace_channels (10 canais).
--
-- Baseado em supabase/seed/demo-wipe.sql (linhas 21-85), estendido para
-- cobrir TODAS as tabelas operacionais, não só as do demo.
--
-- O diário é IMUTAVEL (gatilhos trg_journal_*_immutable, 0021:297-312),
-- então os triggers são desligados SOLO dentro desta transação.
--
-- Ordem de delete respeita FKs restrict:
--   financial_settlements.installment_id -> financial_installments (restrict, 0008:158)
--   financial_installments.title_id -> financial_titles (restrict, 0008:139)
--   caixa_movements.session_id -> caixa_sessions (restrict, 0008:62)
--   orders.customer_id -> customers (restrict, 0003:22)
--   purchase_order_items.purchase_order_id -> purchase_orders (cascade, 0009:347)
--   purchase_receipt_items.receipt_id -> purchase_receipts (cascade, 0009:377)
--   notas_entrada.purchase_order_id -> purchase_orders (cascade, 0017:136)
--   journal_entry_lines.entry_id -> journal_entries (cascade, 0021:244)

begin;

-- ---------------------------------------------------------------------------
-- 1. desliga as travas de imutabilidade (só dentro desta transação)
-- ---------------------------------------------------------------------------
alter table journal_entry_lines  disable trigger trg_journal_lines_immutable;
alter table journal_entry_lines  disable trigger trg_journal_line_leaf;
alter table journal_entry_lines  disable trigger trg_journal_balance;
alter table journal_entries      disable trigger trg_journal_entries_immutable;
alter table financial_settlements disable trigger trg_financial_settlements_immutable;
alter table caixa_movements      disable trigger trg_caixa_movements_immutable;
alter table stock_movements      disable trigger trg_stock_movements_immutable;

-- ---------------------------------------------------------------------------
-- 2. apaga na ordem das chaves estrangeiras (folhas primeiro)
-- ---------------------------------------------------------------------------
-- DF-e: nfe_emissoes aponta para orders/purchase_orders com ON DELETE SET NULL,
-- e a constraint exige que order_id ou purchase_order_id exista (0011:26-27).
delete from nfe_emissoes;
delete from nfe_recebidas;
delete from notas_entrada;            -- cascade de purchase_orders (0017:136)

-- Diário contábil (linhas antes do cabeçalho).
delete from journal_entry_lines;
delete from journal_entries;

-- Financeiro (settlements -> installments -> titles, por causa do restrict).
delete from financial_settlements;
delete from financial_installments;
delete from financial_titles;

-- Caixa/PDV (movements antes de sessions, restrict).
delete from caixa_movements;
delete from caixa_sessions;

-- Entregas (eventos antes de entregas, entregas antes de orders).
delete from entrega_eventos;
delete from entregas;

-- Compras (filhas antes de purchase_orders, depois purchase_orders).
delete from purchase_receipt_items;
delete from purchase_receipts;
delete from compra_importacao;
delete from compra_transporte_eventos;
delete from compra_transporte;
delete from compra_envios;
delete from supplier_item_map;        -- cascade de suppliers/catalog_items (0017:196,198)
delete from purchase_order_items;
delete from purchase_orders;

-- Vendas (order_items antes de orders, customer restrict).
delete from order_items;
delete from orders;

-- Despesas (account_code -> account_catalog restrict, 0021:419).
delete from expenses;

-- Estoque.
delete from stock_movements;
delete from item_stock;

-- Marketplace operacional (SÓ os channels ficam - é cadastro-base).
delete from marketplace_webhooks;
delete from marketplace_jobs;
delete from marketplace_orders;
delete from marketplace_listings;
delete from marketplace_accounts;     -- cascade de listings/jobs/orders/webhooks (0026)

-- Conciliação bancária.
delete from bank_linhas;              -- cascade de bank_extratos (0027:34)
delete from bank_extratos;

-- Clube (assinaturas apagam, planos ficam - restrict em plan_id, 0012:56).
delete from club_subscriptions;

-- Vendedores/comissões.
delete from sellers;                  -- profile_id -> auth.users set null (0024:41)

-- E-mail, campanhas, audit log, endereços, webhooks de checkout.
delete from email_messages;
delete from campaigns;
delete from audit_log;
delete from addresses;                -- user_id -> auth.users cascade (0006:39)
delete from webhook_events;

-- Produtos e cadastros operacionais (TODOS os fictícios, não só demo).
delete from item_supplier_data;       -- item_id -> catalog_items cascade (0031:85)
delete from item_prices;
delete from item_fiscal_data;
delete from item_commercial_data;
delete from item_stock_public;
delete from catalog_items;

delete from suppliers;
delete from customers;

-- ---------------------------------------------------------------------------
-- 3. religa as travas
-- ---------------------------------------------------------------------------
alter table stock_movements       enable trigger trg_stock_movements_immutable;
alter table caixa_movements       enable trigger trg_caixa_movements_immutable;
alter table financial_settlements enable trigger trg_financial_settlements_immutable;
alter table journal_entries       enable trigger trg_journal_entries_immutable;
alter table journal_entry_lines   enable trigger trg_journal_line_leaf;
alter table journal_entry_lines   enable trigger trg_journal_balance;
alter table journal_entry_lines   enable trigger trg_journal_lines_immutable;

commit;

-- ---------------------------------------------------------------------------
-- 4. relatório final
-- ---------------------------------------------------------------------------
select 'journal_entries'    as tabela, count(*)::text as linhas from journal_entries
union all select 'journal_entry_lines', count(*)::text from journal_entry_lines
union all select 'orders',               count(*)::text from orders
union all select 'order_items',          count(*)::text from order_items
union all select 'purchase_orders',      count(*)::text from purchase_orders
union all select 'purchase_receipts',    count(*)::text from purchase_receipts
union all select 'financial_titles',     count(*)::text from financial_titles
union all select 'financial_installments',count(*)::text from financial_installments
union all select 'financial_settlements',count(*)::text from financial_settlements
union all select 'expenses',             count(*)::text from expenses
union all select 'caixa_sessions',       count(*)::text from caixa_sessions
union all select 'caixa_movements',      count(*)::text from caixa_movements
union all select 'stock_movements',      count(*)::text from stock_movements
union all select 'item_stock',           count(*)::text from item_stock
union all select 'entregas',             count(*)::text from entregas
union all select 'club_subscriptions',   count(*)::text from club_subscriptions
union all select 'sellers',              count(*)::text from sellers
union all select 'customers',            count(*)::text from customers
union all select 'suppliers',            count(*)::text from suppliers
union all select 'catalog_items',        count(*)::text from catalog_items
union all select 'bank_extratos',        count(*)::text from bank_extratos
union all select 'marketplace_accounts', count(*)::text from marketplace_accounts
union all select 'marketplace_listings', count(*)::text from marketplace_listings
union all select 'email_messages',       count(*)::text from email_messages
union all select 'campaigns',            count(*)::text from campaigns
union all select 'audit_log',            count(*)::text from audit_log
union all select 'addresses',            count(*)::text from addresses
union all select 'webhook_events',       count(*)::text from webhook_events
union all select 'nfe_emissoes',         count(*)::text from nfe_emissoes
union all select 'nfe_recebidas',        count(*)::text from nfe_recebidas
union all select 'notas_entrada',        count(*)::text from notas_entrada
union all select '--- BASE (deve ter linhas) ---', '-' 
union all select 'auth.users',           count(*)::text from auth.users
union all select 'profiles',             count(*)::text from profiles
union all select 'tenants',              count(*)::text from tenants
union all select 'account_catalog',      count(*)::text from account_catalog
union all select 'tenant_accounts',      count(*)::text from tenant_accounts
union all select 'cost_centers',         count(*)::text from cost_centers
union all select 'club_plans',           count(*)::text from club_plans
union all select 'freight_tabelas',      count(*)::text from freight_tabelas
union all select 'marketplace_channels', count(*)::text from marketplace_channels
order by 1;
