-- Rollback 0013 (destrutivo - laboratorio). Desfaz identificadores
-- fiscais e a emitente real: tabelas novas, colunas do fiscal e a
-- funcao de validacao de GTIN.
begin;
drop table if exists sefaz_config;
drop table if exists tenant_company;
alter table item_fiscal_data drop constraint if exists item_fiscal_data_gtin_check;
alter table item_fiscal_data drop constraint if exists item_fiscal_data_origem_check;
alter table item_fiscal_data drop constraint if exists item_fiscal_data_unit_check;
drop index if exists item_fiscal_data_gtin_key;
alter table item_fiscal_data
  drop column if exists gtin,
  drop column if exists cest,
  drop column if exists origem,
  drop column if exists unit,
  drop column if exists weight_gross_kg;
drop function if exists ean_dv_valido(text);
commit;
