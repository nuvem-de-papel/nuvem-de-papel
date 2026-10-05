-- Teste da migration 0021 - roda dentro de begin;...rollback;
-- Cobre o Bloco 2 passo 1 (fundacao do kernel contabil):
--   * plano padrao semeado (60 contas / 39 folhas) e coerente com o DRE;
--   * habilitacao por tenant idempotente (mesma ideia do module_catalog);
--   * diario de dupla entrada: aceita o balanceado, recusa o desbalanceado;
--   * imutabilidade (linha nunca update, cabecalho nunca delete);
--   * v_dre devolve a receita lancada na competencia certa;
--   * RLS ligada nas 6 tabelas novas + a invariante global do 0020.
-- Nao da para exercitar o trigger ADIADO de balanco aqui: ele so roda no
-- COMMIT, e este teste termina em rollback. O balanco e garantido antes da
-- escrita pelo proprio journal_post(), que e o que este teste prova.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(20);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;
create temp table _t (id uuid);
insert into _t select id from tenants limit 1;

-- precondicao ----------------------------------------------------------------
insert into _out
  select ok(exists(select 1 from tenants), 'ha ao menos um tenant');

-- estrutura ------------------------------------------------------------------
insert into _out
  select ok(to_regclass('public.account_catalog') is not null, 'account_catalog existe');
insert into _out
  select ok(to_regclass('public.tenant_accounts') is not null, 'tenant_accounts existe');
insert into _out
  select ok(to_regclass('public.journal_entries') is not null, 'journal_entries existe');
insert into _out
  select ok(to_regclass('public.journal_entry_lines') is not null, 'journal_entry_lines existe');
insert into _out
  select ok(to_regclass('public.v_dre') is not null, 'v_dre existe');

-- plano padrao ---------------------------------------------------------------
insert into _out
  select is((select count(*) from account_catalog), 60::bigint, '60 contas no plano padrao');
insert into _out
  select is((select count(*) from account_catalog where aceita_lancamento), 39::bigint,
            '39 folhas aceitam lancamento');
insert into _out
  select is((select count(*)
               from account_catalog
              where aceita_lancamento
                and classe in (4,5,6)
                and dre_grupo is null), 0::bigint,
            'toda folha de resultado tem secao no DRE');

-- habilitacao por tenant -----------------------------------------------------
insert into _out
  select is((select count(*) from tenant_accounts where tenant_id = (select id from _t)),
            60::bigint, 'plano habilitado para o tenant');
insert into _out
  select is(seed_chart_of_accounts((select id from _t))::bigint, 0::bigint,
            're-sementear o plano nao duplica linha');

-- diario ---------------------------------------------------------------------
insert into _out
  select ok(journal_post(
              p_tenant       => (select id from _t),
              p_competencia  => current_date,
              p_source_type  => 'manual',
              p_source_id    => null,
              p_description  => 'Venda de teste 0021',
              p_document     => null,
              p_cost_center  => null,
              p_lines        => '[{"code":"1.1.1","debit":100,"credit":0},
                                  {"code":"4.1.1","debit":0,"credit":100}]'::jsonb,
              p_idem         => 'teste-0021') is not null,
            'diario aceita lancamento balanceado');

insert into _out
  select is((select count(*)
               from journal_entry_lines l
               join journal_entries e on e.id = l.entry_id
              where e.tenant_id = (select id from _t)
                and e.idempotency_key = 'teste-0021'),
            2::bigint, 'duas linhas gravadas no lancamento');

insert into _out
  select throws_ok(
    $$select journal_post(
              p_tenant       => (select id from _t),
              p_competencia  => current_date,
              p_source_type  => 'manual',
              p_source_id    => null,
              p_description  => 'Lancamento torto',
              p_document     => null,
              p_cost_center  => null,
              p_lines        => '[{"code":"1.1.1","debit":100,"credit":0},
                                  {"code":"4.1.1","debit":0,"credit":50}]'::jsonb,
              p_idem         => 'teste-0021-desbalanceado')$$,
    'P0001',
    'DIARIO_DESVIO: debito 100 <> credito 50',
    'lancamento desbalanceado e recusado');

insert into _out
  select throws_ok(
    $$update journal_entry_lines set debit = 1 where code = '1.1.1'$$,
    'P0001',
    'DIARIO_LINHA_IMUTAVEL: UPDATE nao permitido (crie um estorno)',
    'linha do diario nao pode ser alterada');

insert into _out
  select throws_ok(
    $$delete from journal_entries where idempotency_key = 'teste-0021'$$,
    'P0001',
    'DIARIO_CABECALHO_IMUTAVEL: delete nao permitido (crie um estorno)',
    'cabecalho do diario nao pode ser apagado');

-- DRE ------------------------------------------------------------------
insert into _out
  select is((select count(*)
               from v_dre
              where tenant_id = (select id from _t)
                and dre_grupo = 'receita_bruta'
                and code = '4.1.1'),
            1::bigint, 'DRE reflete a receita lancada');

-- RLS ------------------------------------------------------------------
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relname in ('account_catalog','tenant_accounts','cost_centers',
                                  'journal_entries','journal_entry_lines','expenses')),
            6::bigint, '6 tabelas novas existem');
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relname in ('account_catalog','tenant_accounts','cost_centers',
                                  'journal_entries','journal_entry_lines','expenses')
                and c.relrowsecurity),
            6::bigint, 'RLS ligada nas 6 tabelas novas');

-- invariante global (herdada do 0020) ----------------------------------------
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind in ('r', 'p')
                and not c.relrowsecurity),
            0::bigint, 'nenhuma tabela de public sem RLS');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
from _out;
rollback;
