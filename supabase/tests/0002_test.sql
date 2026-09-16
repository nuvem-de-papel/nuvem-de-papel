-- Teste estrutural 0002 — rodar dentro de begin;...rollback;
begin;
select plan(1);
select has_table('publications');
select * from finish();
rollback;
