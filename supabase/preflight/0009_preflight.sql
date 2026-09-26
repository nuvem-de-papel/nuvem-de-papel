-- Preflight 0009 - confirma pre-requisitos antes de aplicar.
do $$
declare
  v_dups bigint;
begin
  if to_regclass('public.financial_titles') is null then
    raise exception 'preflight 0009: public.financial_titles ausente (0008 nao aplicada)';
  end if;
  if to_regclass('public.item_prices') is null then
    raise exception 'preflight 0009: public.item_prices ausente (0001 nao aplicada)';
  end if;
  if to_regclass('public.suppliers') is not null then
    raise exception 'preflight 0009: public.suppliers ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.purchase_orders') is not null then
    raise exception 'preflight 0009: public.purchase_orders ja existe (migracao ja aplicada?)';
  end if;
  if to_regprocedure('public.resolve_price(uuid,sales_channel,integer)') is not null then
    raise exception 'preflight 0009: resolve_price ja existe (migracao ja aplicada?)';
  end if;
  if to_regprocedure('public.purchase_receive(uuid,jsonb,text,text,uuid)') is not null then
    raise exception 'preflight 0009: purchase_receive ja existe (migracao ja aplicada?)';
  end if;
  -- PK nova (item_id, channel, min_quantity, valid_from) exige linhas unicas
  select count(*) into v_dups from (
    select 1 from item_prices
     group by item_id, channel, min_quantity
    having count(*) > 1
  ) d;
  if v_dups > 0 then
    raise exception 'preflight 0009: % linha(s) de item_prices duplicadas por (item, canal, faixa)', v_dups;
  end if;
end $$;
