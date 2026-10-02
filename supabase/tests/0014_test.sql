-- Teste estrutural 0014 - roda dentro de begin;...rollback;
-- Cobre: maquina de estados da NF-e (pendente/transmitida/autorizada/
-- rejeitada/cancelada), colunas do ciclo SEFAZ (ambiente/modelo/chave/recibo/
-- protocolo/xml/motivo/timestamps), invariantes por estado, chave de acesso
-- unica e RLS (sem mudanca em relacao a 0011).
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(33);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;

-- colunas novas --------------------------------------------------------------
insert into _out select has_column('nfe_emissoes', 'ambiente');
insert into _out select has_column('nfe_emissoes', 'modelo');
insert into _out select has_column('nfe_emissoes', 'chave');
insert into _out select has_column('nfe_emissoes', 'recibo');
insert into _out select has_column('nfe_emissoes', 'protocolo');
insert into _out select has_column('nfe_emissoes', 'xml');
insert into _out select has_column('nfe_emissoes', 'motivo');
insert into _out select has_column('nfe_emissoes', 'transmitida_em');
insert into _out select has_column('nfe_emissoes', 'autorizada_em');

-- constraints ----------------------------------------------------------------
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'nfe_emissoes'::regclass
        and conname = 'nfe_emissoes_status_check'
        and pg_get_constraintdef(oid) like '%pendente%'
        and pg_get_constraintdef(oid) like '%transmitida%'
        and pg_get_constraintdef(oid) like '%autorizada%'
        and pg_get_constraintdef(oid) like '%rejeitada%'
        and pg_get_constraintdef(oid) like '%cancelada%'
        and pg_get_constraintdef(oid) not like '%emitida%'),
    1::bigint, 'status aceita os 5 estados da maquina e nao tem emitida');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'nfe_emissoes'::regclass
        and conname = 'nfe_emissoes_ambiente_check'
        and pg_get_constraintdef(oid) like '%homologacao%'
        and pg_get_constraintdef(oid) like '%producao%'),
    1::bigint, 'ambiente aceita homologacao e producao');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'nfe_emissoes'::regclass
        and conname = 'nfe_emissoes_modelo_check'
        and pg_get_constraintdef(oid) like '%55%'
        and pg_get_constraintdef(oid) like '%65%'),
    1::bigint, 'modelo aceita 55 (NF-e) e 65 (NFC-e)');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'nfe_emissoes'::regclass
        and conname = 'nfe_emissoes_chave_check'
        and pg_get_constraintdef(oid) like '%44%'),
    1::bigint, 'chave exige 44 digitos quando informada');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'nfe_emissoes'::regclass
        and conname = 'nfe_emissoes_autorizada_ok'
        and upper(pg_get_constraintdef(oid)) like '%PROTOCOLO IS NOT NULL%'
        and upper(pg_get_constraintdef(oid)) like '%AUTORIZADA_EM IS NOT NULL%'),
    1::bigint, 'autorizada exige chave, protocolo e autorizada_em');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'nfe_emissoes'::regclass
        and conname = 'nfe_emissoes_transmitida_ok'
        and upper(pg_get_constraintdef(oid)) like '%RECIBO IS NOT NULL%'),
    1::bigint, 'transmitida exige recibo');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'nfe_emissoes'::regclass
        and conname = 'nfe_emissoes_pendente_ok'
        and upper(pg_get_constraintdef(oid)) like '%RECIBO IS NULL%'),
    1::bigint, 'pendente nao pode ter recibo (nunca transmitida)');
insert into _out
  select is(
    (select count(*) from pg_index
      where indexrelid = to_regclass('nfe_emissoes_chave_key')
        and indisunique),
    1::bigint, 'chave de acesso e unica por tenant');

-- seed -----------------------------------------------------------------------
insert into customers (id, tenant_id, name, email)
values ('dddddddd-0000-4000-8000-000000000003',
        '00000000-0000-0000-0000-000000000001',
        'Cliente SEFAZ', 'sefaz-teste@exemplo.com');

insert into orders (id, tenant_id, customer_id, total_amount)
values ('dddddddd-0000-4000-8000-000000000004',
        '00000000-0000-0000-0000-000000000001',
        'dddddddd-0000-4000-8000-000000000003', 99.90);

insert into nfe_emissoes
  (tenant_id, tipo, order_id, numero, serie, destinatario, itens, totais)
values
  ('00000000-0000-0000-0000-000000000001', 'saida',
   'dddddddd-0000-4000-8000-000000000004', 900, 900,
   '{"nome":"Cliente SEFAZ"}'::jsonb, '[]'::jsonb, '{"total":99.9}'::jsonb);

insert into _out
  select is((select status from nfe_emissoes where numero = 900),
            'pendente', 'nota nova nasce pendente (maquina M13)');

-- rejeicoes ------------------------------------------------------------------
insert into _out
  select throws_ok(
    $q$update nfe_emissoes set status = 'emitida' where numero = 900$q$,
    '23514', null, 'estado legado emitida e rejeitado');

insert into _out
  select throws_ok(
    $q$update nfe_emissoes set ambiente = 'teste' where numero = 900$q$,
    '23514', null, 'ambiente fora de homologacao/producao e rejeitado');

insert into _out
  select throws_ok(
    $q$update nfe_emissoes set modelo = 42 where numero = 900$q$,
    '23514', null, 'modelo fora de 55/65 e rejeitado');

insert into _out
  select throws_ok(
    $q$update nfe_emissoes set chave = '1234567890123456789012345678901234567890123'::text where numero = 900$q$,
    '23514', null, 'chave com 43 digitos e rejeitada');

insert into _out
  select throws_ok(
    $q$update nfe_emissoes set status = 'autorizada',
         chave = '35261041398812000150655010000000011000000010',
         autorizada_em = now() where numero = 900$q$,
    '23514', null, 'autorizada sem protocolo e rejeitada');

insert into _out
  select throws_ok(
    $q$update nfe_emissoes set status = 'transmitida' where numero = 900$q$,
    '23514', null, 'transmitida sem recibo e rejeitada');

insert into _out
  select throws_ok(
    $q$update nfe_emissoes set recibo = 'REC123' where numero = 900$q$,
    '23514', null, 'pendente com recibo e rejeitada');

-- caminho feliz (estado a estado) --------------------------------------------
with u as (
  update nfe_emissoes
    set status = 'transmitida', recibo = 'REC900', transmitida_em = now()
    where numero = 900 and status = 'pendente'
    returning 1)
insert into _out
  select is((select count(*) from u), 1::bigint, 'pendente -> transmitida com recibo');

with u as (
  update nfe_emissoes
    set status = 'autorizada',
        chave = '35261041398812000150655010000000011000000011',
        protocolo = '135260000000001',
        autorizada_em = now()
    where numero = 900 and status = 'transmitida'
    returning 1)
insert into _out
  select is((select count(*) from u), 1::bigint, 'transmitida -> autorizada com chave e protocolo');

insert into _out
  select throws_ok(
    $q$insert into nfe_emissoes (tenant_id, tipo, order_id, numero, serie, chave)
       values ('00000000-0000-0000-0000-000000000001', 'saida',
               'dddddddd-0000-4000-8000-000000000004', 901, 900,
               '35261041398812000150655010000000011000000011')$q$,
    '23505', null, 'chave de acesso duplicada e bloqueada');

insert into _out
  select ok(
    not exists (select 1 from nfe_emissoes where status = 'emitida'),
    'nenhuma nota permanece no estado legado emitida');

-- RLS (sem mudanca em relacao a 0011) ----------------------------------------
insert into _out select policies_are('nfe_emissoes',
  array['leitura nfe (gestao)']);

set local role authenticated;
insert into _out
  select throws_ok(
    $q$insert into nfe_emissoes (tenant_id, tipo, order_id, numero, serie)
       values ('00000000-0000-0000-0000-000000000001', 'saida',
               'dddddddd-0000-4000-8000-000000000004', 91, 900)$q$,
    '42501', null, 'authenticated nao escreve em nfe_emissoes'
  );
insert into _out
  select is(
    (select count(*) from nfe_emissoes), 0::bigint,
    'authenticated sem papel nao le as notas'
  );
with u as (update nfe_emissoes set motivo = 'x' where numero = 900 returning 1)
insert into _out
  select is((select count(*) from u), 0::bigint,
    'authenticated nao atualiza notas (deny-all silencioso)');
reset role;

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
from _out;
rollback;
