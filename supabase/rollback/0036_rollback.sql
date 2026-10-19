-- 0036_rollback.sql - desfaz a recuperação de carrinho abandonado.
--
-- ATENCAO: remove as tabelas cart_recovery_rules e cart_recovery_sends e a
-- coluna orders.mp_init_point. NÃO mexe em orders (só some a coluna de link).
-- Os e-mails já enviados permanecem em email_messages.

drop table if exists cart_recovery_sends;
drop table if exists cart_recovery_rules;
alter table orders drop column if exists mp_init_point;
