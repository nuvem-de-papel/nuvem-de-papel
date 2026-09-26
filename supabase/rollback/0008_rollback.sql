-- Rollback 0008 — remove PDV e financeiro. DESTRUTIVO: descarta sessões,
-- movimentos de caixa e títulos/parcelas/liquidações (somente laboratório).
drop function if exists financial_settle(uuid, numeric, text, text, text);
drop function if exists pdv_register_sale(jsonb, text, sales_channel, integer, uuid, text);
drop function if exists pdv_cash_supply(text, numeric, text, text);
drop function if exists pdv_close_cash(numeric);
drop function if exists pdv_open_cash(numeric, uuid, text);

drop trigger if exists trg_financial_settlements_immutable on financial_settlements;
drop function if exists financial_settlements_immutable();
drop policy if exists "le liquidacoes (gestao)" on financial_settlements;
drop policy if exists "le parcelas (gestao)" on financial_installments;
drop policy if exists "le titulos (gestao)" on financial_titles;
drop table if exists financial_settlements;
drop table if exists financial_installments;
drop table if exists financial_titles;

drop trigger if exists trg_caixa_movements_immutable on caixa_movements;
drop function if exists caixa_movements_immutable();
drop policy if exists "le movimentos de caixa (operacional)" on caixa_movements;
drop policy if exists "le sessoes de caixa (operacional)" on caixa_sessions;
drop table if exists caixa_movements;
drop table if exists caixa_sessions;

drop index if exists orders_tenant_idempotency;
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('pix', 'cartao', 'boleto'));
