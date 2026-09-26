-- Preflight 0005 - confirma pre-requisitos antes de aplicar.
-- Usa DO + raise (o idiom "case ... else 1/0" quebra no PG17: o planner
-- const-folda o 1/0 da branch nao escolhida e aborta antes de rodar).
do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'preflight 0005: public.profiles ausente (0004 nao aplicada)';
  end if;
  if to_regclass('public.audit_log') is not null then
    raise exception 'preflight 0005: public.audit_log ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.tenants') is null then
    raise exception 'preflight 0005: public.tenants ausente (0001 nao aplicada)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'status'
  ) then
    raise notice 'preflight 0005: profiles.status sera adicionada pela migracao';
  end if;
end $$;
