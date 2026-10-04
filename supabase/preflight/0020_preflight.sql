-- Preflight 0020 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.tenants') is null then
    raise exception 'preflight 0020: public.tenants ausente (0001 nao aplicada)';
  end if;
  -- A 0020 pressupoe deny-all: se ja existe policy em `tenants`, o racional
  -- do comentario da migration nao vale mais e um novo teste e necessario.
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'tenants') then
    raise exception 'preflight 0020: ja existe policy em public.tenants - a 0020 pressupoe deny-all; revise antes de aplicar';
  end if;
  -- A invariante global so faz sentido se a tabela base existe com RLS
  -- possivel de ligar (dono = postgres).
  if not exists (select 1 from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'tenants'
                    and c.relkind in ('r', 'p')) then
    raise exception 'preflight 0020: public.tenants nao e tabela normal/particionada';
  end if;
end $$;
