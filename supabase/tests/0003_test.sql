-- Teste estrutural 0003 — rodar dentro de begin;...rollback;
begin;
select plan(3);
select has_table('customers');
select has_table('orders');
select has_table('campaigns');
select * from finish();
rollback;
