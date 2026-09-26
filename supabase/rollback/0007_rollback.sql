-- Rollback 0007 — remove livro de estoque e trigger de transição de pedido.
-- O histórico (se houver) é descartado junto: o rollback é explícito.
drop trigger if exists trg_orders_transition on orders;
drop function if exists enforce_orders_transition();

drop trigger if exists trg_stock_movements_immutable on stock_movements;
drop function if exists stock_movements_immutable();

drop function if exists release_order_stock(uuid);
drop function if exists settle_order_stock(uuid);
drop function if exists reserve_order_stock(uuid);
drop function if exists register_stock_movement(uuid, text, integer, text, uuid, text, uuid);

drop policy if exists "le movimentos de estoque (operacional)" on stock_movements;
drop policy if exists "le estoque (operacional)" on item_stock;
drop policy if exists "estoque publico (vitrine)" on item_stock_public;
drop view if exists item_stock_public;   -- 0007 v1 (view) durante a transicao
drop table if exists item_stock_public;
drop table if exists stock_movements;
drop table if exists item_stock;
