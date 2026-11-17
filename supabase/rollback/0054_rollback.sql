-- 0054_rollback.sql - remove o cancelamento de venda.
-- Os estornos, parcelas canceladas, devolucoes de estoque e lancamentos ja
-- gravados por sale_cancel FICAM (diario e liquidacoes sao imutaveis); so
-- somem a funcao e as duas colunas novas (o motivo/autor de quem cancelou
-- continua no audit_log 'venda.cancelar').
begin;
drop function if exists sale_cancel(uuid, text, uuid);
alter table orders drop constraint if exists orders_cancelado_motivo_check;
alter table orders drop column if exists cancelado_por;
alter table orders drop column if exists cancelado_motivo;
commit;
