-- Teste estrutural 0011 - roda dentro de begin;...rollback;
-- Cobre: nfe_emissoes (estrutura, checks de tipo/status, obrigatoriedade de
-- vinculo com pedido de venda ou compra, sequencia unica tenant+serie+numero),
-- RLS deny-all de escrita (anon/authenticated) e leitura restrita a gestao
-- ativo (master|gerente).
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas e finish() emite so notices — entao cada assert e gravado em
-- temp table e o gate final e (asserts, falhas).
begin;
select plan(31);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;

insert into _out select has_table('nfe_emissoes');
insert into _out select has_column('nfe_emissoes', 'tenant_id');
insert into _out select has_column('nfe_emissoes', 'tipo');
insert into _out select has_column('nfe_emissoes', 'order_id');
insert into _out select has_column('nfe_emissoes', 'purchase_order_id');
insert into _out select has_column('nfe_emissoes', 'numero');
insert into _out select has_column('nfe_emissoes', 'serie');
insert into _out select has_column('nfe_emissoes', 'natureza_operacao');
insert into _out select has_column('nfe_emissoes', 'cfop');
insert into _out select has_column('nfe_emissoes', 'destinatario');
insert into _out select has_column('nfe_emissoes', 'frete');
insert into _out select has_column('nfe_emissoes', 'itens');
insert into _out select has_column('nfe_emissoes', 'totais');
insert into _out select has_column('nfe_emissoes', 'dados_adicionais');
insert into _out select has_column('nfe_emissoes', 'status');
insert into _out select has_column('nfe_emissoes', 'cancelada_em');
insert into _out select has_column('nfe_emissoes', 'created_by');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'nfe_emissoes'::regclass
        and conname = 'nfe_emissoes_tipo_check'
        and pg_get_constraintdef(oid) like '%saida%'
        and pg_get_constraintdef(oid) like '%entrada%'),
    1::bigint, 'tipo aceita saida e entrada');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'nfe_emissoes'::regclass
        and conname = 'nfe_emissoes_status_check'
        and pg_get_constraintdef(oid) like '%emitida%'
        and pg_get_constraintdef(oid) like '%cancelada%'),
    1::bigint, 'status aceita emitida e cancelada');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'nfe_emissoes'::regclass
        and contype = 'c'
        and upper(pg_get_constraintdef(oid)) like '%ORDER_ID IS NOT NULL%'
        and upper(pg_get_constraintdef(oid)) like '%PURCHASE_ORDER_ID IS NOT NULL%'),
    1::bigint, 'documento exige vinculo com pedido de venda ou compra');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'nfe_emissoes'::regclass
        and conname = 'nfe_emissoes_tenant_id_serie_numero_key'
        and contype = 'u'),
    1::bigint, 'sequencia tenant + serie + numero e unica');
insert into _out select policies_are('nfe_emissoes',
  array['leitura nfe (gestao)']);
insert into _out
  select ok(
    (select relrowsecurity from pg_class
      where oid = 'nfe_emissoes'::regclass),
    'RLS ativo em nfe_emissoes');

-- seed ---------------------------------------------------------------------
insert into customers (id, tenant_id, name, email)
values ('cccccccc-0000-4000-8000-000000000003',
        '00000000-0000-0000-0000-000000000001',
        'Cliente NFe', 'nfe-teste@exemplo.com');

insert into orders (id, tenant_id, customer_id, total_amount)
values ('cccccccc-0000-4000-8000-000000000004',
        '00000000-0000-0000-0000-000000000001',
        'cccccccc-0000-4000-8000-000000000003', 150.00);

insert into nfe_emissoes
  (tenant_id, tipo, order_id, numero, serie, natureza_operacao, cfop,
   destinatario, itens, totais)
values
  ('00000000-0000-0000-0000-000000000001', 'saida',
   'cccccccc-0000-4000-8000-000000000004', 1, 1, 'Venda de mercadoria',
   '5102', '{"nome":"Cliente NFe"}'::jsonb, '[]'::jsonb, '{"total":150}'::jsonb);

insert into _out
  select is((select count(*) from nfe_emissoes), 1::bigint,
            'emissao de saida gravada');

insert into _out
  select throws_ok(
    $q$insert into nfe_emissoes (tenant_id, tipo, order_id, numero, serie)
       values ('00000000-0000-0000-0000-000000000001', 'saida',
               'cccccccc-0000-4000-8000-000000000004', 1, 1)$q$,
    '23505', null, 'numero duplicado na mesma serie e bloqueado');

insert into _out
  select throws_ok(
    $q$insert into nfe_emissoes (tenant_id, tipo, order_id, numero, serie)
       values ('00000000-0000-0000-0000-000000000001', 'troca',
               'cccccccc-0000-4000-8000-000000000004', 2, 1)$q$,
    '23514', null, 'tipo fora de saida/entrada e bloqueado');

insert into _out
  select throws_ok(
    $q$insert into nfe_emissoes (tenant_id, tipo, numero, serie)
       values ('00000000-0000-0000-0000-000000000001', 'saida', 3, 1)$q$,
    '23514', null, 'documento sem pedido de venda/compra e bloqueado');

-- deny-all de escrita --------------------------------------------------------
set local role anon;
insert into _out
  select throws_ok(
    $q$insert into nfe_emissoes (tenant_id, tipo, order_id, numero, serie)
       values ('00000000-0000-0000-0000-000000000001', 'saida',
               'cccccccc-0000-4000-8000-000000000004', 90, 1)$q$,
    '42501', null, 'anon nao escreve em nfe_emissoes'
  );
reset role;

set local role authenticated;
insert into _out
  select throws_ok(
    $q$insert into nfe_emissoes (tenant_id, tipo, order_id, numero, serie)
       values ('00000000-0000-0000-0000-000000000001', 'saida',
               'cccccccc-0000-4000-8000-000000000004', 91, 1)$q$,
    '42501', null, 'authenticated nao escreve em nfe_emissoes'
  );
insert into _out
  select is(
    (select count(*) from nfe_emissoes), 0::bigint,
    'authenticated sem papel nao le as notas'
  );
reset role;

-- leitura de gestao (seed de usuario + perfil) --------------------------------
insert into auth.users (id, email)
values ('30000000-0000-4000-8000-000000000011',
        'gestao-nfe-teste@e2e.local');
insert into profiles (id, tenant_id, email, full_name, role, status)
values ('30000000-0000-4000-8000-000000000011',
        '00000000-0000-0000-0000-000000000001',
        'gestao-nfe-teste@e2e.local', 'Gestor Teste NFe', 'master',
        'ativo');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000011","role":"authenticated"}',
  true);
insert into _out
  select is(
    (select count(*) from nfe_emissoes), 1::bigint,
    'gestao ativo le as notas emitidas'
  );
select set_config('request.jwt.claims', '', true);
reset role;

-- gate: total de asserts e falhas (o helper mostra o ultimo com linhas) ------
select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
  from _out;
select line from _out where line like 'not ok%';
rollback;
