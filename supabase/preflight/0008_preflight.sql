-- Preflight 0008 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0008: public.orders ausente (0003 nao aplicada)';
  end if;
  if to_regclass('public.item_stock') is null then
    raise exception 'preflight 0008: public.item_stock ausente (0007 nao aplicada)';
  end if;
  if to_regclass('public.caixa_sessions') is not null then
    raise exception 'preflight 0008: public.caixa_sessions ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.caixa_movements') is not null then
    raise exception 'preflight 0008: public.caixa_movements ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.financial_titles') is not null then
    raise exception 'preflight 0008: public.financial_titles ja existe (migracao ja aplicada?)';
  end if;
  if to_regprocedure('public.pdv_register_sale(jsonb,text,sales_channel,integer,uuid,text)') is not null then
    raise exception 'preflight 0008: pdv_register_sale ja existe (migracao ja aplicada?)';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'idempotency_key'
  ) then
    raise exception 'preflight 0008: orders.idempotency_key ja existe (migracao ja aplicada?)';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgname = 'trg_caixa_movements_immutable'
  ) then
    raise exception 'preflight 0008: trigger trg_caixa_movements_immutable ja existe';
  end if;
end $$;
