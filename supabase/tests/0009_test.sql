-- Teste estrutural 0009 - roda dentro de begin;...rollback;
-- Cobre: item_prices (PK nova + vigência + RLS segmentado), resolve_price
-- (faixa/fallback/expirada), PDV com resolve_price, status pendente, source_type
-- purchase_receipt, tabelas de compras + RLS, purchase_receive (entrada de
-- estoque, título a pagar, idempotência, trava de quantidade) e permissões.
begin;
select plan(49);

select has_table('suppliers');
select has_table('purchase_orders');
select has_table('purchase_order_items');
select has_table('purchase_receipts');
select has_table('purchase_receipt_items');
select has_column('item_prices', 'valid_from');
select has_column('item_prices', 'valid_until');
select has_function('resolve_price');
select has_function('purchase_receive');
select policies_are('item_prices', array['item_prices_public_read']);
select policies_are('suppliers', array['le fornecedores (gestao)']);
select policies_are('purchase_orders', array['le pedidos de compra (gestao)']);
select policies_are('purchase_order_items', array['le itens de compra (gestao)']);
select policies_are('purchase_receipts', array['le notas de recebimento (gestao)']);
select policies_are('purchase_receipt_items', array['le itens de recebimento (gestao)']);
select is(
  (select count(*) from pg_constraint
    where conrelid = 'item_prices'::regclass
      and conname = 'item_prices_pkey'
      and pg_get_constraintdef(oid) like '%valid_from%'),
  1::bigint, 'PK nova de item_prices cobre valid_from');
select is(
  (select count(*) from pg_constraint
    where conrelid = 'profiles'::regclass
      and conname = 'profiles_status_check'
      and pg_get_constraintdef(oid) like '%pendente%'),
  1::bigint, 'profiles aceita status pendente');
select is(
  (select count(*) from pg_constraint
    where conrelid = 'financial_titles'::regclass
      and conname = 'financial_titles_source_type_check'
      and pg_get_constraintdef(oid) like '%purchase_receipt%'),
  1::bigint, 'source_type aceita purchase_receipt');

-- seed ------------------------------------------------------------------
insert into catalog_items (id, tenant_id, sku, name)
values ('10000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000001', 'SKU-F6-A', 'Item F6 A'),
       ('10000000-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000001', 'SKU-F6-B', 'Item F6 B sem preco');

insert into item_prices (item_id, channel, price, min_quantity, valid_from, valid_until)
values ('10000000-0000-4000-8000-000000000001', 'varejo', 50, 1,
        '1970-01-01T00:00:00Z', null),
       ('10000000-0000-4000-8000-000000000001', 'varejo', 40, 10,
        '1970-01-01T00:00:00Z', null),
       ('10000000-0000-4000-8000-000000000001', 'varejo', 10, 1,
        '2024-01-01T00:00:00Z', '2024-06-01T00:00:00Z'),
       ('10000000-0000-4000-8000-000000000001', 'atacado', 45, 1,
        '1970-01-01T00:00:00Z', null),
       ('10000000-0000-4000-8000-000000000001', 'atacado', 35, 10,
        '1970-01-01T00:00:00Z', null);

select register_stock_movement('10000000-0000-4000-8000-000000000001',
  'entrada', 30, 'manual', null, 'seed do teste', null);

-- resolve_price ----------------------------------------------------------
select is(resolve_price('10000000-0000-4000-8000-000000000001', 'varejo', 1),
  50::numeric, 'varejo base (ignora faixa expirada)');
select is(resolve_price('10000000-0000-4000-8000-000000000001', 'varejo', 10),
  40::numeric, 'varejo aplica faixa 10+');
select is(resolve_price('10000000-0000-4000-8000-000000000001', 'varejo', 9),
  50::numeric, 'varejo abaixo da faixa usa base');
select is(resolve_price('10000000-0000-4000-8000-000000000001', 'atacado', 1),
  45::numeric, 'atacado base');
select is(resolve_price('10000000-0000-4000-8000-000000000001', 'atacado', 10),
  35::numeric, 'atacado aplica faixa 10+');
select is(resolve_price('10000000-0000-4000-8000-000000000001', 'atacado', 9),
  45::numeric, 'atacado abaixo da faixa usa base do canal');
select is(resolve_price('10000000-0000-4000-8000-000000000002', 'varejo', 1),
  null, 'item sem preco devolve null');

-- RLS de precos ----------------------------------------------------------
set local role anon;
select is((select count(*) from item_prices where channel = 'atacado'),
  0::bigint, 'anon nao le precos de atacado');
select is((select count(*) from item_prices
            where channel = 'varejo'
              and item_id = '10000000-0000-4000-8000-000000000001'),
  3::bigint, 'anon le precos de varejo');
reset role;

-- PDV usa resolve_price --------------------------------------------------
select is((pdv_open_cash(100, null, 'teste-f6-abertura-0001') ->> 'duplicate')::boolean,
  false, 'caixa abre para a venda de teste');
select is(
  (pdv_register_sale(
    '[{"item_id":"10000000-0000-4000-8000-000000000001","quantity":10}]',
    'dinheiro', 'atacado', 1, null, 'teste-f6-venda-0001') ->> 'total')::numeric,
  350::numeric, 'venda PDV no atacado resolve a faixa 10+ (35 x 10)');
select is((select stock_available from item_stock
            where item_id = '10000000-0000-4000-8000-000000000001'),
  20, 'venda PDV baixa o estoque direto');
select is((select status from orders where idempotency_key = 'teste-f6-venda-0001'),
  'pago', 'pedido do PDV nasce pago');

-- compras ----------------------------------------------------------------
insert into suppliers (id, tenant_id, name)
values ('20000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000001', 'Fornecedor F6');
insert into purchase_orders (id, tenant_id, supplier_id, code, idempotency_key)
values ('20000000-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        '20000000-0000-4000-8000-000000000001', 'PC-F6-0001', 'teste-po-f6-0001');
insert into purchase_order_items
  (id, tenant_id, purchase_order_id, item_id, sku_snapshot, name_snapshot,
   quantity, unit_cost, line_total)
values ('20000000-0000-4000-8000-000000000003',
        '00000000-0000-0000-0000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000001', 'SKU-F6-A', 'Item F6 A',
        10, 20, 200);

select is((select count(*) from suppliers), 1::bigint, 'fornecedor de teste criado');
select is((select count(*) from purchase_orders), 1::bigint, 'pedido de compra criado');
select is((select count(*) from purchase_order_items), 1::bigint, 'item do pedido criado');

select is(
  (purchase_receive(
    '20000000-0000-4000-8000-000000000002',
    '[{"purchase_order_item_id":"20000000-0000-4000-8000-000000000003","quantity":4}]',
    'teste-f6-receb-0001') ->> 'duplicate')::boolean,
  false, 'recebimento parcial registrado');
select is((select stock_available from item_stock
            where item_id = '10000000-0000-4000-8000-000000000001'),
  24, 'entrada de compra soma +4 no estoque');
select is((select status from purchase_orders
            where id = '20000000-0000-4000-8000-000000000002'),
  'parcial', 'PO parcial com 4 de 10 recebidos');
select is((select total from purchase_receipts
            where idempotency_key = 'teste-f6-receb-0001'),
  80::numeric, 'nota soma quantidade x custo (4 x 20)');
select is(
  (select count(*) from financial_titles
    where direction = 'payable' and source_type = 'purchase_receipt'
      and status = 'aberto'),
  1::bigint, 'recebimento gera titulo a pagar');
select is(
  (select coalesce(sum(fi.principal_amount), 0)
     from financial_installments fi
     join financial_titles ft on ft.id = fi.title_id
    where ft.direction = 'payable'),
  80::numeric, 'titulo a pagar parcelado 1x somando o principal');
select is(
  (purchase_receive(
    '20000000-0000-4000-8000-000000000002',
    '[{"purchase_order_item_id":"20000000-0000-4000-8000-000000000003","quantity":4}]',
    'teste-f6-receb-0001') ->> 'duplicate')::boolean,
  true, 'mesma chave de recebimento e idempotente');
select throws_ok(
  $q$select purchase_receive('20000000-0000-4000-8000-000000000002',
    '[{"purchase_order_item_id":"20000000-0000-4000-8000-000000000003","quantity":7}]',
    'teste-f6-receb-0002')$q$,
  'P0001', null, 'quantidade acima do pedido bloqueada'
);
select is(
  (purchase_receive(
    '20000000-0000-4000-8000-000000000002',
    '[{"purchase_order_item_id":"20000000-0000-4000-8000-000000000003","quantity":6}]',
    'teste-f6-receb-0003') ->> 'duplicate')::boolean,
  false, 'restante do pedido recebido');
select is((select status from purchase_orders
            where id = '20000000-0000-4000-8000-000000000002'),
  'recebido', 'PO concluido com 10 de 10');
select throws_ok(
  $q$select purchase_receive('20000000-0000-4000-8000-000000000002',
    '[{"purchase_order_item_id":"20000000-0000-4000-8000-000000000003","quantity":1}]',
    'teste-f6-receb-0004')$q$,
  'P0001', null, 'PO ja recebido nao aceita novo recebimento'
);

-- RLS das compras --------------------------------------------------------
set local role authenticated;
select is((select count(*) from purchase_orders), 0::bigint,
  'authenticated sem papel nao le pedidos de compra');
select is((select count(*) from suppliers), 0::bigint,
  'authenticated sem papel nao le fornecedores');
select throws_ok(
  $q$select purchase_receive('20000000-0000-4000-8000-000000000002', '[]', 'teste-perm-f6-0001')$q$,
  '42501', null, 'authenticated nao executa purchase_receive'
);
reset role;

set local role anon;
select throws_ok(
  $q$select purchase_receive('20000000-0000-4000-8000-000000000002', '[]', 'teste-perm-f6-0002')$q$,
  '42501', null, 'anon nao executa purchase_receive'
);
reset role;

select * from finish();
rollback;
