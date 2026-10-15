-- 0031_rollback.sql - desfaz os produtos completos + importacao (Bloco 2).
--
-- ATENCAO: apaga a tabela item_supplier_data (dados de embalagem/fornecedor
-- de TODOS os produtos), e remove de catalog_items (fabricante, notes,
-- hide_price_table, last_adjusted_at) e de item_fiscal_data (cst_pis,
-- cst_cofins, icms_base_pct, cst_ibscbs, cclass_trib, gtin_tributavel).
-- A tela de produto volta ao formato anterior (sem campos de embalagem e sem
-- importador). catalog_items/item_fiscal_data em si NAO sao apagados.

drop table if exists item_supplier_data;

alter table catalog_items
  drop column if exists fabricante,
  drop column if exists notes,
  drop column if exists hide_price_table,
  drop column if exists last_adjusted_at;

alter table item_fiscal_data
  drop column if exists cst_pis,
  drop column if exists cst_cofins,
  drop column if exists icms_base_pct,
  drop column if exists cst_ibscbs,
  drop column if exists cclass_trib,
  drop column if exists gtin_tributavel;

alter table item_fiscal_data drop constraint if exists item_fiscal_data_cst_pis_check;
alter table item_fiscal_data drop constraint if exists item_fiscal_data_cst_cofins_check;
alter table item_fiscal_data drop constraint if exists item_fiscal_data_icms_base_pct_check;
alter table item_fiscal_data drop constraint if exists item_fiscal_data_cst_ibscbs_check;
alter table item_fiscal_data drop constraint if exists item_fiscal_data_cclass_trib_check;
alter table item_fiscal_data drop constraint if exists item_fiscal_data_gtin_tributavel_check;
