-- Preflight 0016 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.customers') is null then
    raise exception 'preflight 0016: public.customers ausente (0003 nao aplicada)';
  end if;
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0016: public.orders ausente (0003 nao aplicada)';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public'
                   and table_name = 'orders'
                   and column_name = 'etapa') then
    raise exception 'preflight 0016: orders.etapa ausente (0015 nao aplicada)';
  end if;
  if to_regclass('public.entregas') is not null then
    raise exception 'preflight 0016: public.entregas ja existe (migracao ja aplicada?)';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'customers'
               and column_name = 'documento') then
    raise exception 'preflight 0016: customers.documento ja existe (migracao ja aplicada?)';
  end if;
  if not exists (select 1 from tenants where id = '00000000-0000-0000-0000-000000000001') then
    raise exception 'preflight 0016: tenant padrao 00000000-0000-0000-0000-000000000001 ausente';
  end if;
end $$;
