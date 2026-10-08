-- Teste da migration 0028 - roda dentro de begin;...rollback;
-- Tabela de frete (cotação Correios por referencia):
--   * a tabela existe com RLS ligado e DENY-ALL (zero policies);
--   * servico fora de pac/sedex e recusado (check);
--   * CEP de origem com formato errado e recusado (check);
--   * regiao que nao seja digito e recusada (check);
--   * peso/valor/prazo negativos sao recusados (check);
--   * linha duplicada da matriz (mesma origem/regiao/servico/peso) e unica;
--   * cotacao pega o MENOR teto de peso >= pedido (faixa correta);
--   * cotacao acima do maior teto nao devolve linha (checkout trava);
--   * apagar o tenant CASCADE limpa a matriz (sem orfa);
--   * invariante global 0020: nenhuma tabela de public sem RLS.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(17);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;
create temp table _t (id uuid);
insert into _t select id from tenants limit 1;

-- precondicao ----------------------------------------------------------------
insert into _out
  select ok(exists(select 1 from tenants), 'ha ao menos um tenant');

-- tabela e RLS ----------------------------------------------------------------
insert into _out
  select ok(to_regclass('public.freight_tabelas') is not null, 'freight_tabelas existe');

insert into _out
  select ok((select c.relrowsecurity
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'freight_tabelas'),
            'RLS ligado em freight_tabelas');

insert into _out
  select ok((select count(*) from pg_policies
              where tablename = 'freight_tabelas') = 0,
            'deny-all: nenhuma policy na matriz de frete');

-- fixtures (matriz enxuta: 1 origem, 1 regiao, 2 servicos, 2 faixas) ----------
insert into freight_tabelas (tenant_id, origem_cep, destino_regiao, servico, peso_ate, valor, prazo_dias)
values ((select id from _t), '09850730', '0', 'pac', 0.5, 18.40, 4),
       ((select id from _t), '09850730', '0', 'pac', 3.0, 34.90, 5),
       ((select id from _t), '09850730', '0', 'sedex', 0.5, 27.10, 1),
       ((select id from _t), '09850730', '0', 'sedex', 3.0, 48.50, 1);

insert into _out
  select ok((select count(*) from freight_tabelas
              where origem_cep = '09850730' and destino_regiao = '0') = 4,
            'matriz fixture gravada (4 linhas)');

-- validacoes ------------------------------------------------------------------
insert into _out
  select throws_ok(
    $q$insert into freight_tabelas (tenant_id, origem_cep, destino_regiao, servico, peso_ate, valor, prazo_dias)
        values ((select id from _t), '09850730', '0', 'transportadora', 1, 10, 3)$q$,
    '23514', null, 'servico fora de pac/sedex recusado');

insert into _out
  select throws_ok(
    $q$insert into freight_tabelas (tenant_id, origem_cep, destino_regiao, servico, peso_ate, valor, prazo_dias)
        values ((select id from _t), '09850-730', '0', 'pac', 1, 10, 3)$q$,
    '23514', null, 'origem_cep fora do formato 8 digitos recusada');

insert into _out
  select throws_ok(
    $q$insert into freight_tabelas (tenant_id, origem_cep, destino_regiao, servico, peso_ate, valor, prazo_dias)
        values ((select id from _t), '09850730', 'S', 'pac', 1, 10, 3)$q$,
    '23514', null, 'regiao que nao e digito recusada');

insert into _out
  select throws_ok(
    $q$insert into freight_tabelas (tenant_id, origem_cep, destino_regiao, servico, peso_ate, valor, prazo_dias)
        values ((select id from _t), '09850730', '1', 'pac', -1, 10, 3)$q$,
    '23514', null, 'peso_ate negativo recusado');

insert into _out
  select throws_ok(
    $q$insert into freight_tabelas (tenant_id, origem_cep, destino_regiao, servico, peso_ate, valor, prazo_dias)
        values ((select id from _t), '09850730', '1', 'pac', 1, -0.01, 3)$q$,
    '23514', null, 'valor negativo recusado');

insert into _out
  select throws_ok(
    $q$insert into freight_tabelas (tenant_id, origem_cep, destino_regiao, servico, peso_ate, valor, prazo_dias)
        values ((select id from _t), '09850730', '1', 'pac', 1, 10, -1)$q$,
    '23514', null, 'prazo_dias negativo recusado');

insert into _out
  select throws_ok(
    $q$insert into freight_tabelas (tenant_id, origem_cep, destino_regiao, servico, peso_ate, valor, prazo_dias)
        values ((select id from _t), '09850730', '0', 'pac', 0.5, 99.90, 9)$q$,
    '23505', null, 'linha duplicada da matriz (mesma chave) recusada');

-- cotacao ---------------------------------------------------------------------
insert into _out
  select ok((select valor from freight_tabelas
              where tenant_id = (select id from _t)
                and origem_cep = '09850730'
                and destino_regiao = '0'
                and servico = 'pac'
                and peso_ate >= 1.2
              order by peso_ate
              limit 1) = 34.90,
            'cotacao pega o menor teto >= peso (1.2kg -> faixa 3.0)');

insert into _out
  select ok((select count(*) from freight_tabelas
              where tenant_id = (select id from _t)
                and origem_cep = '09850730'
                and destino_regiao = '0'
                and servico = 'pac'
                and peso_ate >= 30) = 0,
            'peso acima do maior teto nao devolve linha (checkout trava)');

-- cascade ---------------------------------------------------------------------
create temp table _tenant_tmp (id uuid default gen_random_uuid());
insert into _tenant_tmp default values;
insert into tenants (id, slug, name)
select id, 'frete-0028-teste', 'Tenant teste 0028' from _tenant_tmp;
insert into freight_tabelas (tenant_id, origem_cep, destino_regiao, servico, peso_ate, valor, prazo_dias)
select id, '09850730', '9', 'pac', 1, 10, 3 from _tenant_tmp;

insert into _out
  select ok((select count(*) from freight_tabelas
              where tenant_id = (select id from _tenant_tmp)) = 1,
            'linha na matriz do tenant de teste');

delete from tenants where id = (select id from _tenant_tmp);

insert into _out
  select ok((select count(*) from freight_tabelas
              where tenant_id = (select id from _tenant_tmp)) = 0,
            'apagar o tenant CASCADE limpa a matriz (sem orfa)');

-- invariante global do 0020 ------------------------------------------------------
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind in ('r', 'p')
                and not c.relrowsecurity),
            0::bigint, 'nenhuma tabela de public sem RLS');

-- limpeza dos fixtures antes do rollback ----------------------------------------
delete from freight_tabelas where origem_cep = '09850730';

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas,
       coalesce(string_agg(case when line like 'not ok%' then line end, ' || '), '') as detalhes
from _out;
rollback;
