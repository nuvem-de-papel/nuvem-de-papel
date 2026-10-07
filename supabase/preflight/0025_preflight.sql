-- Preflight 0025 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0025: public.orders ausente';
  end if;
  if to_regclass('public.financial_titles') is null then
    raise exception 'preflight 0025: public.financial_titles ausente';
  end if;
  if to_regclass('public.financial_installments') is null then
    raise exception 'preflight 0025: public.financial_installments ausente';
  end if;
  if to_regclass('public.customers') is null then
    raise exception 'preflight 0025: public.customers ausente';
  end if;
  if exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.orders'::regclass
       and tgname = 'trg_orders_titulo_web'
  ) then
    raise exception 'preflight 0025: trg_orders_titulo_web ja existe (migracao ja aplicada?)';
  end if;
  if exists (
    select 1
      from pg_proc
     where proname = 'garantir_titulo_web'
  ) then
    raise exception 'preflight 0025: garantir_titulo_web ja existe (migracao ja aplicada?)';
  end if;
end $$;
