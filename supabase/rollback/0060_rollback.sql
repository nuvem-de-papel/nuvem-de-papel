-- 0060 - rollback. So roda se NENHUM pedido corporativo foi gravado (titulo
-- 'corporativo' e condicao 'N dias' quebrariam os checks antigos).
begin;
do $$ begin
  if exists (select 1 from public.financial_titles where source_type = 'corporativo') then
    raise exception 'ROLLBACK_BLOQUEADO: existem titulos corporativos';
  end if;
end $$;
drop function if exists public.corporate_place_order(uuid, jsonb, jsonb, text, text);
drop function if exists public.corporate_credit(uuid);
alter table public.financial_titles drop constraint if exists financial_titles_source_type_check;
alter table public.financial_titles add constraint financial_titles_source_type_check
  check (source_type in ('pdv', 'web', 'purchase_receipt', 'manual'));
alter table public.orders drop constraint if exists orders_condicao_check;
alter table public.orders add constraint orders_condicao_check
  check (condicao in ('À vista', '30 dias', '30/60', '30/60/90') or condicao ~ '^[0-9]{1,2}x$');
commit;
