-- Preflight 0012 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.tenants') is null then
    raise exception 'preflight 0012: public.tenants ausente (0001 nao aplicada)';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'preflight 0012: public.profiles ausente (0004 nao aplicada)';
  end if;
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0012: public.orders ausente (0003/0006 nao aplicada)';
  end if;
  if to_regclass('public.club_plans') is not null then
    raise exception 'preflight 0012: public.club_plans ja existe (migracao ja aplicada?)';
  end if;
  if not exists (select 1 from tenants where id = '00000000-0000-0000-0000-000000000001') then
    raise exception 'preflight 0012: tenant padrao 00000000-0000-0000-0000-000000000001 ausente';
  end if;
end $$;
