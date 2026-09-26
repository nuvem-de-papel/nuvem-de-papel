-- Teste estrutural 0006 - rodar dentro de begin;...rollback;
begin;
select plan(11);
select has_table('order_items');
select has_table('addresses');
select has_table('webhook_events');
select has_column('orders', 'user_id');
select has_column('orders', 'payment_method');
select has_column('orders', 'address_snapshot');
select has_column('order_items', 'unit_price');
select policies_are('orders', array['le proprios pedidos']);
select policies_are('addresses', array['le proprios enderecos','insere proprio endereco','atualiza proprio endereco','apaga proprio endereco']);
insert into webhook_events (tenant_id, provider, external_id, event_type)
  values ('00000000-0000-0000-0000-000000000001', 'mercadopago', 'evt-1', 'payment');
select throws_ok(
  'insert into webhook_events (tenant_id, provider, external_id, event_type) values (''00000000-0000-0000-0000-000000000001'', ''mercadopago'', ''evt-1'', ''payment'')',
  '23505', null, 'webhook repetido e bloqueado (idempotencia)'
);
set local role authenticated;
select throws_ok(
  'insert into webhook_events (tenant_id, provider, external_id, event_type) values (gen_random_uuid(), ''x'', ''1'', ''y'')',
  '42501', null, 'authenticated nao escreve em webhook_events'
);
reset role;
select * from finish();
rollback;
