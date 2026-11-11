-- 0049_rollback.sql — desfaz 0049. Apaga pedidos de orcamento ja gravados.
drop view if exists item_stock_cd_public;
drop table if exists quote_requests;
