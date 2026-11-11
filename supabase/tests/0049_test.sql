-- 0049_test.sql (pgTAP) — rodar dentro de begin; ... rollback;
begin;
select plan(4);
select has_table('public', 'quote_requests', 'tabela quote_requests existe');
select ok((select relrowsecurity from pg_class where oid = 'public.quote_requests'::regclass), 'RLS ligado em quote_requests');
select ok(not has_table_privilege('anon', 'public.quote_requests', 'select'), 'anon nao le quote_requests');
select ok(has_table_privilege('anon', 'public.item_stock_cd_public', 'select'), 'anon le saldo do CD (vitrine)');
select * from finish();
rollback;
