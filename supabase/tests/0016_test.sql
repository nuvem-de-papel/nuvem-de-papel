-- Teste da migration 0016 - roda dentro de begin;...rollback;
-- Cobre: dados fiscais do cliente (documento/ie/uf com check), backfill do
-- funil (erp/pdvo vira etapa 'venda'), tabelas de expedição (entregas +
-- entrega_eventos, 1 entrega por pedido, status), RLS de leitura por papel e
-- deny-all de escrita.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(20);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;

-- dados fiscais do cliente ---------------------------------------------------
insert into _out select has_column('customers', 'documento');
insert into _out select has_column('customers', 'ie');
insert into _out select has_column('customers', 'uf');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'customers'::regclass
        and conname = 'customers_documento_check'
        and pg_get_constraintdef(oid) like '%0-9%11%'
        and pg_get_constraintdef(oid) like '%0-9%14%'),
    1::bigint, 'documento aceita CPF (11) ou CNPJ (14) so digitos');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'customers'::regclass
        and conname = 'customers_uf_check'
        and pg_get_constraintdef(oid) like '%A-Z%2%'),
    1::bigint, 'uf aceita sigla de 2 letras maiusculas');

-- funil: nenhum documento erp/pdvo ficou sem etapa ---------------------------
insert into _out
  select is(
    (select count(*) from orders
      where origem in ('erp', 'pdv') and etapa is null),
    0::bigint, 'backfill: todo erp/pdvo virou etapa venda');

-- tabelas de expedicao -------------------------------------------------------
insert into _out
  select is(to_regclass('public.entregas') is not null, true,
    'tabela entregas existe');
insert into _out
  select is(to_regclass('public.entrega_eventos') is not null, true,
    'tabela entrega_eventos existe');
insert into _out
  select is(
    (select count(*) from pg_index
      where indexrelid = to_regclass('public.entregas_tenant_id_order_id_key')
        and indisunique),
    1::bigint, '1 entrega por pedido (unica por tenant)');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'entregas'::regclass
        and conname = 'entregas_status_check'
        and pg_get_constraintdef(oid) like '%em_transito%'
        and pg_get_constraintdef(oid) like '%separado%'
        and pg_get_constraintdef(oid) like '%devolvido%'),
    1::bigint, 'status cobre o funil de expedicao');
insert into _out
  select is(
    (select count(*) from pg_index
      where indexrelid = to_regclass('public.idx_entregas_status')),
    1::bigint, 'indice de status da agenda de entregas existe');

-- RLS: leitura por papel -----------------------------------------------------
insert into _out select policies_are('entregas',
  array['le entregas (operacao)']);
insert into _out select policies_are('entrega_eventos',
  array['le eventos de entrega (operacao)']);

-- validacoes de cliente ------------------------------------------------------
insert into _out
  select throws_ok(
    $q$insert into customers (tenant_id, name, email, documento)
       values ('00000000-0000-0000-0000-000000000001', 'Teste Doc',
               'teste-doc-0016@x.com', '123')$q$,
    '23514', null, 'documento curto e rejeitado');
insert into _out
  select throws_ok(
    $q$insert into customers (tenant_id, name, email, uf)
       values ('00000000-0000-0000-0000-000000000001', 'Teste UF',
               'teste-uf-0016@x.com', 'sp')$q$,
    '23514', null, 'uf minuscula e rejeitada');

-- RLS: authenticated sem papel nao le nem escreve ----------------------------
set local role authenticated;
insert into _out
  select is(
    (select count(*) from entregas), 0::bigint,
    'authenticated sem papel nao le entregas');
insert into _out
  select throws_ok(
    $q$insert into entregas (tenant_id, order_id)
       values ('00000000-0000-0000-0000-000000000001',
               'dddddddd-0000-4000-8000-000000000004')$q$,
    '42501', null, 'authenticated nao escreve em entregas (deny-all)');
insert into _out
  select throws_ok(
    $q$insert into entrega_eventos (tenant_id, entrega_id, para_status)
       values ('00000000-0000-0000-0000-000000000001',
               'dddddddd-0000-4000-8000-000000000004', 'aguardando')$q$,
    '42501', null, 'authenticated nao escreve em entrega_eventos (deny-all)');
reset role;

-- fluxo de expedicao como service (postgres) ---------------------------------
do $$
declare
  v_cli uuid;
  v_ped uuid;
  v_ent uuid;
begin
  insert into customers (tenant_id, name, email)
  values ('00000000-0000-0000-0000-000000000001', 'Cliente Expedicao',
          'cliente-exp-0016@x.com')
  returning id into v_cli;
  insert into orders (tenant_id, customer_id, total_amount, origem, etapa)
  values ('00000000-0000-0000-0000-000000000001', v_cli, 100, 'erp', 'venda')
  returning id into v_ped;
  insert into entregas (tenant_id, order_id, endereco)
  values ('00000000-0000-0000-0000-000000000001', v_ped,
          '{"rua": "Rua A"}'::jsonb)
  returning id into v_ent;
  insert into entrega_eventos (tenant_id, entrega_id, de_status, para_status)
  values ('00000000-0000-0000-0000-000000000001', v_ent, null, 'aguardando');
  update entregas
     set status = 'em_transito', enviado_em = now(), updated_at = now()
   where id = v_ent;
  insert into entrega_eventos (tenant_id, entrega_id, de_status, para_status,
                              nota)
  values ('00000000-0000-0000-0000-000000000001', v_ent, 'aguardando',
          'em_transito', 'saio para entrega');
end $$;

insert into _out
  select is(
    (select count(*) from entregas
      where status = 'em_transito' and enviado_em is not null),
    1::bigint, 'entrega muda para em_transito com enviado_em');
insert into _out
  select is(
    (select count(*) from entrega_eventos
      where para_status = 'em_transito'
        and nota = 'saio para entrega'),
    1::bigint, 'evento guarda a transicao com nota');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
from _out;
rollback;
