-- supabase/seed/demo-wipe.sql - ZERA os dados de negocio (diario, pedidos,
-- compras, titulos, despesas, caixa, estoque) e deixa o banco pronto para um
-- novo povoamento com o demo.sql.
--
-- Dois motivos para existir:
--   1. o diario e IMUTAVEL (gatilhos trg_journal_*_immutable), entao nao da
--      para simplesmente "refazer" os lancamentos - apaga-se na mao, com os
--      gatilhos de imutabilidade desligados dentro da transacao;
--   2. no VOAO DEFINITIVO do projeto tudo isso e apagado e comeca-se da
--      estaca zero. Este script e o "zerar" desse momento.
--
-- O que NAO e apagado (vem da 0021 e continua valendo):
--   plano de contas (account_catalog / tenant_accounts), centros de custo e a
--   estrutura das tabelas. Clientes e produtos DEMO (id d3e00000-...) tambem
--   sao apagados aqui, entao o demo.sql reconstrui tudo do zero.
begin;

-- ---------------------------------------------------------------------------
-- 1. desliga as travas de imutabilidade (so dentro desta transacao)
-- ---------------------------------------------------------------------------
alter table journal_entry_lines  disable trigger trg_journal_lines_immutable;
alter table journal_entry_lines  disable trigger trg_journal_line_leaf;
alter table journal_entry_lines  disable trigger trg_journal_balance;
alter table journal_entries      disable trigger trg_journal_entries_immutable;
alter table financial_settlements disable trigger trg_financial_settlements_immutable;
alter table caixa_movements      disable trigger trg_caixa_movements_immutable;
alter table stock_movements      disable trigger trg_stock_movements_immutable;

-- ---------------------------------------------------------------------------
-- 2. apaga na ordem das chaves estrangeiras
-- ---------------------------------------------------------------------------
-- DF-e primeiro: nfe_emissoes aponta para orders/purchase_orders com ON DELETE
-- SET NULL, e a propria constraint exige que order_id ou purchase_order_id
-- exista - apagar o pedido antes da nota estoura.
delete from nfe_emissoes;
delete from nfe_recebidas;
delete from notas_entrada;

delete from journal_entry_lines;
delete from journal_entries;

delete from financial_settlements;
delete from financial_installments;
delete from financial_titles;

delete from caixa_movements;
delete from caixa_sessions;

delete from purchase_receipt_items;
delete from purchase_receipts;
delete from purchase_order_items;
delete from purchase_orders;

delete from order_items;
delete from orders;

delete from expenses;

delete from stock_movements;
delete from item_stock;

-- ---------------------------------------------------------------------------
-- 3. cadastros DEMO (o pre-existente - 2 clientes, 6 produtos, 4 centros de
--    custo e o plano de contas - fica de pe)
-- ---------------------------------------------------------------------------
delete from item_prices          where channel = 'atacado';
delete from item_fiscal_data     where item_id::text like 'd3e00000%';
delete from item_commercial_data where item_id::text like 'd3e00000%';
delete from item_prices          where item_id::text like 'd3e00000%';
delete from catalog_items        where id::text    like 'd3e00000%';
delete from suppliers            where id::text    like 'd3e00000%';
delete from customers            where id::text    like 'd3e00000%';

-- ---------------------------------------------------------------------------
-- 4. religa as travas
-- ---------------------------------------------------------------------------
alter table stock_movements       enable trigger trg_stock_movements_immutable;
alter table caixa_movements       enable trigger trg_caixa_movements_immutable;
alter table financial_settlements enable trigger trg_financial_settlements_immutable;
alter table journal_entries       enable trigger trg_journal_entries_immutable;
alter table journal_entry_lines   enable trigger trg_journal_line_leaf;
alter table journal_entry_lines   enable trigger trg_journal_balance;
alter table journal_entry_lines   enable trigger trg_journal_lines_immutable;

commit;

select 'journal_entries'   as tabela, count(*)::text as linhas from journal_entries
union all select 'journal_entry_lines', count(*)::text from journal_entry_lines
union all select 'orders',              count(*)::text from orders
union all select 'order_items',         count(*)::text from order_items
union all select 'purchase_orders',     count(*)::text from purchase_orders
union all select 'purchase_receipts',   count(*)::text from purchase_receipts
union all select 'financial_titles',    count(*)::text from financial_titles
union all select 'expenses',            count(*)::text from expenses
union all select 'caixa_sessions',      count(*)::text from caixa_sessions
union all select 'caixa_movements',     count(*)::text from caixa_movements
union all select 'customers (demo)',    count(*)::text from customers where id::text like 'd3e00000%'
union all select 'catalog_items (demo)',count(*)::text from catalog_items where id::text like 'd3e00000%'
order by 1;
