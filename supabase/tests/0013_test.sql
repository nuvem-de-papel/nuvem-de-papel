-- Teste estrutural 0013 - roda dentro de begin;...rollback;
-- Cobre: ean_dv_valido (GTIN-13/GTIN-8 validos e invalidos), colunas novas
-- do item_fiscal_data (gtin/cest/origem/unit/peso bruto) com constraints e
-- indice unico, tenant_company (estrutura + RLS: gestao le, operador e anon
-- nao leem, escrita deny-all) e sefaz_config (negado ate para a gestao).
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas e finish() emite so notices - entao cada assert e gravado em
-- temp table e o gate final e (asserts, falhas).
begin;
select plan(38);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;

-- estrutura ---------------------------------------------------------------
insert into _out select has_table('tenant_company');
insert into _out select has_table('sefaz_config');
insert into _out select has_column('item_fiscal_data', 'gtin');
insert into _out select has_column('item_fiscal_data', 'cest');
insert into _out select has_column('item_fiscal_data', 'origem');
insert into _out select has_column('item_fiscal_data', 'unit');
insert into _out select has_column('item_fiscal_data', 'weight_gross_kg');
insert into _out select has_column('tenant_company', 'cnpj');
insert into _out select has_column('tenant_company', 'regime');
insert into _out select has_column('sefaz_config', 'ambiente');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'item_fiscal_data'::regclass
        and conname = 'item_fiscal_data_gtin_check'
        and contype = 'c'),
    1::bigint, 'check de GTIN existe');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'item_fiscal_data'::regclass
        and conname = 'item_fiscal_data_origem_check'
        and contype = 'c'),
    1::bigint, 'check de origem existe');
insert into _out
  select is(
    (select count(*) from pg_class
      where relname = 'item_fiscal_data_gtin_key'
        and relkind = 'i'),
    1::bigint, 'indice unico de GTIN existe');

-- ean_dv_valido (regra GS1 mod-10) ----------------------------------------
insert into _out
  select is(ean_dv_valido('7898943477996'), true, 'GTIN-13 valido (caderno)');
insert into _out
  select is(ean_dv_valido('7891000100103'), true, 'GTIN-13 valido (caneta)');
insert into _out
  select is(ean_dv_valido('4006381333931'), true, 'GTIN-13 valido (referencia)');
insert into _out
  select is(ean_dv_valido('7898943477997'), false, 'GTIN-13 com DV errado');
insert into _out
  select is(ean_dv_valido('12345670'), true, 'GTIN-8 valido');
insert into _out
  select is(ean_dv_valido('12345671'), false, 'GTIN-8 com DV errado');
insert into _out
  select is(ean_dv_valido('1234567'), false, '7 digitos nao e GTIN');
insert into _out
  select is(ean_dv_valido('abcdefghijklm'), false, 'letras nao e GTIN');
insert into _out
  select is(ean_dv_valido('78989434779960'), false, '14 digitos nao e GTIN');

-- constraints do banco (nao so a UI) --------------------------------------
insert into catalog_items (tenant_id, sku, name)
values ('00000000-0000-0000-0000-000000000001', 'FISC-001', 'Produto Fiscal 001'),
       ('00000000-0000-0000-0000-000000000001', 'FISC-002', 'Produto Fiscal 002');

insert into item_fiscal_data (item_id, gtin)
select id, '7898943477996' from catalog_items where sku = 'FISC-001';
insert into _out
  select ok(
    exists(select 1 from item_fiscal_data where gtin = '7898943477996'),
    'GTIN valido e gravado no banco');

insert into _out
  select throws_ok(
    $q$insert into item_fiscal_data (item_id, gtin)
      select id, '7898943477997' from catalog_items where sku = 'FISC-001'$q$,
    '23514', null, 'GTIN com DV errado bloqueado pelo banco');
insert into _out
  select throws_ok(
    $q$insert into item_fiscal_data (item_id, gtin)
      select id, '789894347799' from catalog_items where sku = 'FISC-001'$q$,
    '23514', null, 'GTIN de 12 digitos bloqueado pelo banco');
insert into _out
  select throws_ok(
    $q$insert into item_fiscal_data (item_id, gtin)
      select id, '7898943477996' from catalog_items where sku = 'FISC-002'$q$,
    '23505', null, 'mesmo GTIN em dois produtos bloqueado (unico)');
insert into _out
  select throws_ok(
    $q$insert into item_fiscal_data (item_id, origem)
      select id, '9' from catalog_items where sku = 'FISC-002'$q$,
    '23514', null, 'origem fora de 0-7 bloqueada');
insert into _out
  select throws_ok(
    $q$insert into item_fiscal_data (item_id, unit)
      select id, 'UNIDADELONGA' from catalog_items where sku = 'FISC-002'$q$,
    '23514', null, 'unidade comercial longa demais bloqueada');

-- tenant_company: seed de teste (service_role) -----------------------------
insert into tenant_company (tenant_id, razao_social, fantasia, cnpj)
values ('00000000-0000-0000-0000-000000000001',
        'EMITENTE TESTE LTDA', 'Loja Teste', '11222333000181');
insert into _out
  select ok(
    exists(select 1 from tenant_company where cnpj = '11222333000181'),
    'emitente gravada via service_role');
insert into _out
  select throws_ok(
    $q$insert into tenant_company (tenant_id, razao_social, cnpj)
      values ('00000000-0000-0000-0000-000000000001', 'DUP', '11222333000181')$q$,
    '23505', null, 'dois CNPJ iguais bloqueados');

-- sefaz_config: seed de teste (service_role) -------------------------------
insert into sefaz_config (tenant_id, ambiente)
values ('00000000-0000-0000-0000-000000000001', 'homologacao');
insert into _out
  select ok(
    exists(select 1 from sefaz_config where tenant_id = '00000000-0000-0000-0000-000000000001'),
    'config SEFAZ gravado via service_role');

-- RLS: master, operador e anon --------------------------------------------
insert into auth.users (id, email)
values ('40000000-0000-4000-8000-000000000010',
        'fiscal-master-teste@e2e.local'),
       ('40000000-0000-4000-8000-000000000011',
        'fiscal-operador-teste@e2e.local');
insert into profiles (id, tenant_id, email, full_name, role, status)
values ('40000000-0000-4000-8000-000000000010',
        '00000000-0000-0000-0000-000000000001',
        'fiscal-master-teste@e2e.local', 'Master Fiscal Teste', 'master', 'ativo'),
       ('40000000-0000-4000-8000-000000000011',
        '00000000-0000-0000-0000-000000000001',
        'fiscal-operador-teste@e2e.local', 'Operador Fiscal Teste', 'operador', 'ativo');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000010","role":"authenticated"}',
  true);
insert into _out
  select is(
    (select count(*) from tenant_company), 1::bigint,
    'master (gestao) le a emitente');
insert into _out
  select is(
    (select count(*) from sefaz_config), 0::bigint,
    'gestao nao le sefaz_config (segredo)');
insert into _out
  select throws_ok(
    $q$insert into tenant_company (tenant_id, razao_social, cnpj)
      values ('00000000-0000-0000-0000-000000000001', 'HACK', '99888777000166')$q$,
    '42501', null, 'escrita deny-all mesmo para a gestao');
-- update e filtrado pela policy (using false): nao da erro, mas nao
-- tem efeito - conferimos o resultado depois do reset do role.
update sefaz_config set ambiente = 'producao'
  where tenant_id = '00000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '', true);
reset role;

insert into _out
  select is(
    (select ambiente from sefaz_config
      where tenant_id = '00000000-0000-0000-0000-000000000001'),
    'homologacao',
    'atualizacao de sefaz_config da gestao nao teve efeito');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000011","role":"authenticated"}',
  true);
insert into _out
  select is(
    (select count(*) from tenant_company), 0::bigint,
    'operador nao le a emitente');
select set_config('request.jwt.claims', '', true);
reset role;

set local role anon;
insert into _out
  select is(
    (select count(*) from tenant_company), 0::bigint,
    'anon nao le a emitente');
insert into _out
  select is(
    (select count(*) from sefaz_config), 0::bigint,
    'anon nao le sefaz_config');
reset role;

-- gate: total de asserts e falhas (o helper mostra o ultimo com linhas) ------
select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
  from _out;
select line from _out where line like 'not ok%';
rollback;
