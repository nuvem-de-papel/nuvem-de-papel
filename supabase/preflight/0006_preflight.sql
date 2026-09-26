-- Preflight 0006 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0006: public.orders ausente (0003 nao aplicada)';
  end if;
  if to_regclass('public.catalog_items') is null then
    raise exception 'preflight 0006: public.catalog_items ausente (0001 nao aplicada)';
  end if;
  if to_regclass('public.order_items') is not null then
    raise exception 'preflight 0006: public.order_items ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'preflight 0006: schema auth ausente';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'user_id'
  ) then
    raise exception 'preflight 0006: orders.user_id ja existe (migracao ja aplicada?)';
  end if;
end $$;
