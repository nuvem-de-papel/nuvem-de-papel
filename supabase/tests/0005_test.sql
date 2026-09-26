-- Teste estrutural 0005 - rodar dentro de begin;...rollback;
begin;
select plan(8);
select has_table('audit_log');
select has_column('audit_log', 'tenant_id');
select has_column('audit_log', 'action');
select has_column('audit_log', 'actor_user_id');
select has_column('profiles', 'status');
select policies_are('audit_log', array['leitura da auditoria (gestao)']);
set local role anon;
select throws_ok(
  'insert into audit_log (tenant_id, action, entity) values (gen_random_uuid(), ''x'', ''y'')',
  '42501', null, 'anon nao escreve em audit_log'
);
set local role authenticated;
select throws_ok(
  'insert into audit_log (tenant_id, action, entity) values (gen_random_uuid(), ''x'', ''y'')',
  '42501', null, 'authenticated nao escreve em audit_log'
);
reset role;
select * from finish();
rollback;
