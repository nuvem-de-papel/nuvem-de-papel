-- Preflight 0003 - confirma pre-requisitos antes de aplicar.
-- Usa DO + raise (o idiom "case ... else 1/0" quebra no PG17: o planner
-- const-folda o 1/0 da branch nao escolhida e aborta antes de rodar).
do $$
begin
  -- 1) enum sales_channel (criado em 0001) precisa existir.
  if not exists (select 1 from pg_type where typname = 'sales_channel') then
    raise exception 'preflight 0003: enum sales_channel ausente (0001 nao aplicada)';
  end if;

  -- 2) as tabelas novas NAO podem existir ainda (evita rodar 2x por engano).
  if to_regclass('public.customers') is not null then
    raise exception 'preflight 0003: public.customers ja existe';
  end if;
  if to_regclass('public.orders') is not null then
    raise exception 'preflight 0003: public.orders ja existe';
  end if;
  if to_regclass('public.campaigns') is not null then
    raise exception 'preflight 0003: public.campaigns ja existe';
  end if;
end $$;
