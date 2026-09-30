-- Rollback 0012 (destrutivo - laboratorio). Desfaz o Clube:
-- remove as assinaturas, os planos e a coluna de desconto dos pedidos.
begin;
drop table if exists club_subscriptions;
drop table if exists club_plans;
alter table orders drop constraint if exists orders_discount_amount_check;
alter table orders drop column if exists discount_amount;
commit;
