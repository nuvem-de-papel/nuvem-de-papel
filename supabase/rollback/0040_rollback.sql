-- 0040_rollback.sql - desfaz a venda manual (telefone/balcao).
-- Remove a funcao e devolve os checks ao estado anterior ('manual'/'fiado'
-- removidos). Vendas manuais ja criadas ficam com origem/forma invalidos
-- para os checks NOVOS - o rollback e para teste/staging; em producao com
-- dados reais, corrigir antes (update orders set origem='erp' ...).

drop function if exists public.manual_register_sale(jsonb, text, sales_channel, integer, numeric, uuid, jsonb, jsonb, text);
drop function if exists public.manual_register_sale(jsonb, text, sales_channel, integer, uuid, jsonb, jsonb, text);

alter table orders drop constraint if exists orders_origem_check;
alter table orders add constraint orders_origem_check
  check (origem in ('erp', 'pdv', 'loja'));

alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('pix', 'cartao', 'boleto', 'dinheiro', 'debito'));

alter table orders drop constraint if exists orders_condicao_check;
alter table orders add constraint orders_condicao_check
  check (condicao in ('À vista', '30 dias', '30/60', '30/60/90'));

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'financial_titles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%source_type%'
  loop
    execute format('alter table financial_titles drop constraint %I', c.conname);
  end loop;
end $$;

alter table financial_titles
  add constraint financial_titles_source_type_check
  check (source_type in ('pdv', 'web', 'purchase_receipt'));
