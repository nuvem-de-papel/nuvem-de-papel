-- Teste estrutural 0012 - roda dentro de begin;...rollback;
-- Cobre: club_plans (estrutura, checks, seed dos 3 planos da marca),
-- club_subscriptions (checks de status, indice unico de assinatura ativa,
-- FKs), orders.discount_amount, RLS: planos publicos (anon le), escrita
-- deny-all (anon/authenticated), assinatura privada (anon nao le nada; o
-- dono ou a gestao ativa le; operador nao le nada).
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas e finish() emite so notices - entao cada assert e gravado em
-- temp table e o gate final e (asserts, falhas).
begin;
select plan(49);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;

-- club_plans ---------------------------------------------------------------
insert into _out select has_table('club_plans');
insert into _out select has_column('club_plans', 'tenant_id');
insert into _out select has_column('club_plans', 'code');
insert into _out select has_column('club_plans', 'name');
insert into _out select has_column('club_plans', 'description');
insert into _out select has_column('club_plans', 'price_monthly');
insert into _out select has_column('club_plans', 'discount_pct');
insert into _out select has_column('club_plans', 'free_shipping');
insert into _out select has_column('club_plans', 'gift');
insert into _out select has_column('club_plans', 'mp_plan_id');
insert into _out select has_column('club_plans', 'active');
insert into _out select has_column('club_plans', 'sort');
insert into _out select has_column('club_plans', 'created_at');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'club_plans'::regclass
        and conname = 'club_plans_tenant_id_code_key'
        and contype = 'u'),
    1::bigint, 'code e unico por tenant');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'club_plans'::regclass
        and conname = 'club_plans_code_check'
        and pg_get_constraintdef(oid) like '%a-z0-9%'),
    1::bigint, 'code tem formato de slug');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'club_plans'::regclass
        and conname = 'club_plans_price_monthly_check'
        and upper(pg_get_constraintdef(oid)) like '%PRICE_MONTHLY > (0)%'),
    1::bigint, 'preco mensal precisa ser positivo');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'club_plans'::regclass
        and conname = 'club_plans_discount_pct_check'
        and pg_get_constraintdef(oid) like '%100%'),
    1::bigint, 'desconto entre 0 e 100%');
insert into _out
  select ok(
    (select relrowsecurity from pg_class
      where oid = 'club_plans'::regclass),
    'RLS ativo em club_plans');
insert into _out select policies_are('club_plans',
  array['leitura club_plans (publica)']);

-- club_subscriptions -------------------------------------------------------
insert into _out select has_table('club_subscriptions');
insert into _out select has_column('club_subscriptions', 'tenant_id');
insert into _out select has_column('club_subscriptions', 'profile_id');
insert into _out select has_column('club_subscriptions', 'plan_id');
insert into _out select has_column('club_subscriptions', 'status');
insert into _out select has_column('club_subscriptions', 'mp_preapproval_id');
insert into _out select has_column('club_subscriptions', 'current_period_start');
insert into _out select has_column('club_subscriptions', 'current_period_end');
insert into _out select has_column('club_subscriptions', 'cancel_at_period_end');
insert into _out select has_column('club_subscriptions', 'created_at');
insert into _out select has_column('club_subscriptions', 'updated_at');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'club_subscriptions'::regclass
        and conname = 'club_subscriptions_status_check'
        and pg_get_constraintdef(oid) like '%ativa%'
        and pg_get_constraintdef(oid) like '%cancelada%'
        and pg_get_constraintdef(oid) like '%pendente%'
        and pg_get_constraintdef(oid) like '%pausada%'),
    1::bigint, 'status aceita pendente/ativa/cancelada/pausada');
insert into _out
  select is(
    (select count(*) from pg_indexes
      where tablename = 'club_subscriptions'
        and indexname = 'uq_club_subscriptions_ativa'),
    1::bigint, 'indice unico de assinatura pendente/ativa existe');
insert into _out
  select ok(
    (select relrowsecurity from pg_class
      where oid = 'club_subscriptions'::regclass),
    'RLS ativo em club_subscriptions');
insert into _out select policies_are('club_subscriptions',
  array['leitura assinatura (propria ou gestao)']);

-- orders -------------------------------------------------------------------
insert into _out select has_column('orders', 'discount_amount');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'orders'::regclass
        and conname = 'orders_discount_amount_check'
        and upper(pg_get_constraintdef(oid)) like '%DISCOUNT_AMOUNT >= (0)%'),
    1::bigint, 'desconto do pedido nao pode ser negativo');

-- seed ---------------------------------------------------------------------
insert into _out
  select is((select count(*) from club_plans where active), 3::bigint,
            'seed com os 3 planos ativos');

-- seed de usuario (dono da assinatura) -------------------------------------
insert into auth.users (id, email)
values ('40000000-0000-4000-8000-000000000001',
        'clube-dono-teste@e2e.local');
insert into profiles (id, tenant_id, email, full_name, role, status)
values ('40000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        'clube-dono-teste@e2e.local', 'Dono Teste Clube', 'master',
        'ativo');

-- checks de dados ----------------------------------------------------------
insert into _out
  select throws_ok(
    $q$insert into club_plans (tenant_id, code, name, price_monthly)
       values ('00000000-0000-0000-0000-000000000001', 'grátis', 'Plano', 0)$q$,
    '23514', null, 'preco zero/negativo ou code invalido e bloqueado');
insert into _out
  select throws_ok(
    $q$insert into club_plans (tenant_id, code, name, price_monthly, discount_pct)
       values ('00000000-0000-0000-0000-000000000001', 'top', 'Plano', 10, 101)$q$,
    '23514', null, 'desconto acima de 100% e bloqueado');
insert into _out
  select throws_ok(
    $q$insert into club_subscriptions (tenant_id, profile_id, plan_id, status)
       values ('00000000-0000-0000-0000-000000000001',
               '40000000-0000-4000-8000-000000000001',
               'eeeeeeee-0000-4000-8000-000000000001', 'expirada')$q$,
    '23514', null, 'status fora da lista e bloqueado');
insert into _out
  select throws_ok(
    $q$insert into club_subscriptions (tenant_id, profile_id, plan_id)
       values ('00000000-0000-0000-0000-000000000001',
               '99999999-0000-4000-8000-000000000009',
               'eeeeeeee-0000-4000-8000-000000000001')$q$,
    '23503', null, 'assinante inexistente e bloqueado');

insert into club_subscriptions
  (tenant_id, profile_id, plan_id, status, current_period_start, current_period_end)
values ('00000000-0000-0000-0000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        'eeeeeeee-0000-4000-8000-000000000001', 'ativa', now(), now() + interval '30 days');

insert into _out
  select throws_ok(
    $q$insert into club_subscriptions (tenant_id, profile_id, plan_id, status)
       values ('00000000-0000-0000-0000-000000000001',
               '40000000-0000-4000-8000-000000000001',
               'eeeeeeee-0000-4000-8000-000000000002', 'ativa')$q$,
    '23505', null, 'duas assinaturas ativas para o mesmo usuario sao bloqueadas');

-- deny-all de escrita --------------------------------------------------------
set local role anon;
insert into _out
  select throws_ok(
    $q$insert into club_subscriptions (tenant_id, profile_id, plan_id, status)
       values ('00000000-0000-0000-0000-000000000001',
               '40000000-0000-4000-8000-000000000001',
               'eeeeeeee-0000-4000-8000-000000000001', 'ativa')$q$,
    '42501', null, 'anon nao escreve em club_subscriptions'
  );
insert into _out
  select is((select count(*) from club_subscriptions), 0::bigint,
            'anon nao le assinaturas (dado privado)');
insert into _out
  select is((select count(*) from club_plans), 3::bigint,
            'anon le os planos publicos');
reset role;

set local role authenticated;
insert into _out
  select throws_ok(
    $q$insert into club_subscriptions (tenant_id, profile_id, plan_id, status)
       values ('00000000-0000-0000-0000-000000000001',
               '40000000-0000-4000-8000-000000000001',
               'eeeeeeee-0000-4000-8000-000000000001', 'ativa')$q$,
    '42501', null, 'authenticated nao escreve em club_subscriptions');
insert into _out
  select throws_ok(
    $q$insert into club_plans (tenant_id, code, name, price_monthly)
       values ('00000000-0000-0000-0000-000000000001', 'hacker', 'Plano', 1)$q$,
    '42501', null, 'authenticated nao escreve em club_plans');
reset role;

-- leitura: dono (gestao master) e operador -----------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true);
insert into _out
  select is(
    (select count(*) from club_subscriptions), 1::bigint,
    'gestao/dono le a propria assinatura'
  );
select set_config('request.jwt.claims', '', true);
reset role;

insert into auth.users (id, email)
values ('40000000-0000-4000-8000-000000000002',
        'clube-operador-teste@e2e.local');
insert into profiles (id, tenant_id, email, full_name, role, status)
values ('40000000-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        'clube-operador-teste@e2e.local', 'Operador Teste Clube', 'operador',
        'ativo');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true);
insert into _out
  select is(
    (select count(*) from club_subscriptions), 0::bigint,
    'operador nao le assinaturas de terceiros'
  );
select set_config('request.jwt.claims', '', true);
reset role;

-- gate: total de asserts e falhas (o helper mostra o ultimo com linhas) ------
select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
  from _out;
select line from _out where line like 'not ok%';
rollback;
