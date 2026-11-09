-- 0044_test.sql -- pgTAP. Roda em begin;...rollback; (nada aqui persiste).
begin;
select plan(7);

select has_table('public', 'stock_locations', 'stock_locations deve existir apos 0044');
select has_table('public', 'item_stock_by_location', 'item_stock_by_location deve existir apos 0044');

select has_column('public', 'stock_locations', 'priority',
  'stock_locations.priority deve existir apos 0044');

select has_column('public', 'item_stock_by_location', 'stock_on_hand',
  'item_stock_by_location.stock_on_hand deve existir apos 0044');

select ok(
  (select count(*) from stock_locations where tenant_id = '00000000-0000-0000-0000-000000000001') = 3,
  'seed deve criar os 3 locais (loja/deposito/cd) do tenant Nuvem de Papel'
);

select ok(
  exists (
    select 1 from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'sales_channel' and e.enumlabel = 'web'
  ),
  'sales_channel deve ter o valor web apos 0044'
);

select throws_ok(
  $$ insert into stock_locations (tenant_id, code, name, tipo)
     values ('00000000-0000-0000-0000-000000000001', 'x', 'X', 'inexistente') $$,
  '23514',
  null,
  'tipo de local fora de loja/deposito/cd deve falhar no check'
);

select * from finish();
rollback;
