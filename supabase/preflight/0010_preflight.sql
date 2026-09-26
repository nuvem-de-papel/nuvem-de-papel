-- Preflight 0010 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.webhook_events') is null then
    raise exception 'preflight 0010: public.webhook_events ausente (0006 nao aplicada)';
  end if;
  if to_regclass('public.audit_log') is null then
    raise exception 'preflight 0010: public.audit_log ausente (0005 nao aplicada)';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'preflight 0010: public.profiles ausente (0004 nao aplicada)';
  end if;
  if to_regclass('public.email_messages') is not null then
    raise exception 'preflight 0010: public.email_messages ja existe (migracao ja aplicada?)';
  end if;
  if to_regnamespace('storage') is null then
    raise exception 'preflight 0010: schema storage ausente (instancia Supabase invalida)';
  end if;
end $$;
