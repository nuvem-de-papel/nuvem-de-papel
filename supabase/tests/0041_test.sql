-- 0041_test.sql — pgTAP. Roda em begin;...rollback; (nada aqui persiste).
begin;
select plan(34);

-- === Parte 1: as 6 funcoes sensiveis nao sao mais executaveis por anon/authenticated ===
select ok(not has_function_privilege('anon', 'public.trg_post_order()', 'EXECUTE'),
  'anon NAO executa trg_post_order');
select ok(not has_function_privilege('authenticated', 'public.trg_post_order()', 'EXECUTE'),
  'authenticated NAO executa trg_post_order');

select ok(not has_function_privilege('anon', 'public.trg_post_receipt()', 'EXECUTE'),
  'anon NAO executa trg_post_receipt');
select ok(not has_function_privilege('authenticated', 'public.trg_post_receipt()', 'EXECUTE'),
  'authenticated NAO executa trg_post_receipt');

select ok(not has_function_privilege('anon', 'public.trg_post_settlement()', 'EXECUTE'),
  'anon NAO executa trg_post_settlement');
select ok(not has_function_privilege('authenticated', 'public.trg_post_settlement()', 'EXECUTE'),
  'authenticated NAO executa trg_post_settlement');

select ok(not has_function_privilege('anon', 'public.trg_post_expense()', 'EXECUTE'),
  'anon NAO executa trg_post_expense');
select ok(not has_function_privilege('authenticated', 'public.trg_post_expense()', 'EXECUTE'),
  'authenticated NAO executa trg_post_expense');

select ok(not has_function_privilege('anon', 'public.journal_line_leaf_check()', 'EXECUTE'),
  'anon NAO executa journal_line_leaf_check');
select ok(not has_function_privilege('authenticated', 'public.journal_line_leaf_check()', 'EXECUTE'),
  'authenticated NAO executa journal_line_leaf_check');

select ok(not has_function_privilege('anon', 'public.garantir_titulo_web(uuid,uuid,text,text,numeric,uuid)', 'EXECUTE'),
  'anon NAO executa garantir_titulo_web');
select ok(not has_function_privilege('authenticated', 'public.garantir_titulo_web(uuid,uuid,text,text,numeric,uuid)', 'EXECUTE'),
  'authenticated NAO executa garantir_titulo_web');

-- === Parte 2: service_role continua com acesso (nao quebrou o caminho server-side) ===
select ok(has_function_privilege('service_role', 'public.trg_post_order()', 'EXECUTE'),
  'service_role mantem trg_post_order');
select ok(has_function_privilege('service_role', 'public.trg_post_receipt()', 'EXECUTE'),
  'service_role mantem trg_post_receipt');
select ok(has_function_privilege('service_role', 'public.trg_post_settlement()', 'EXECUTE'),
  'service_role mantem trg_post_settlement');
select ok(has_function_privilege('service_role', 'public.trg_post_expense()', 'EXECUTE'),
  'service_role mantem trg_post_expense');
select ok(has_function_privilege('service_role', 'public.journal_line_leaf_check()', 'EXECUTE'),
  'service_role mantem journal_line_leaf_check');
select ok(has_function_privilege('service_role', 'public.garantir_titulo_web(uuid,uuid,text,text,numeric,uuid)', 'EXECUTE'),
  'service_role mantem garantir_titulo_web');

-- === Parte 3: search_path fixo nas 10 funcoes de trigger/validacao ===
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='stock_movements_immutable' and p.proconfig is not null),
  'stock_movements_immutable tem search_path fixo');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='enforce_orders_transition' and p.proconfig is not null),
  'enforce_orders_transition tem search_path fixo');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='caixa_movements_immutable' and p.proconfig is not null),
  'caixa_movements_immutable tem search_path fixo');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='financial_settlements_immutable' and p.proconfig is not null),
  'financial_settlements_immutable tem search_path fixo');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='journal_entries_immutable' and p.proconfig is not null),
  'journal_entries_immutable tem search_path fixo');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='journal_lines_immutable' and p.proconfig is not null),
  'journal_lines_immutable tem search_path fixo');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='journal_check_balance' and p.proconfig is not null),
  'journal_check_balance tem search_path fixo');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='ean_dv_valido' and p.proconfig is not null),
  'ean_dv_valido tem search_path fixo');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='dun14_dv_valido' and p.proconfig is not null),
  'dun14_dv_valido tem search_path fixo');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='resolve_price' and p.proconfig is not null),
  'resolve_price tem search_path fixo');

-- === Parte 4: os gatilhos de imutabilidade continuam bloqueando (comportamento inalterado) ===
-- throws_ok(sql, errcode) — forma de 2 args: so confere o SQLSTATE (P0001, de "raise
-- exception" simples), sem exigir o texto exato da mensagem.
select throws_ok(
  $$ update stock_movements set id = id where id = (select id from stock_movements limit 1) $$,
  'P0001'
);
select throws_ok(
  $$ update caixa_movements set id = id where id = (select id from caixa_movements limit 1) $$,
  'P0001'
);
select throws_ok(
  $$ update financial_settlements set id = id where id = (select id from financial_settlements limit 1) $$,
  'P0001'
);
select throws_ok(
  $$ delete from journal_entries where id = (select id from journal_entries limit 1) $$,
  'P0001'
);
select throws_ok(
  $$ update journal_entry_lines set id = id where id = (select id from journal_entry_lines limit 1) $$,
  'P0001'
);

-- orders esta vazia em staging hoje — sem linha pra exercitar enforce_orders_transition.
select skip('orders vazia em staging, sem linha pra testar enforce_orders_transition');

select * from finish();
rollback;
