-- Teste da migration 0020 - roda dentro de begin;...rollback;
-- Cobre: RLS em public.tenants (a unica das 43 tabelas que faltava em
-- producao), deny-all (zero policies = anon/authenticated nao veem linha
-- alguma) e a invariante global de que nenhuma tabela de public fica sem RLS.
-- Nao da para `set role anon` dentro do teste: o temp table _out nao e
-- legivel pelo papel anon (permission denied for table _out) - e por isso o
-- deny-all e provado pelos metadados (RLS on + 0 policies), que e exatamente
-- o que define a visibilidade.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(4);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;

-- tabela base do multitenancy existe ---------------------------------------
insert into _out
  select ok(to_regclass('public.tenants') is not null, 'tenants existe');

-- RLS habilitada (o que a 0020 liga) ---------------------------------------
insert into _out
  select ok((select c.relrowsecurity
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'tenants'),
            'RLS habilitada em public.tenants');

-- deny-all: RLS on + zero policies = nenhuma linha visivel a papel publico --
insert into _out
  select is((select count(*)
               from pg_policies
              where schemaname = 'public' and tablename = 'tenants'),
            0::bigint,
            'zero policies em public.tenants (deny-all)');

-- invariante global: nenhuma tabela de public sem RLS -----------------------
-- (producao tinha exatamente 1: `tenants`; staging tinha 0)
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind in ('r', 'p')
                and not c.relrowsecurity),
            0::bigint,
            'nenhuma tabela de public sem RLS');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
from _out;
rollback;
