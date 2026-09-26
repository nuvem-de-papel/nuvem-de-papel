-- Teste estrutural 0007 - roda dentro de begin;...rollback;
-- Cobre: tabelas/policies, ledger (entrada/reserva/settle idempotente/
-- release/devolucao), trava de saldo, imutabilidade do histórico,
-- transição de status, item sem controle e permissões.
begin;
select plan(28);

select has_table('item_stock');
select has_table('stock_movements');
select has_table('item_stock_public');
select has_column('item_stock', 'stock_available');
select has_column('item_stock', 'stock_on_hand');
select policies_are('item_stock', array['le estoque (operacional)']);
select policies_are('stock_movements', array['le movimentos de estoque (operacional)']);
select policies_are('item_stock_public', array['estoque publico (vitrine)']);

-- seed ------------------------------------------------------------------
insert into customers (id, tenant_id, name, email)
values ('aaaaaaaa-0000-4000-8000-000000000003',
        '00000000-0000-0000-0000-000000000001', 'Cliente Estoque', 'estoque-teste@exemplo.com');

insert into catalog_items (id, tenant_id, sku, name)
values ('aaaaaaaa-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000001', 'SKU-EST-A', 'Item A controle'),
       ('aaaaaaaa-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000001', 'SKU-EST-B', 'Item B sem controle');

insert into orders (id, tenant_id, customer_id, status, total_amount)
values ('aaaaaaaa-0000-4000-8000-000000000004',
        '00000000-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-4000-8000-000000000003', 'aguardando_pagamento', 300),
       ('aaaaaaaa-0000-4000-8000-000000000005',
        '00000000-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-4000-8000-000000000003', 'aguardando_pagamento', 200);

insert into order_items (tenant_id, order_id, item_id, sku, name, unit_price, quantity, total)
values ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000004',
        'aaaaaaaa-0000-4000-8000-000000000001', 'SKU-EST-A', 'Item A controle', 100, 3, 300),
       ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000005',
        'aaaaaaaa-0000-4000-8000-000000000001', 'SKU-EST-A', 'Item A controle', 100, 2, 200);

-- entrada ---------------------------------------------------------------
select register_stock_movement('aaaaaaaa-0000-4000-8000-000000000001',
  'entrada', 10, 'manual', null, 'seed do teste', null);
select is((select stock_available from item_stock
            where item_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          10, 'entrada cria a linha com 10 disponiveis');
select is((select stock_on_hand from item_stock
            where item_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          10, 'entrada reflete no fisico');

-- reserva do pedido A (3un) --------------------------------------------
select reserve_order_stock('aaaaaaaa-0000-4000-8000-000000000004');
select is((select stock_available from item_stock
            where item_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          7, 'reserva derruba o disponivel');
select is((select stock_on_hand from item_stock
            where item_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          10, 'reserva nao mexe no fisico');

select throws_ok(
  $q$select register_stock_movement('aaaaaaaa-0000-4000-8000-000000000001', 'reserva', 99, 'order', null, null, null)$q$,
  'P0001', null, 'reserva acima do saldo e bloqueada'
);

-- settle (pagou) --------------------------------------------------------
select settle_order_stock('aaaaaaaa-0000-4000-8000-000000000004');
select is((select stock_on_hand from item_stock
            where item_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          7, 'settle baixa o fisico (venda) e encerra a reserva');
select settle_order_stock('aaaaaaaa-0000-4000-8000-000000000004');
select is((select stock_on_hand from item_stock
            where item_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          7, 'settle repetido nao desconta em dobro (idempotente)');

-- cancelar antes de pagar (pedido B) ------------------------------------
select reserve_order_stock('aaaaaaaa-0000-4000-8000-000000000005');
select is((select stock_available from item_stock
            where item_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          5, 'segunda reserva consome saldo');
select release_order_stock('aaaaaaaa-0000-4000-8000-000000000005');
select is((select stock_available from item_stock
            where item_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          7, 'cancelamento antes do pagamento devolve a reserva');

-- estorno depois de pagar (pedido A ja teve venda) ----------------------
select release_order_stock('aaaaaaaa-0000-4000-8000-000000000004');
select is((select stock_available from item_stock
            where item_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          10, 'cancelamento pos-pagamento devolve via devolucao');

-- imutabilidade do ledger ----------------------------------------------
select throws_ok(
  'update stock_movements set quantity = 1 where quantity is not null',
  'P0001', null, 'ledger bloqueia UPDATE'
);
select throws_ok(
  'delete from stock_movements',
  'P0001', null, 'ledger bloqueia DELETE'
);

-- transicoes de status do pedido ---------------------------------------
select lives_ok(
  $q$update orders set status = 'pago' where id = 'aaaaaaaa-0000-4000-8000-000000000004'$q$,
  'aguardando_pagamento -> pago e valida'
);
select throws_ok(
  $q$update orders set status = 'entregue' where id = 'aaaaaaaa-0000-4000-8000-000000000004'$q$,
  'P0001', null, 'pago -> entregue direto e invalido'
);

-- item sem controle de estoque (sem linha em item_stock) ----------------
select is(
  (select register_stock_movement('aaaaaaaa-0000-4000-8000-000000000002',
     'reserva', 5, 'order', null, null, null)->>'controlled'),
  'false', 'item sem controle ignora reserva (ilimitado)');
select is(
  (select count(*) from item_stock
    where item_id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  0::bigint, 'item sem controle nao ganha linha so por reserva');

-- permissoes ------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $q$select register_stock_movement('aaaaaaaa-0000-4000-8000-000000000001', 'entrada', 1, null, null, null, null)$q$,
  '42501', null, 'authenticated nao executa funcoes de estoque'
);
select is(
  (select count(*) from stock_movements), 0::bigint,
  'authenticated sem perfil operacional nao le o ledger'
);
select is(
  (select count(*) from item_stock), 0::bigint,
  'authenticated sem perfil operacional nao le o estoque interno'
);
reset role;

set local role anon;
select is(
  (select count(*) from item_stock_public), 1::bigint,
  'anon le a vitrine publica de estoque'
);
reset role;

select * from finish();
rollback;
