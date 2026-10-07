-- Teste da migration 0027 - roda dentro de begin;...rollback;
-- Conciliacao bancaria (M1):
--   * as duas tabelas existem com RLS ligado e politica de leitura gestao;
--   * seq repetido no mesmo extrato e recusado (unique);
--   * FITID repetido entre importacoes e recusado (unique parcial);
--   * status fora do conjunto e recusado (check);
--   * conciliada exige vinculo e pendente/ignorada nao aceitam vinculo;
--   * a contagem do extrato nao inverte (linhas_novas <= linhas_total);
--   * conciliar e desconciliar andam nos dois sentidos;
--   * apagar o extrato apaga as linhas (cascade) - sem linha orfa;
--   * invariante global 0020: nenhuma tabela de public sem RLS.
-- Nada disto toca o diario: conciliacao e controle, nao contabilidade.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(18);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;
create temp table _t (id uuid);
insert into _t select id from tenants limit 1;

-- precondicao ----------------------------------------------------------------
insert into _out
  select ok(exists(select 1 from tenants), 'ha ao menos um tenant');

-- tabelas e RLS --------------------------------------------------------------
insert into _out
  select ok(to_regclass('public.bank_extratos') is not null, 'bank_extratos existe');

insert into _out
  select ok(to_regclass('public.bank_linhas') is not null, 'bank_linhas existe');

insert into _out
  select ok((select c.relrowsecurity
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'bank_extratos'),
            'RLS ligado em bank_extratos');

insert into _out
  select ok((select c.relrowsecurity
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'bank_linhas'),
            'RLS ligado em bank_linhas');

insert into _out
  select ok(exists(select 1 from pg_policies
                    where tablename = 'bank_extratos'
                      and policyname = 'le extratos (gestao)'),
            'politica de leitura gestao nos extratos');

insert into _out
  select ok(exists(select 1 from pg_policies
                    where tablename = 'bank_linhas'
                      and policyname = 'le linhas (gestao)'),
            'politica de leitura gestao nas linhas');

-- fixtures --------------------------------------------------------------------
create temp table _ext (id uuid default gen_random_uuid());
create temp table _ext2 (id uuid default gen_random_uuid());
create temp table _lin (id uuid default gen_random_uuid());

insert into _ext default values;
insert into _ext2 default values;
insert into _lin default values;

insert into bank_extratos (id, tenant_id, fonte, competencia, linhas_total, linhas_novas)
select id, (select id from _t), 'csv', date '2026-09-01', 2, 2
  from _ext;

insert into bank_extratos (id, tenant_id, fonte, competencia, linhas_total, linhas_novas)
select id, (select id from _t), 'ofx', date '2026-09-01', 1, 1
  from _ext2;

insert into bank_linhas (id, tenant_id, extrato_id, seq, data, descricao, valor)
select id, (select id from _t), (select id from _ext), 1, date '2026-09-05',
       'Pix recebido da loja', 450.00
  from _lin;

insert into _out
  select ok((select count(*) from bank_linhas
              where extrato_id = (select id from _ext)) = 1,
            'linha de extrato gravada (valor aceita sinal)');

-- validacoes ------------------------------------------------------------------
insert into _out
  select throws_ok(
    $q$insert into bank_linhas (tenant_id, extrato_id, seq, data, descricao, valor)
        values ((select id from _t), (select id from _ext), 1, date '2026-09-06',
                'Repetida', -10.00)$q$,
    '23505', null, 'seq repetido no mesmo extrato recusado');

insert into bank_linhas (tenant_id, extrato_id, seq, data, descricao, valor, fitid)
values ((select id from _t), (select id from _ext), 2, date '2026-09-07',
        'Tarifa com fitid', -20.00, 'FIT-0027');

insert into _out
  select throws_ok(
    $q$insert into bank_linhas (tenant_id, extrato_id, seq, data, descricao, valor, fitid)
        values ((select id from _t), (select id from _ext2), 1, date '2026-09-07',
                'Fitid repetido', -20.00, 'FIT-0027')$q$,
    '23505', null, 'fitid repetido entre importacoes recusado');

insert into _out
  select throws_ok(
    $q$insert into bank_linhas (tenant_id, extrato_id, seq, data, descricao, valor, status)
        values ((select id from _t), (select id from _ext2), 1, date '2026-09-08',
                'Status fora do conjunto', -1.00, 'estourado')$q$,
    '23514', null, 'status invalido recusado');

insert into _out
  select throws_ok(
    $q$insert into bank_linhas (tenant_id, extrato_id, seq, data, descricao, valor, status)
        values ((select id from _t), (select id from _ext2), 1, date '2026-09-08',
                'Conciliada sem vinculo', -1.00, 'conciliada')$q$,
    '23514', null, 'conciliada sem ref recusada');

insert into _out
  select throws_ok(
    $q$insert into bank_linhas (tenant_id, extrato_id, seq, data, descricao, valor,
                                status, ref_tipo, ref_id)
        values ((select id from _t), (select id from _ext2), 1, date '2026-09-08',
                'Pendente com vinculo', -1.00, 'pendente', 'despesa',
                gen_random_uuid())$q$,
    '23514', null, 'pendente com ref recusada');

insert into _out
  select throws_ok(
    $q$update bank_extratos set linhas_novas = 99
        where id = (select id from _ext)$q$,
    '23514', null, 'contagem invertida (novas > total) recusada');

-- conciliar e desconciliar ------------------------------------------------------
update bank_linhas
   set status = 'conciliada',
       ref_tipo = 'despesa',
       ref_id = gen_random_uuid(),
       conciliada_em = now()
 where id = (select id from _lin);

insert into _out
  select ok((select status = 'conciliada' and ref_tipo is not null and ref_id is not null
               from bank_linhas where id = (select id from _lin)),
            'conciliar grava status, vinculo e carimbo');

update bank_linhas
   set status = 'pendente',
       ref_tipo = null,
       ref_id = null,
       conciliada_em = null,
       conciliada_by = null
 where id = (select id from _lin);

insert into _out
  select ok((select status = 'pendente' and ref_tipo is null and ref_id is null
               from bank_linhas where id = (select id from _lin)),
            'desconciliar volta para pendente e limpa o vinculo');

-- cascade -----------------------------------------------------------------------
delete from bank_extratos where id = (select id from _ext);

insert into _out
  select ok((select count(*) from bank_linhas
              where extrato_id = (select id from _ext)) = 0,
            'apagar o extrato apaga as linhas (cascade)');

-- invariante global do 0020 ------------------------------------------------------
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind in ('r', 'p')
                and not c.relrowsecurity),
            0::bigint, 'nenhuma tabela de public sem RLS');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas,
       coalesce(string_agg(case when line like 'not ok%' then line end, ' || '), '') as detalhes
from _out;
rollback;
