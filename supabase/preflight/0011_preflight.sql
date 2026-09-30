-- Preflight 0011 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0011: public.orders ausente (0003 nao aplicada)';
  end if;
  if to_regclass('public.purchase_orders') is null then
    raise exception 'preflight 0011: public.purchase_orders ausente (0009 nao aplicada)';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'preflight 0011: public.profiles ausente (0004 nao aplicada)';
  end if;
  if to_regclass('public.tenants') is null then
    raise exception 'preflight 0011: public.tenants ausente (0001 nao aplicada)';
  end if;
  if to_regclass('public.nfe_emissoes') is not null then
    raise exception 'preflight 0011: public.nfe_emissoes ja existe (migracao ja aplicada?)';
  end if;
end $$;
