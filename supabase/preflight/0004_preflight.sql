-- Preflight 0004 - confirma pre-requisitos antes de aplicar.
-- Usa DO + raise (o idiom "case ... else 1/0" quebra no PG17: o planner
-- const-folda o 1/0 da branch nao escolhida e aborta antes de rodar).
do $$
begin
  if to_regnamespace('auth') is null then
    raise exception 'preflight 0004: schema auth ausente (Supabase Auth nao ativo)';
  end if;
  if to_regclass('public.profiles') is not null then
    raise exception 'preflight 0004: public.profiles ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.tenants') is null then
    raise exception 'preflight 0004: public.tenants ausente (0001 nao aplicada)';
  end if;
end $$;
