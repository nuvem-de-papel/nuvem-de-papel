-- 0047_test.sql -- pgTAP. Roda em begin;...rollback; (nada aqui persiste).
begin;
select plan(1);
select ok(
  (select relrowsecurity from pg_class where relname = 'ncm_referencia' and relnamespace = 'public'::regnamespace) = true,
  'ncm_referencia deve ter RLS ligado apos 0047'
);
select * from finish();
rollback;
