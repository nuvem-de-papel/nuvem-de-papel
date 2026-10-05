-- Teste da migration 0024 - roda dentro de begin;...rollback;
-- Cobre o Bloco 5 passo 1 (vendedores e comissao):
--   * tabela sellers + RLS ligada;
--   * orders.seller_id com FK para sellers e on delete set null;
--   * view v_comissao fecha base * pct / 100 em toda linha;
--   * regras de coluna (pct 0-100, documento CPF/CNPJ, nome unico por tenant);
--   * a view e interna (anon/authenticated nao leem);
--   * invariante global do 0020: nenhuma tabela de public sem RLS.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(18);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;
create temp table _t (id uuid);
insert into _t select id from tenants limit 1;

-- estrutura ------------------------------------------------------------------
insert into _out
  select ok(to_regclass('public.sellers') is not null, 'sellers existe');
insert into _out
  select ok(exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'orders'
              and column_name = 'seller_id'), 'orders.seller_id existe');
insert into _out
  select ok(exists (
           select 1 from pg_constraint
            where conrelid = 'public.orders'::regclass
              and confrelid = 'public.sellers'::regclass
              and pg_get_constraintdef(oid) ilike '%set null%'),
            'FK orders -> sellers e on delete set null');
insert into _out
  select ok(to_regclass('public.v_comissao') is not null, 'v_comissao existe');

-- RLS ------------------------------------------------------------------------
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relname = 'sellers'
                and c.relrowsecurity), 1::bigint, 'RLS ligada em sellers');
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind in ('r', 'p')
                and not c.relrowsecurity),
            0::bigint, 'nenhuma tabela de public sem RLS');

-- colunas de sellers ---------------------------------------------------------
with novo as (
  insert into sellers (tenant_id, name, commission_pct)
  values ((select id from _t), 'Vendedor Teste 0024', 5)
  returning id
)
insert into _out
  select ok(exists (select 1 from novo), 'seller valido e inserido');

insert into _out
  select throws_ok(
    $$insert into sellers (tenant_id, name, commission_pct)
      values ((select id from _t), 'Pct Fora', 101)$$,
    '23514', null,
    'commission_pct acima de 100 e recusado');
insert into _out
  select throws_ok(
    $$insert into sellers (tenant_id, name, commission_pct)
      values ((select id from _t), 'Pct Negativo', -1)$$,
    '23514', null,
    'commission_pct negativo e recusado');
insert into _out
  select throws_ok(
    $$insert into sellers (tenant_id, name, documento)
      values ((select id from _t), 'Doc Torto', 'ABC123')$$,
    '23514', null,
    'documento que nao e CPF/CNPJ e recusado');
insert into _out
  select throws_ok(
    $$insert into sellers (tenant_id, name)
      values ((select id from _t), 'Vendedor Teste 0024')$$,
    '23505', null,
    'nome repetido no mesmo tenant e recusado');
with apagado as (
  delete from sellers
   where tenant_id = (select id from _t)
     and name = 'Vendedor Teste 0024'
  returning id
)
insert into _out
  select ok((select count(*) from apagado) = 1, 'seller removido');

-- comissao -------------------------------------------------------------------
insert into _out
  select is((select count(*)
               from v_comissao
              where comissao is null
                 or comissao is distinct from round(base * pct / 100.0, 2)),
            0::bigint, 'toda linha de v_comissao fecha base * pct / 100');

-- caminho feliz: pedido faturado + vendedor => comissao de 5% sobre 100.
-- Tudo dentro do rollback: os gatilhos de diario (0022) sao deferred e o
-- rollback os descarta antes de executar. Ids fixos em temp table para poder
-- encadear as tres escritas em statements separados.
create temp table _ids (seller uuid, cliente uuid, pedido uuid);
insert into _ids values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into sellers (id, tenant_id, name, commission_pct)
select seller, (select id from _t), 'Vendedor Comissao 0024', 5 from _ids;

insert into customers (id, tenant_id, name, email, tier)
select cliente, (select id from _t), 'Cliente Teste 0024', 'cliente-0024@e2e.test', 'ouro'
  from _ids;

insert into orders (id, tenant_id, customer_id, seller_id, total_amount, status)
select pedido, (select id from _t), cliente, seller, 100, 'pago' from _ids;

insert into _out
  select is((select count(*)
               from v_comissao
              where tenant_id = (select id from _t)
                and seller_id = (select seller from _ids)),
            1::bigint, 'pedido faturado entra na comissao');
insert into _out
  select is((select comissao
               from v_comissao
              where tenant_id = (select id from _t)
                and seller_id = (select seller from _ids)),
            5::numeric, 'comissao = 5% de 100');

-- a view e interna -----------------------------------------------------------
insert into _out
  select ok(not has_table_privilege('anon', 'public.v_comissao', 'SELECT'),
            'anon nao le v_comissao');
insert into _out
  select ok(not has_table_privilege('authenticated', 'public.v_comissao', 'SELECT'),
            'authenticated nao le v_comissao');

-- apagar vendedor nao apaga o historico --------------------------------------
insert into _out
  select ok(exists (
           select 1 from pg_constraint
            where conrelid = 'public.orders'::regclass
              and conname = 'orders_seller_id_fkey'
              and pg_get_constraintdef(oid) ilike '%set null%'),
            'apagar vendedor mantem o pedido (set null)');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas,
       coalesce(string_agg(case when line like 'not ok%' then line end, ' || '), '') as detalhes
from _out;
rollback;
