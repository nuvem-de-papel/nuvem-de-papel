-- 0050_test.sql (pgTAP) — rodar dentro de begin; ... rollback;
begin;
select plan(4);
select has_table('public', 'quote_request_items', 'tabela quote_request_items existe');
select col_not_null('public', 'quote_request_items', 'tipo_prazo', 'tipo_prazo obrigatorio');
select ok(not has_table_privilege('anon', 'public.quote_requests', 'select'), 'anon nao le quote_requests');
select has_column('public', 'customers', 'auth_user_id', 'customers.auth_user_id existe');
select * from finish();
rollback;
