-- Preflight 0007 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.catalog_items') is null then
    raise exception 'preflight 0007: public.catalog_items ausente (0001 nao aplicada)';
  end if;
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0007: public.orders ausente (0003 nao aplicada)';
  end if;
  if to_regclass('public.order_items') is null then
    raise exception 'preflight 0007: public.order_items ausente (0006 nao aplicada)';
  end if;
  if to_regclass('public.item_stock') is not null then
    raise exception 'preflight 0007: public.item_stock ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.stock_movements') is not null then
    raise exception 'preflight 0007: public.stock_movements ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.item_stock_public') is not null then
    raise exception 'preflight 0007: public.item_stock_public ja existe (migracao ja aplicada?)';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgname = 'trg_orders_transition'
      and tgrelid = 'public.orders'::regclass
  ) then
    raise exception 'preflight 0007: trigger trg_orders_transition ja existe';
  end if;
end $$;
