-- Teste da migration 0023 - roda dentro de begin;...rollback;
-- Cobre a correcao de faturamento e a entrada de despesas no diario:
--   * trigger de expenses existe e e ADIADO (constraint, initially deferred);
--   * despesa paga credita CAIXA, despesa em aberto credita FORNECEDOR;
--   * competencia vem da propria linha (expenses.competencia), nao do relogio;
--   * conta de grupo (nao folha) e barrada com erro claro;
--   * pedido que NASCE em 'processando' (origem erp) agora fatura - era o
--     buraco que deixava pedido de integracao fora do DRE para sempre;
--   * 'aguardando_pagamento' continua fora, 'cancelado' direto nao lanca,
--     cancelamento depois de faturar estorna.
-- Nao da para exercitar o gatilho ADIADO aqui: ele so roda no COMMIT e este
-- teste termina em rollback. Chamamos as mesmas funcoes que o gatilho chama -
-- a diferenca e apenas QUANDO elas rodam. O disparo real e coberto pelo
-- e2e/dre.cjs.
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

-- o trigger de despesa esta registrado e adiado --------------------------------
insert into _out
  select ok(
    exists(select 1 from pg_trigger where tgname = 'trg_post_expense_accounting'),
    'trg_post_expense_accounting existe');

insert into _out
  select ok(
    exists(select 1 from pg_trigger
            where tgname = 'trg_post_expense_accounting'
              and tgdeferrable and tginitdeferred),
    'trigger de despesa e constraint trigger adiada');

-- fixtures --------------------------------------------------------------------
create temp table _exp (id uuid default gen_random_uuid());
create temp table _exp2 (id uuid default gen_random_uuid());
create temp table _exp3 (id uuid default gen_random_uuid());
create temp table _cli (id uuid default gen_random_uuid());
create temp table _item (id uuid default gen_random_uuid());
create temp table _ped (id uuid default gen_random_uuid());
create temp table _esp (id uuid default gen_random_uuid());
create temp table _can (id uuid default gen_random_uuid());

insert into _exp default values;
insert into _exp2 default values;
insert into _exp3 default values;
insert into _cli default values;
insert into _item default values;
insert into _ped default values;
insert into _esp default values;
insert into _can default values;

-- despesa PAGA no mes de referencia --------------------------------------------
insert into expenses (id, tenant_id, competencia, description, account_code,
                      amount, paid_at)
select id, (select id from _t), date '2026-07-15', 'Aluguel da loja', '6.2.1',
       500, date '2026-07-10'
  from _exp;

select post_expense_accounting((select id from _exp));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'despesa:' || (select id from _exp)),
    1::bigint, 'despesa paga gera exatamente um lancamento');

insert into _out
  select is(
    (select count(*) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'despesa:' || (select id from _exp)),
    2::bigint, 'despesa gera 2 linhas (conta da despesa x credor)');

insert into _out
  select is(
    (select coalesce(sum(l.debit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'despesa:' || (select id from _exp)
        and l.code = '6.2.1'),
    500::numeric, 'conta da despesa e debitada pelo valor');

insert into _out
  select is(
    (select coalesce(sum(l.credit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'despesa:' || (select id from _exp)
        and l.code = '1.1.1'),
    500::numeric, 'despesa paga credita CAIXA (1.1.1)');

insert into _out
  select is(
    (select e.competencia from journal_entries e
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'despesa:' || (select id from _exp)),
    date '2026-07-15', 'competencia vem da linha da despesa, nao de hoje');

select post_expense_accounting((select id from _exp));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'despesa:' || (select id from _exp)),
    1::bigint, 'segunda chamada nao cria outro lancamento (idempotencia)');

-- despesa EM ABERTO ------------------------------------------------------------
insert into expenses (id, tenant_id, competencia, description, account_code,
                      amount, paid_at)
select id, (select id from _t), date '2026-07-20', 'Conta de luz', '6.2.1',
       150, null
  from _exp2;

select post_expense_accounting((select id from _exp2));

insert into _out
  select is(
    (select coalesce(sum(l.credit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'despesa:' || (select id from _exp2)
        and l.code = '2.1.1'),
    150::numeric, 'despesa em aberto credita FORNECEDOR (2.1.1)');

-- conta de grupo na despesa ----------------------------------------------------
insert into expenses (id, tenant_id, competencia, description, account_code, amount)
select id, (select id from _t), date '2026-07-20', 'Conta de grupo', '6.2', 10
  from _exp3;

insert into _out
  select throws_ok(
    $sql$select post_expense_accounting((select id from _exp3))$sql$,
    'P0001',
    'DESPESA_CONTA_NAO_FOLHA: 6.2 nao e conta folha do plano',
    'conta de GRUPO (6.2) e barrada em despesa');

-- pedido que NASCE em processando (origem erp) --------------------------------
insert into customers (id, tenant_id, name, email)
select id, (select id from _t), 'Cliente 0023', 'cliente-0023@teste.local' from _cli;

insert into catalog_items (id, tenant_id, sku, name)
select id, (select id from _t), 'SKU-0023', 'Item 0023' from _item;

insert into item_commercial_data (item_id, cost_price)
select id, 30 from _item;

insert into orders (id, tenant_id, customer_id, channel, status, origem, total_amount)
select id, (select id from _t), (select id from _cli), 'atacado', 'processando', 'erp', 100
  from _ped;

insert into order_items
  (tenant_id, order_id, item_id, sku, name, unit_price, quantity, total)
select (select id from _t), (select id from _ped), (select id from _item),
       'SKU-0023', 'Item 0023', 100, 1, 100
  from _item;

select post_order_accounting((select id from _ped));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'venda:' || (select id from _ped)),
    1::bigint, 'pedido que nasce em processando (origem erp) fatura');

insert into _out
  select is(
    (select coalesce(sum(l.credit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'venda:' || (select id from _ped)
        and l.code = '4.1.1'),
    100::numeric, 'receita creditada em 4.1.1');

insert into _out
  select is(
    (select coalesce(sum(l.debit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'venda:' || (select id from _ped)
        and l.code = '5.1.1'),
    30::numeric, 'CMV debitado em 5.1.1 pelo custo do item');

select post_order_accounting((select id from _ped));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'venda:' || (select id from _ped)),
    1::bigint, 'faturamento tambem e idempotente');

-- cancelar depois de faturado estorna -----------------------------------------
update orders set status = 'cancelado' where id = (select id from _ped);
select post_order_accounting((select id from _ped));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'venda-estorno:' || (select id from _ped)),
    1::bigint, 'cancelamento depois de faturar gera estorno');

-- pedido que so aguarda pagamento NAO fatura -----------------------------------
insert into orders (id, tenant_id, customer_id, channel, status, origem, total_amount)
select id, (select id from _t), (select id from _cli), 'varejo', 'aguardando_pagamento', 'pdv', 70
  from _esp;

insert into order_items
  (tenant_id, order_id, item_id, sku, name, unit_price, quantity, total)
select (select id from _t), (select id from _esp), (select id from _item),
       'SKU-0023', 'Item 0023', 70, 1, 70
  from _item;

select post_order_accounting((select id from _esp));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'venda:' || (select id from _esp)),
    0::bigint, 'aguardando_pagamento NAO gera lancamento');

-- pedido cancelado direto tambem nao lanca nada --------------------------------
insert into orders (id, tenant_id, customer_id, channel, status, origem, total_amount)
select id, (select id from _t), (select id from _cli), 'varejo', 'cancelado', 'pdv', 40
  from _can;

insert into order_items
  (tenant_id, order_id, item_id, sku, name, unit_price, quantity, total)
select (select id from _t), (select id from _can), (select id from _item),
       'SKU-0023', 'Item 0023', 40, 1, 40
  from _item;

select post_order_accounting((select id from _can));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and (idempotency_key = 'venda:' || (select id from _can)
          or idempotency_key = 'venda-estorno:' || (select id from _can))),
    0::bigint, 'cancelado sem faturamento nao lanca nem estorna');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
from _out;
rollback;
