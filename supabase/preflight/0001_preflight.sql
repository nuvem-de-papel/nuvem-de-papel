-- Preflight 0001 — checagem somente leitura antes de aplicar.
-- Espera-se: nenhuma das tabelas abaixo existe ainda em staging.
select
  (select count(*) from information_schema.tables where table_name = 'tenants') as tenants_exists,
  (select count(*) from information_schema.tables where table_name = 'tenant_branding') as tenant_branding_exists,
  (select count(*) from information_schema.tables where table_name = 'catalog_items') as catalog_items_exists,
  (select count(*) from information_schema.tables where table_name = 'item_fiscal_data') as item_fiscal_data_exists,
  (select count(*) from information_schema.tables where table_name = 'item_commercial_data') as item_commercial_data_exists,
  (select count(*) from information_schema.tables where table_name = 'item_prices') as item_prices_exists;
-- Todas devem retornar 0 antes de aplicar 0001 pela primeira vez.
