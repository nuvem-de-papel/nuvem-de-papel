-- Preflight 0015 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0015: public.orders ausente (0003 nao aplicada)';
  end if;
  if to_regclass('public.caixa_sessions') is null then
    raise exception 'preflight 0015: public.caixa_sessions ausente (0008 nao aplicada)';
  end if;
  if to_regprocedure('public.pdv_register_sale(jsonb,text,sales_channel,integer,uuid,text)') is null then
    raise exception 'preflight 0015: pdv_register_sale (assinatura 6 args da 0009) ausente';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'orders'
               and column_name = 'origem') then
    raise exception 'preflight 0015: orders.origem ja existe (migracao ja aplicada?)';
  end if;
  if exists (select 1 from pg_proc
             where proname = 'pdv_register_sale'
               and pronargs = 7) then
    raise exception 'preflight 0015: pdv_register_sale com 7 args ja existe (migracao ja aplicada?)';
  end if;
  if not exists (select 1 from tenants where id = '00000000-0000-0000-0000-000000000001') then
    raise exception 'preflight 0015: tenant padrao 00000000-0000-0000-0000-000000000001 ausente';
  end if;
end $$;
