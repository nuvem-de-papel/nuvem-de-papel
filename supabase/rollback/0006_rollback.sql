-- Rollback 0006 - remove a base do checkout.
-- ATENÇÃO: só restaura o check antigo de status se nenhum pedido novo existir
-- (não há como apagar histórico de pedidos por rollback).
drop policy if exists "le proprios pedidos" on orders;
drop policy if exists "itens do proprio pedido" on order_items;
drop policy if exists "le proprios enderecos" on addresses;
drop policy if exists "insere proprio endereco" on addresses;
drop policy if exists "atualiza proprio endereco" on addresses;
drop policy if exists "apaga proprio endereco" on addresses;

drop table if exists webhook_events;
drop table if exists addresses;
drop table if exists order_items;

drop index if exists idx_orders_user;
alter table orders drop column if exists mp_payment_id;
alter table orders drop column if exists mp_preference_id;
alter table orders drop column if exists payment_method;
alter table orders drop column if exists address_snapshot;
alter table orders drop column if exists user_id;

alter table orders drop constraint if exists orders_status_check;
do $$
begin
  if exists (
    select 1 from orders
    where status not in ('processando','em_rota','entregue','cancelado')
  ) then
    raise exception 'rollback 0006: existem pedidos com status da F3; mapear manualmente antes de restaurar o check antigo';
  end if;
  alter table orders add constraint orders_status_check
    check (status in ('processando','em_rota','entregue','cancelado'));
end $$;
