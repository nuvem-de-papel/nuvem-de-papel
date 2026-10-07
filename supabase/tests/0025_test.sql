-- Teste da migration 0025 - roda dentro de begin;...rollback;
-- Cobre o Bloco 6 (checkout web -> titulo a receber):
--   * o gatilho so existe para orders.origem = 'loja';
--   * pagamento gera 1 titulo receivable 'web' + 1 parcela, idempotente;
--   * vencimento = emissao + 1 dia e a parcela herda o do titulo;
--   * pedido do PDV e pedido de valor 0 ficam de fora;
--   * cancelar sem liquidar cancela titulo e parcela;
--   * cancelar depois de liquidar NAO mexe em nada;
--   * pedido loja ja pago no INSERT (caminho do backfill) tambem ganha titulo;
--   * pedido que JA tem titulo de outra origem (semente) NAO ganha o 2o titulo;
--   * invariante global do 0020: nenhuma tabela de public sem RLS.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(20);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;
create temp table _t (id uuid);
insert into _t select id from tenants limit 1;

-- estrutura ------------------------------------------------------------------
insert into _out
  select ok(exists (select 1 from pg_proc where proname = 'garantir_titulo_web'),
            'funcao garantir_titulo_web existe');
insert into _out
  select ok(exists (select 1 from pg_proc where proname = 'orders_titulo_web'),
            'funcao orders_titulo_web existe');
insert into _out
  select ok(exists (select 1 from pg_trigger
                     where tgrelid = 'public.orders'::regclass
                       and tgname = 'trg_orders_titulo_web'),
            'trigger trg_orders_titulo_web existe');

-- dados de teste (tudo dentro do rollback) -----------------------------------
create temp table _ids (cliente uuid, pedA uuid, pedPdv uuid, pedZero uuid,
                        pedLiq uuid, pedInserido uuid, pedSemente uuid);
insert into _ids values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                         gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                         gen_random_uuid());

insert into customers (id, tenant_id, name, email, tier)
select cliente, (select id from _t), 'Cliente Teste 0025', 'cliente-0025@e2e.test', 'ouro'
  from _ids;

insert into orders (id, tenant_id, customer_id, origem, total_amount, status)
select pedA, (select id from _t), cliente, 'loja', 250.5, 'aguardando_pagamento'
  from _ids;

insert into _out
  select is((select count(*)
               from financial_titles
              where source_id = (select pedA from _ids)),
            0::bigint, 'aguardando_pagamento nao gera titulo');

update orders set status = 'pago' where id = (select pedA from _ids);

insert into _out
  select is((select count(*)
               from financial_titles
              where source_id = (select pedA from _ids)),
            1::bigint, 'pagamento gera exatamente 1 titulo');

insert into _out
  select is((select count(*)
               from financial_titles t
               join _ids i on i.pedA = t.source_id
              where t.tenant_id = (select id from _t)
                and t.source_type = 'web'
                and t.direction = 'receivable'
                and t.status = 'aberto'
                and t.principal_amount = 250.5
                and t.customer_id = i.cliente
                and t.idempotency_key = 'web:' || i.pedA::text),
            1::bigint, 'titulo com origem, direcao, status, valor, cliente e chave');

insert into _out
  select is((select count(*)
               from financial_installments ii
               join financial_titles tt on tt.id = ii.title_id
              where tt.source_id = (select pedA from _ids)
                and ii.tenant_id = (select id from _t)
                and ii.number = 1
                and ii.principal_amount = 250.5),
            1::bigint, 'exatamente 1 parcela com o principal do pedido');

insert into _out
  select is((select tt.due_date - tt.issue_date
               from financial_titles tt
              where tt.source_id = (select pedA from _ids)),
            1::int, 'vencimento = emissao + 1 dia');

insert into _out
  select is((select ii.due_date
               from financial_installments ii
               join financial_titles tt on tt.id = ii.title_id
              where tt.source_id = (select pedA from _ids)),
            (select tt.due_date
               from financial_titles tt
              where tt.source_id = (select pedA from _ids)),
            'parcela herda o vencimento do titulo');

update orders set status = 'processando' where id = (select pedA from _ids);
update orders set status = 'em_rota' where id = (select pedA from _ids);

insert into _out
  select is((select count(*)
               from financial_titles
              where source_id = (select pedA from _ids)),
            1::bigint, 'reprocessar os status nao cria o 2o titulo');

insert into _out
  select is((select count(*)
               from financial_installments ii
               join financial_titles tt on tt.id = ii.title_id
              where tt.source_id = (select pedA from _ids)),
            1::bigint, 'reprocessar os status nao cria a 2a parcela');

-- o PDV ja grava o titulo dele dentro de pdv_register_sale (0015:311)
insert into orders (id, tenant_id, customer_id, origem, total_amount, status)
select pedPdv, (select id from _t), cliente, 'pdv', 100, 'pago' from _ids;

insert into _out
  select is((select count(*)
               from financial_titles
              where source_id = (select pedPdv from _ids)),
            0::bigint, 'pedido pdv nao ganha titulo web');

-- principal_amount > 0 e regra da propria tabela
insert into orders (id, tenant_id, customer_id, origem, total_amount, status)
select pedZero, (select id from _t), cliente, 'loja', 0, 'aguardando_pagamento' from _ids;

update orders set status = 'pago' where id = (select pedZero from _ids);

insert into _out
  select is((select count(*)
               from financial_titles
              where source_id = (select pedZero from _ids)),
            0::bigint, 'pedido de valor 0 nao gera titulo');

-- cancelamento sem nada liquidado: titulo e parcela saem ---------------------
update orders set status = 'cancelado' where id = (select pedA from _ids);

insert into _out
  select is((select status::text
               from financial_titles
              where source_id = (select pedA from _ids)),
            'cancelado'::text, 'cancelar sem liquidacao cancela o titulo');

insert into _out
  select is((select ii.status::text
               from financial_installments ii
               join financial_titles tt on tt.id = ii.title_id
              where tt.source_id = (select pedA from _ids)),
            'cancelado'::text, 'cancelar sem liquidacao cancela a parcela');

-- cancelamento depois de liquidar: dinheiro que entrou fica na trilha --------
insert into orders (id, tenant_id, customer_id, origem, total_amount, status)
select pedLiq, (select id from _t), cliente, 'loja', 99.9, 'aguardando_pagamento' from _ids;

update orders set status = 'pago' where id = (select pedLiq from _ids);

update financial_installments
   set paid_amount = principal_amount,
       status = 'liquidado',
       settled_at = now()
 where title_id = (select id from financial_titles
                    where source_id = (select pedLiq from _ids));

update financial_titles
   set status = 'liquidado'
 where source_id = (select pedLiq from _ids);

update orders set status = 'cancelado' where id = (select pedLiq from _ids);

insert into _out
  select is((select status::text
               from financial_titles
              where source_id = (select pedLiq from _ids)),
            'liquidado'::text, 'cancelar depois de liquidar preserva o titulo');

insert into _out
  select is((select ii.status::text
               from financial_installments ii
               join financial_titles tt on tt.id = ii.title_id
              where tt.source_id = (select pedLiq from _ids)),
            'liquidado'::text, 'cancelar depois de liquidar preserva a parcela');

-- INSERT direto ja pago: e o caminho do backfill da propria migration --------
insert into orders (id, tenant_id, customer_id, origem, total_amount, status)
select pedInserido, (select id from _t), cliente, 'loja', 75, 'pago' from _ids;

insert into _out
  select is((select count(*)
               from financial_titles
              where source_id = (select pedInserido from _ids)),
            1::bigint, 'pedido loja ja pago ganha titulo no INSERT');

-- pedido que JA tem titulo de outra origem nao ganha o 2o titulo --------------
-- e o caso da producao real: a semente de demonstracao gravou titulo para 3
-- pedidos pagos do checkout com a chave dela e o backfill queria imprimir o
-- segundo - o /financeiro teria contado o mesmo dinheiro duas vezes.
insert into orders (id, tenant_id, customer_id, origem, total_amount, status)
select pedSemente, (select id from _t), cliente, 'loja', 60, 'aguardando_pagamento'
  from _ids;

insert into financial_titles (tenant_id, code, direction, status, principal_amount,
                              issue_date, due_date, source_type, source_id,
                              idempotency_key)
select (select id from _t), 'FIN-SEED-0025', 'receivable', 'aberto', 60,
       current_date, current_date + 30, 'web', pedSemente, 'seed-0025'
  from _ids;

update orders set status = 'pago' where id = (select pedSemente from _ids);

insert into _out
  select is((select count(*)
               from financial_titles
              where source_id = (select pedSemente from _ids)),
            1::bigint, 'pedido com titulo de outra origem nao ganha o 2o titulo');

-- invariante global do 0020 --------------------------------------------------
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
