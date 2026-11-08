-- 0042_test.sql -- pgTAP. Roda em begin;...rollback; (nada aqui persiste).
begin;
select plan(2);

select ok(
  exists(
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgtap' and n.nspname = 'extensions'
  ),
  'pgtap agora esta no schema extensions, nao em public'
);

-- Auto-teste: se esta linha roda (estamos chamando ok() do proprio pgtap,
-- ja movido), o search_path "$user, public, extensions" resolve certo sem
-- qualificar schema.
select ok(1 = 1, 'pgtap continua funcionando sem qualificar schema (search_path inclui extensions)');

select * from finish();
rollback;
