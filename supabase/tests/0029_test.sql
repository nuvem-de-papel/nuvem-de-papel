-- Teste da migration 0029 - roda dentro de begin;...rollback;
-- Cadastro completo do cliente (contato + endereco + situacao):
--   * customers ganhou 13 colunas novas (telefone..foto_url);
--   * telefone so aceita 10-11 digitos (check);
--   * whatsapp so aceita 11 digitos (check);
--   * cep so aceita 8 digitos (check);
--   * limite_credito nao aceita negativo (check);
--   * ativo nasce true e aceita false (flag de bloqueio de atendimento);
--   * colunas novas nullable aceitam null (ficha antiga nao quebra);
--   * RLS continua deny-all (0 policies) - so schema mudou;
--   * invariante global 0020: nenhuma tabela de public sem RLS.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(15);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;
create temp table _t (id uuid);
insert into _t select id from tenants limit 1;

-- precondicao ----------------------------------------------------------------
insert into _out
  select ok(exists(select 1 from tenants), 'ha ao menos um tenant');

insert into _out
  select ok(to_regclass('public.customers') is not null, 'customers existe');

-- colunas novas ---------------------------------------------------------------
insert into _out
  select ok((select count(*) from information_schema.columns
              where table_schema = 'public'
                and table_name = 'customers'
                and column_name in (
                  'telefone','whatsapp','nascimento','cep','logradouro','numero',
                  'complemento','bairro','cidade','observacoes','limite_credito',
                  'ativo','foto_url')) = 13,
            'as 13 colunas novas existem em customers');

-- RLS (so schema mudou - deny-all permanece) ----------------------------------
insert into _out
  select ok((select c.relrowsecurity
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'customers'),
            'RLS ligado em customers');

insert into _out
  select ok((select count(*) from pg_policies
              where tablename = 'customers') = 0,
            'deny-all: nenhuma policy em customers');

-- fixture valida ---------------------------------------------------------------
insert into customers (tenant_id, name, email, telefone, whatsapp, cep, limite_credito)
select id, 'Cliente 0029', 't0029@example.com', '11987654321', '11987654321', '01310100', 150.50
from _t;

insert into _out
  select ok((select count(*) from customers where email = 't0029@example.com') = 1,
            'ficha completa gravada (telefone + whatsapp + cep + limite)');

-- telefone fixo (10 digitos) tambem passa na faixa do check --------------------
insert into customers (tenant_id, name, email, telefone)
select id, 'Cliente 0029b', 't0029b@example.com', '1141237788'
from _t;

insert into _out
  select ok((select telefone from customers where email = 't0029b@example.com') = '1141237788',
            'telefone fixo de 10 digitos e aceito');

-- validacoes -------------------------------------------------------------------
insert into _out
  select throws_ok(
    $q$insert into customers (tenant_id, name, email, telefone)
        values ((select id from _t), 'X 0029', 't0029-tel@example.com', '123')$q$,
    '23514', null, 'telefone com formato errado e recusado');

insert into _out
  select throws_ok(
    $q$insert into customers (tenant_id, name, email, whatsapp)
        values ((select id from _t), 'X 0029', 't0029-wa@example.com', '999999999')$q$,
    '23514', null, 'whatsapp com menos de 11 digitos e recusado');

insert into _out
  select throws_ok(
    $q$insert into customers (tenant_id, name, email, cep)
        values ((select id from _t), 'X 0029', 't0029-cep@example.com', '1234')$q$,
    '23514', null, 'cep com formato errado e recusado');

insert into _out
  select throws_ok(
    $q$insert into customers (tenant_id, name, email, limite_credito)
        values ((select id from _t), 'X 0029', 't0029-lim@example.com', -0.01)$q$,
    '23514', null, 'limite de credito negativo e recusado');

-- ativo (flag de bloqueio de atendimento) --------------------------------------
insert into _out
  select ok((select ativo from customers where email = 't0029@example.com'),
            'ativo nasce true (default)');

update customers set ativo = false where email = 't0029@example.com';
insert into _out
  select ok((select not ativo from customers where email = 't0029@example.com'),
            'ativo aceita false (bloquear atendimento)');

-- colunas nullable (ficha antiga nao quebra) ------------------------------------
insert into _out
  select ok((select count(*) from information_schema.columns
              where table_schema = 'public'
                and table_name = 'customers'
                and column_name in ('telefone','whatsapp','nascimento','cep',
                                    'logradouro','numero','complemento','bairro',
                                    'cidade','observacoes','foto_url')
                and is_nullable = 'YES') = 11,
            'todas as colunas de texto/data novas aceitam null');

-- invariante global do 0020 ------------------------------------------------------
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind in ('r', 'p')
                and not c.relrowsecurity),
            0::bigint, 'nenhuma tabela de public sem RLS');

-- limpeza dos fixtures antes do rollback -------------------------------------------
delete from customers where email like 't0029%@example.com';

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas,
       coalesce(string_agg(case when line like 'not ok%' then line end, ' || '), '') as detalhes
from _out;
rollback;
