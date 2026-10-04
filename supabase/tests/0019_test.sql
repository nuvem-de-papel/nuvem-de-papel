-- Teste da migration 0019 - roda dentro de begin;...rollback;
-- Cobre: sequencias de numeracao de PC (prefixo PC-0 + 8 digitos, casa no
-- contrato f6 /PC-[0-9A-F]{8}/) e de EN (EN-00xx da spec), as functions de
-- proximo codigo, progressao e privilegios (service_role usa; anon nao —
-- as actions chamam via client admin).
-- Valores sao relativos (>= inicio) porque sequences nao fazem rollback:
-- o teste precisa ser reexecutavel sem resetar nada.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(19);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;

-- fixtures: proximos codigos reais (consomem as sequences) ---------------------
create temp table _t (pc text, pc2 text, en text, en2 text);
insert into _t default values;
update _t set pc = compra_proximo_codigo();
update _t set pc2 = compra_proximo_codigo();
update _t set en = compra_proxima_entrada_direta();
update _t set en2 = compra_proxima_entrada_direta();

-- sequences e functions existem ------------------------------------------------
insert into _out
  select ok(to_regclass('public.seq_numero_compra') is not null,
            'seq_numero_compra existe');
insert into _out
  select ok(to_regclass('public.seq_entrada_direta') is not null,
            'seq_entrada_direta existe');
insert into _out
  select ok(to_regprocedure('public.compra_proximo_codigo()') is not null,
            'compra_proximo_codigo existe');
insert into _out
  select ok(to_regprocedure('public.compra_proxima_entrada_direta()') is not null,
            'compra_proxima_entrada_direta existe');

-- formato PC (gerado pela function real) --------------------------------------
insert into _out
  select is((select pc from _t) ~ '^PC-[0-9A-F]{8}$', true,
            'PC casa no regex do contrato f6');
insert into _out
  select is(left((select pc from _t), 4), 'PC-0',
            'PC comeca em PC-0 (formato da spec PC-0xxx)');
insert into _out
  select is(length((select pc from _t)), 11,
            'PC tem PC- + 8 digitos');
insert into _out
  select ok((select pc from _t) >= 'PC-00000313',
            'sequencia de PC comeca a partir de 313 (spec)');
insert into _out
  select ok((select pc2 from _t) > (select pc from _t),
            'sequencia de PC avanca (dois codigos em ordem)');

-- formato EN (gerado pela function real) --------------------------------------
insert into _out
  select is((select en from _t) ~ '^EN-[0-9]{4}$', true,
            'EN casa com o formato EN-00xx (spec)');
insert into _out
  select is(left((select en from _t), 4), 'EN-0',
            'EN comeca em EN-0 (spec EN-00xx)');
insert into _out
  select ok((select en from _t) >= 'EN-0043',
            'sequencia de EN comeca a partir de 43 (spec)');
insert into _out
  select ok((select en2 from _t) > (select en from _t),
            'sequencia de EN avanca (dois codigos em ordem)');

-- privilegios: so o client service_role numerar --------------------------------
insert into _out
  select is(has_function_privilege('service_role',
            'public.compra_proximo_codigo()', 'EXECUTE'),
            true, 'service_role executa compra_proximo_codigo');
insert into _out
  select is(has_function_privilege('service_role',
            'public.compra_proxima_entrada_direta()', 'EXECUTE'),
            true, 'service_role executa compra_proxima_entrada_direta');
insert into _out
  select is(has_function_privilege('anon',
            'public.compra_proximo_codigo()', 'EXECUTE'),
            false, 'anon nao executa compra_proximo_codigo');
insert into _out
  select is(has_function_privilege('anon',
            'public.compra_proxima_entrada_direta()', 'EXECUTE'),
            false, 'anon nao executa compra_proxima_entrada_direta');
insert into _out
  select ok(has_sequence_privilege('service_role',
            'public.seq_numero_compra', 'USAGE'),
            'service_role usa a sequencia de PC');
insert into _out
  select ok(has_sequence_privilege('service_role',
            'public.seq_entrada_direta', 'USAGE'),
            'service_role usa a sequencia de EN');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
from _out;
rollback;
