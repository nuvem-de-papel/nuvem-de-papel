-- Preflight 0013 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.tenants') is null then
    raise exception 'preflight 0013: public.tenants ausente (0001 nao aplicada)';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'preflight 0013: public.profiles ausente (0004 nao aplicada)';
  end if;
  if to_regclass('public.item_fiscal_data') is null then
    raise exception 'preflight 0013: public.item_fiscal_data ausente (0001 nao aplicada)';
  end if;
  if to_regclass('public.tenant_company') is not null then
    raise exception 'preflight 0013: public.tenant_company ja existe (migracao ja aplicada?)';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'item_fiscal_data'
               and column_name = 'gtin') then
    raise exception 'preflight 0013: item_fiscal_data.gtin ja existe (migracao ja aplicada?)';
  end if;
  if exists (select 1 from pg_proc where proname = 'ean_dv_valido') then
    raise exception 'preflight 0013: funcao ean_dv_valido ja existe (migracao ja aplicada?)';
  end if;
  if not exists (select 1 from tenants where id = '00000000-0000-0000-0000-000000000001') then
    raise exception 'preflight 0013: tenant padrao 00000000-0000-0000-0000-000000000001 ausente';
  end if;
end $$;
