-- Preflight 0024 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0024: public.orders ausente';
  end if;
  if to_regclass('public.tenants') is null then
    raise exception 'preflight 0024: public.tenants ausente';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'preflight 0024: public.profiles ausente (RLS de sellers precisa dela)';
  end if;
  -- ja aplicada?
  if to_regclass('public.sellers') is not null then
    raise exception 'preflight 0024: public.sellers ja existe (migracao ja aplicada?)';
  end if;
end $$;
