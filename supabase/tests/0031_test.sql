-- Teste da migration 0031 - roda dentro de begin;...rollback;
-- Produtos completos + importacao por link (Bloco 2):
--   * catalog_items ganhou 4 colunas (fabricante, notes, hide_price_table,
--     last_adjusted_at) - os campos "fantasma" do form;
--   * item_fiscal_data ganhou 6 colunas (cst_pis, cst_cofins, icms_base_pct,
--     cst_ibscbs, cclass_trib, gtin_tributavel);
--   * nova tabela item_supplier_data (item <-> fornecedor + embalagem);
--   * dun14_dv_valido(): DUN-14 tem DV proprio (14 dig), nao confundir com
--     GTIN-13 (ex. master 17891027354944 e valido; raiz ...944 nao e);
--   * cst_pis/cst_cofins/cst_ibscbs = 3 digitos; cclass_trib = 6 digitos;
--   * pack_qty/master_qty >= 1; um supplier_sku por item (unico);
--   * source_type so reval|manual|outro;
--   * RLS ligado com 1 policy de leitura (item ativo);
--   * invariante global 0020: nenhuma tabela de public sem RLS.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(20);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;
create temp table _t (id uuid);
insert into _t select id from tenants limit 1;
create temp table _item (id uuid);

-- precondicao ----------------------------------------------------------------
insert into _out
  select ok(exists(select 1 from tenants), 'ha ao menos um tenant');

insert into _out
  select ok(to_regclass('public.item_supplier_data') is not null,
            'item_supplier_data existe');

-- colunas novas ---------------------------------------------------------------
insert into _out
  select ok((select count(*) from information_schema.columns
              where table_schema = 'public'
                and table_name = 'catalog_items'
                and column_name in ('fabricante','notes','hide_price_table',
                                    'last_adjusted_at')) = 4,
            'as 4 colunas novas existem em catalog_items');

insert into _out
  select ok((select count(*) from information_schema.columns
              where table_schema = 'public'
                and table_name = 'item_fiscal_data'
                and column_name in ('cst_pis','cst_cofins','icms_base_pct',
                                    'cst_ibscbs','cclass_trib',
                                    'gtin_tributavel')) = 6,
            'as 6 colunas novas existem em item_fiscal_data');

-- DUN-14 (validador novo) -------------------------------------------------------
insert into _out
  select ok(dun14_dv_valido('17891027354944'),
            'DUN-14 do master Reval (17891027354944) valida no dv proprio');

insert into _out
  select ok(not dun14_dv_valido('17891027354945'),
            'DUN-14 com dv errado e recusado');

-- RLS ------------------------------------------------------------------------
insert into _out
  select ok((select c.relrowsecurity
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relname = 'item_supplier_data'),
            'RLS ligado em item_supplier_data');

insert into _out
  select ok((select count(*) from pg_policies
              where tablename = 'item_supplier_data') = 1,
            '1 policy: leitura publica so de item ativo');

-- fixture valida (produto completo importado do Reval 114148) --------------------
insert into catalog_items (tenant_id, sku, name, category, fabricante, notes)
select id, 'T0031-PROD', 'Produto 0031', 'Papelaria', 'Tilibra',
       'Capa dura, 160 fls'
  from _t;

insert into _item
  select id from catalog_items where sku = 'T0031-PROD';

insert into item_supplier_data (
  tenant_id, item_id, supplier_sku, manufacturer_ref, supplier_name,
  manufacturer, source_type, source_url, pack_qty, master_qty,
  gtin_inner, gtin_master,
  emb_comprimento_cm, emb_altura_cm, emb_largura_cm, emb_peso_kg,
  master_comprimento_cm, master_altura_cm, master_largura_cm, master_peso_kg,
  details)
select
  (select id from _t), (select id from _item),
  '114148', '354945', 'TILIBRA', 'Tilibra', 'reval',
  'https://www.reval.net/produto/114148', 4, 5,
  '7891027019150', '17891027354944',
  21.5, 6.5, 15.5, 1.39,
  36, 22.5, 16.5, 7.22,
  '{"Capa": "dura", "Folhas": "160"}'::jsonb;

insert into _out
  select ok((select count(*) from item_supplier_data
              where supplier_sku = '114148'
                and pack_qty = 4
                and emb_peso_kg = 1.39
                and master_peso_kg = 7.22
                and gtin_master = '17891027354944') = 1,
            'ficha completa do Reval gravada (embalagem + master + dv)');

insert into _out
  select ok((select count(*) from information_schema.columns
              where table_schema = 'public'
                and table_name = 'item_supplier_data'
                and column_name in ('supplier_id','manufacturer_ref',
                                    'supplier_name','manufacturer',
                                    'source_url','gtin_inner','gtin_master',
                                    'emb_peso_kg','master_peso_kg')
                and is_nullable = 'YES') = 9,
            'campos opcionais da ficha do fornecedor aceitam null');

-- validacoes -------------------------------------------------------------------
insert into _out
  select throws_ok(
    $q$insert into item_supplier_data (tenant_id, item_id, gtin_master)
        values ((select id from _t), (select id from _item), '17891027354945')$q$,
    '23514', null, 'DUN-14 com dv errado e recusado na tabela');

insert into _out
  select throws_ok(
    $q$insert into item_supplier_data (tenant_id, item_id, gtin_inner)
        values ((select id from _t), (select id from _item), '7891027019151')$q$,
    '23514', null, 'gtin_inner com dv errado e recusado');

insert into _out
  select throws_ok(
    $q$insert into item_supplier_data (tenant_id, item_id, pack_qty)
        values ((select id from _t), (select id from _item), 0)$q$,
    '23514', null, 'pack_qty 0 e recusado (>= 1)');

insert into _out
  select throws_ok(
    $q$insert into item_supplier_data (tenant_id, item_id, supplier_sku)
        values ((select id from _t), (select id from _item), '114148')$q$,
    '23505', null, 'supplier_sku duplicado no mesmo item e recusado');

insert into _out
  select throws_ok(
    $q$insert into item_supplier_data (tenant_id, item_id, source_type)
        values ((select id from _t), (select id from _item), 'xyz')$q$,
    '23514', null, 'source_type fora de reval|manual|outro e recusado');

insert into _out
  select throws_ok(
    $q$insert into item_fiscal_data (item_id, cst_pis)
        values ((select id from _item), '001')$q$,
    '23514', null, 'cst_pis com 3 digitos e recusado (e de 2)');

insert into _out
  select throws_ok(
    $q$insert into item_fiscal_data (item_id, cclass_trib)
        values ((select id from _item), '12345')$q$,
    '23514', null, 'cclass_trib com 5 digitos e recusado');

insert into _out
  select throws_ok(
    $q$insert into item_fiscal_data (item_id, icms_base_pct)
        values ((select id from _item), 100.01)$q$,
    '23514', null, 'icms_base_pct acima de 100 e recusado');

-- grava os campos fiscais novos validos (ciclo completo) -------------------------
insert into item_fiscal_data (item_id, ncm, cst_pis, cst_cofins,
                              icms_base_pct, cst_ibscbs, cclass_trib,
                              gtin_tributavel)
select id, '48201000', '01', '01', 100, '000', '000000',
       '7891027354947'
  from _item;

insert into _out
  select ok((select cst_pis = '01' and cclass_trib = '000000'
               from item_fiscal_data where item_id = (select id from _item)),
            'cst_pis e cclass_trib validos gravados');

-- invariante global do 0020 ------------------------------------------------------
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind in ('r', 'p')
                and not c.relrowsecurity),
            0::bigint, 'nenhuma tabela de public sem RLS');

-- limpeza dos fixtures antes do rollback -------------------------------------------
delete from item_supplier_data where supplier_sku = '114148';
delete from item_fiscal_data where item_id = (select id from _item);
delete from catalog_items where sku = 'T0031-PROD';

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas,
       coalesce(string_agg(case when line like 'not ok%' then line end, ' || '), '') as detalhes
from _out;
rollback;
