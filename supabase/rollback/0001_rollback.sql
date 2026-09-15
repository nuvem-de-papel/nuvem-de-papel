-- Rollback 0001 — destrutivo, só para banco local descartável (nunca produção).
drop table if exists item_prices;
drop table if exists item_commercial_data;
drop table if exists item_fiscal_data;
drop table if exists catalog_items;
drop type if exists sales_channel;
drop table if exists tenant_branding;
drop table if exists tenants;
