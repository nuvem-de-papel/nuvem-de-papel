-- Preflight 0021 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.tenants') is null then
    raise exception 'preflight 0021: public.tenants ausente (0001 nao aplicada)';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'preflight 0021: public.profiles ausente (as policies da 0021 leem profiles)';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public'
                   and table_name = 'profiles'
                   and column_name = 'role') then
    raise exception 'preflight 0021: profiles.role ausente';
  end if;
  -- A 0021 cria o plano; se ja existe, o ciclo ja rodou.
  if to_regclass('public.account_catalog') is not null then
    raise exception 'preflight 0021: public.account_catalog ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.journal_entries') is not null then
    raise exception 'preflight 0021: public.journal_entries ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.journal_entry_lines') is not null then
    raise exception 'preflight 0021: public.journal_entry_lines ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.tenant_accounts') is not null then
    raise exception 'preflight 0021: public.tenant_accounts ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.cost_centers') is not null then
    raise exception 'preflight 0021: public.cost_centers ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.expenses') is not null then
    raise exception 'preflight 0021: public.expenses ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.v_dre') is not null then
    raise exception 'preflight 0021: public.v_dre ja existe (migracao ja aplicada?)';
  end if;
end $$;
