-- Teste estrutural 0004 - rodar dentro de begin;...rollback;
begin;
select plan(4);
select has_table('profiles');
select has_column('profiles', 'tenant_id');
select has_column('profiles', 'role');
select policies_are('profiles', array['le proprio perfil']);
select * from finish();
rollback;
