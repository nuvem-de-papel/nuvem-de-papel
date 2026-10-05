-- Teste da migration 0022 - roda dentro de begin;...rollback;
-- Cobre o Bloco 2 passo 2 (lancamentos automaticos do diario):
--   * os tres gatilhos estao registrados e ADIADOS (so rodam no COMMIT);
--   * venda faturada: receita + CMV, e caixa vs contas a receber conforme
--     existe ou nao titulo do pedido;
--   * idempotencia das chaves venda:/compra:/titulo-*;
--   * cancelamento de pedido faturado gera estorno na competencia corrente;
--   * recebimento de compra: estoque x fornecedor;
--   * liquidacao de titulo a receber e a pagar apontam para o caixa certo;
--   * so FOLHA do plano aceita lancamento (trava em journal_entry_lines).
-- Nao da para exercitar o gatilho ADIADO aqui: ele so roda no COMMIT, e este
-- teste termina em rollback. Chamamos as mesmas funcoes que o gatilho chama -
-- a diferenca e apenas QUANDO elas rodam. O disparo real e coberto pelo
-- e2e/dre.cjs, que passa por commits de verdade.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(28);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;
create temp table _t (id uuid);
insert into _t select id from tenants limit 1;

-- precondicao ----------------------------------------------------------------
insert into _out
  select ok(exists(select 1 from tenants), 'ha ao menos um tenant');

-- fixtures: um cenario inteiro, criado e apagado no rollback -------------------
create temp table _cli (id uuid default gen_random_uuid());
create temp table _item (id uuid default gen_random_uuid());
create temp table _ped (id uuid default gen_random_uuid());
create temp table _forn (id uuid default gen_random_uuid());
create temp table _po (id uuid default gen_random_uuid());
create temp table _rec (id uuid default gen_random_uuid());
create temp table _tit (id uuid default gen_random_uuid());
create temp table _tit2 (id uuid default gen_random_uuid());
create temp table _par (id uuid default gen_random_uuid());
create temp table _par2 (id uuid default gen_random_uuid());

insert into _cli default values;
insert into _item default values;
insert into _ped default values;
insert into _forn default values;
insert into _po default values;
insert into _rec default values;
insert into _tit default values;
insert into _tit2 default values;
insert into _par default values;
insert into _par2 default values;

insert into customers (id, tenant_id, name, email)
select id, (select id from _t), 'Cliente 0022', 'cliente-0022@teste.local' from _cli;

insert into catalog_items (id, tenant_id, sku, name)
select id, (select id from _t), 'SKU-0022', 'Item 0022' from _item;

insert into item_commercial_data (item_id, cost_price)
select id, 30 from _item;

-- pedido faturado: 100,00 com CMV de 60,00 (2 un x 30,00) e SEM titulo
insert into orders (id, tenant_id, customer_id, channel, status, origem, total_amount)
select id, (select id from _t), (select id from _cli), 'varejo', 'pago', 'pdv', 100 from _ped;

insert into order_items
  (tenant_id, order_id, item_id, sku, name, unit_price, quantity, total)
select (select id from _t), (select id from _ped), (select id from _item),
       'SKU-0022', 'Item 0022', 50, 2, 100
  from _item;

insert into suppliers (id, tenant_id, name)
select id, (select id from _t), 'Fornecedor 0022' from _forn;

insert into purchase_orders (id, tenant_id, supplier_id, code, idempotency_key)
select id, (select id from _t), (select id from _forn), 'PO-0022', 'po-0022' from _po;

insert into purchase_receipts
  (id, tenant_id, purchase_order_id, code, status, total, idempotency_key)
select id, (select id from _t), (select id from _po), 'RC-0022', 'postado', 200, 'rc-0022'
  from _rec;

-- estrutura -------------------------------------------------------------------
insert into _out
  select ok(exists(select 1 from pg_proc where proname = 'post_order_accounting'),
            'funcao post_order_accounting existe');

insert into _out
  select ok(exists(select 1 from pg_trigger
                    where tgname = 'trg_post_order_accounting'
                      and tgdeferrable and tginitdeferred
                      and tgrelid = 'public.orders'::regclass),
            'gatilho ADIADO registrado em orders (insert or update)');

insert into _out
  select ok(exists(select 1 from pg_trigger
                    where tgname = 'trg_post_receipt_accounting'
                      and tgdeferrable and tginitdeferred
                      and tgrelid = 'public.purchase_receipts'::regclass),
            'gatilho ADIADO registrado em purchase_receipts');

insert into _out
  select ok(exists(select 1 from pg_trigger
                    where tgname = 'trg_post_settlement_accounting'
                      and tgdeferrable and tginitdeferred
                      and tgrelid = 'public.financial_settlements'::regclass),
            'gatilho ADIADO registrado em financial_settlements');

insert into _out
  select ok(exists(select 1 from pg_trigger
                    where tgname = 'trg_journal_line_leaf'
                      and tgrelid = 'public.journal_entry_lines'::regclass),
            'trava de folha (aceita_lancamento) em journal_entry_lines');

insert into _out
  select ok(has_table_privilege('service_role', 'public.v_dre', 'select'),
            'service_role enxerga a view v_dre (a tela do financeiro depende dela)');

insert into _out
  select ok(not has_function_privilege('anon', 'post_order_accounting(uuid)', 'execute')
            and not has_function_privilege('authenticated', 'post_order_accounting(uuid)', 'execute'),
            'funcoes de lancamento revogadas de anon/authenticated');

-- venda faturada (dinheiro, sem titulo) ---------------------------------------
select post_order_accounting((select id from _ped));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'venda:' || (select id from _ped)),
    1::bigint, 'venda gera exatamente um lancamento');

insert into _out
  select is(
    (select count(*) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'venda:' || (select id from _ped)),
    4::bigint, 'venda sem titulo gera 4 linhas (caixa + receita + cmv + estoque)');

insert into _out
  select is(
    (select coalesce(sum(l.debit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'venda:' || (select id from _ped)),
    (select coalesce(sum(l.credit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'venda:' || (select id from _ped)),
    'lancamento da venda quita (debitos = creditos)');

insert into _out
  select is(
    (select coalesce(sum(l.credit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'venda:' || (select id from _ped)
        and l.code = '4.1.1'),
    100::numeric, 'receita bruta creditada em 4.1.1 pelo total do pedido');

insert into _out
  select is(
    (select coalesce(sum(l.debit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'venda:' || (select id from _ped)
        and l.code = '5.1.1'),
    60::numeric, 'CMV debitado em 5.1.1 (2 un x 30,00 de custo medio)');

insert into _out
  select is(
    (select coalesce(sum(l.debit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'venda:' || (select id from _ped)
        and l.code = '1.1.1'),
    100::numeric, 'sem titulo: o dinheiro debita em CAIXA, nao em contas a receber');

select post_order_accounting((select id from _ped));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'venda:' || (select id from _ped)),
    1::bigint, 'segunda chamada nao cria outro lancamento (idempotencia)');

-- venda cancelada depois de faturada -> estorno -------------------------------
update orders set status = 'cancelado' where id = (select id from _ped);
select post_order_accounting((select id from _ped));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'venda-estorno:' || (select id from _ped)),
    1::bigint, 'cancelamento apos faturamento gera estorno');

insert into _out
  select is(
    (select coalesce(sum(l.debit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'venda-estorno:' || (select id from _ped)
        and l.code = '4.1.1'),
    100::numeric, 'estorno reverte a receita (4.1.1 vira debito)');

-- recebimento de compra -------------------------------------------------------
select post_purchase_receipt_accounting((select id from _rec));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'compra:' || (select id from _rec)),
    1::bigint, 'recebimento de compra gera exatamente um lancamento');

insert into _out
  select is(
    (select count(*) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'compra:' || (select id from _rec)),
    2::bigint, 'compra gera 2 linhas (estoque x fornecedor)');

insert into _out
  select is(
    (select coalesce(sum(l.debit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'compra:' || (select id from _rec)
        and l.code = '1.1.3'),
    200::numeric, 'mercadoria em estoque debitada pelo total da nota');

insert into _out
  select is(
    (select coalesce(sum(l.credit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'compra:' || (select id from _rec)
        and l.code = '2.1.1'),
    200::numeric, 'fornecedor creditado pelo total da nota');

select post_purchase_receipt_accounting((select id from _rec));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'compra:' || (select id from _rec)),
    1::bigint, 'recebimento de compra tambem e idempotente');

-- liquidacao de titulo A RECEBER ------------------------------------------------
insert into financial_titles
  (id, tenant_id, code, direction, principal_amount, due_date,
   source_type, source_id, idempotency_key)
select id, (select id from _t), 'TIT-0022-REC', 'receivable', 100, current_date + 30,
       'pdv', (select id from _ped), 'tit-0022-rec'
  from _tit;

insert into financial_installments
  (id, tenant_id, title_id, number, due_date, principal_amount)
select id, (select id from _t), (select id from _tit), 1, current_date + 30, 100
  from _par;

insert into financial_settlements
  (id, tenant_id, installment_id, amount, method, idempotency_key)
select id, (select id from _t), (select id from _par), 50, 'pix', 'liq-0022-rec'
  from _par;

select post_settlement_accounting((select id from _par));

insert into _out
  select is(
    (select count(*) from journal_entries
      where tenant_id = (select id from _t)
        and idempotency_key = 'titulo-liquidacao:' || (select id from _par)),
    1::bigint, 'liquidacao de titulo a receber gera lancamento');

insert into _out
  select is(
    (select coalesce(sum(l.debit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'titulo-liquidacao:' || (select id from _par)
        and l.code = '1.1.1'),
    50::numeric, 'valor recebido entra no caixa (debita 1.1.1)');

insert into _out
  select is(
    (select coalesce(sum(l.credit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'titulo-liquidacao:' || (select id from _par)
        and l.code = '1.1.2'),
    50::numeric, 'liquidacao baixa o titulo (credita contas a receber)');

-- liquidacao de titulo A PAGAR ---------------------------------------------------
insert into financial_titles
  (id, tenant_id, code, direction, principal_amount, due_date,
   source_type, source_id, idempotency_key)
select id, (select id from _t), 'TIT-0022-PAG', 'payable', 80, current_date + 15,
       'purchase_receipt', (select id from _rec), 'tit-0022-pag'
  from _tit2;

insert into financial_installments
  (id, tenant_id, title_id, number, due_date, principal_amount)
select id, (select id from _t), (select id from _tit2), 1, current_date + 15, 80
  from _par2;

insert into financial_settlements
  (id, tenant_id, installment_id, amount, method, idempotency_key)
select id, (select id from _t), (select id from _par2), 80, 'pix', 'liq-0022-pag'
  from _par2;

select post_settlement_accounting((select id from _par2));

insert into _out
  select is(
    (select coalesce(sum(l.debit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'titulo-liquidacao:' || (select id from _par2)
        and l.code = '2.1.1'),
    80::numeric, 'pagamento baixa o fornecedor (debita 2.1.1)');

insert into _out
  select is(
    (select coalesce(sum(l.credit), 0) from journal_entry_lines l
       join journal_entries e on e.id = l.entry_id
      where e.tenant_id = (select id from _t)
        and e.idempotency_key = 'titulo-liquidacao:' || (select id from _par2)
        and l.code = '1.1.1'),
    80::numeric, 'pagamento tira do caixa (credita 1.1.1)');

-- conta de grupo nao pode receber lancamento -----------------------------------
insert into _out
  select throws_ok(
    $sql$insert into journal_entry_lines (entry_id, tenant_id, code, debit, credit)
         select id, (select id from _t), '4.1', 1, 0 from journal_entries
          where tenant_id = (select id from _t)
            and idempotency_key = 'venda:' || (select id from _ped)$sql$,
    'P0001',
    'DIARIO_CONTA_NAO_FOLHA: 4.1 nao aceita lancamento direto',
    'conta de GRUPO (4.1) e barrada: so folha aceita lancamento');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
from _out;
rollback;
