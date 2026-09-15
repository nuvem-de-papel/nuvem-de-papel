-- Teste estrutural 0001 — rodar dentro de begin;...rollback;
begin;
select plan(6);

select has_table('tenants');
select has_table('tenant_branding');
select has_table('catalog_items');
select has_table('item_fiscal_data');
select has_table('item_commercial_data');
select has_table('item_prices');

select * from finish();
rollback;
