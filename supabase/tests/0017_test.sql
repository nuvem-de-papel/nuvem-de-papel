-- Teste da migration 0017 - roda dentro de begin;...rollback;
-- Cobre: dados fiscais do fornecedor, colunas de ciclo/origem/condicao do
-- pedido, custos (qtd_recebida/custo_final/fob_price/custo_medio scale 4),
-- as 7 tabelas novas (DF-e, notas de entrada, transporte, envios, de-para,
-- importacao), RLS de gestao, purchase_receive v2 (rateio nacional e
-- importacao, N parcelas pela condicao, custo medio ponderado, marcadoras,
-- RC-05 NOTA_OBRIGATORIA) e regressoes do f6 (QTD_ACIMA, PC-05).
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(62);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;

create temp table _po (
  nome text primary key,
  po_id uuid not null,
  item_id uuid not null,
  poi_id uuid not null
);
grant select on _po to anon, authenticated;

-- seeds: fornecedor + 6 itens + 6 pedidos ------------------------------------
do $$
declare
  v_forn uuid;
  v_item uuid;
  v_po uuid;
  v_poi uuid;
  n integer;
begin
  insert into suppliers (tenant_id, name, cnpj, ie, uf, pais)
  values ('00000000-0000-0000-0000-000000000001', 'Fornecedor Teste 0017',
          '12345678000190', '1234567890', 'SP', 'Brasil')
  returning id into v_forn;

  for n in 1..6 loop
    insert into catalog_items (tenant_id, sku, name, active)
    values ('00000000-0000-0000-0000-000000000001',
            'SKU-0017-' || chr(64 + n), 'Item teste 0017 ' || n, true)
    returning id into v_item;

    insert into purchase_orders
      (tenant_id, supplier_id, code, origem, tipo, condicao, frete, desconto,
       idempotency_key, total)
    values
      ('00000000-0000-0000-0000-000000000001', v_forn,
       'PC-T00170' || n,
       case when n = 5 then 'importacao' else 'nacional' end,
       'pedido',
       case when n = 3 then '30/60' else '28 dias' end,
       case when n = 4 then 10 else 0 end, 0,
       'teste-0017-po' || n, 0)
    returning id into v_po;

    insert into purchase_order_items
      (tenant_id, purchase_order_id, item_id, sku_snapshot, name_snapshot,
       quantity, unit_cost, line_total)
    values
      ('00000000-0000-0000-0000-000000000001', v_po, v_item,
       'SKU-0017-' || chr(64 + n), 'Item teste 0017 ' || n,
       case when n = 1 then 10
            when n = 2 then 5
            when n = 3 then 4
            when n = 6 then 2
            else 10 end,
       case when n in (1, 4, 6) then 20
            when n = 2 then 30
            else 10 end,
       0)
    returning id into v_poi;

    insert into _po (nome, po_id, item_id, poi_id)
    values ('po' || n, v_po, v_item, v_poi);
  end loop;

  insert into compra_importacao (purchase_order_id, tenant_id, moeda, cambio)
  select po_id, '00000000-0000-0000-0000-000000000001', 'USD', 5
    from _po where nome = 'po5';
end $$;

-- fornecedor -----------------------------------------------------------------
insert into _out select has_column('suppliers', 'ie');
insert into _out select has_column('suppliers', 'uf');
insert into _out select has_column('suppliers', 'pais');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'suppliers'::regclass
        and conname = 'suppliers_uf_check'
        and pg_get_constraintdef(oid) like '%A-Z%2%'),
    1::bigint, 'uf do fornecedor aceita sigla maiuscula');

-- pedido: colunas e checks ----------------------------------------------------
insert into _out select has_column('purchase_orders', 'origem');
insert into _out select has_column('purchase_orders', 'tipo');
insert into _out select has_column('purchase_orders', 'frete');
insert into _out select has_column('purchase_orders', 'desconto');
insert into _out select has_column('purchase_orders', 'condicao');
insert into _out select has_column('purchase_orders', 'conferido_em');
insert into _out select has_column('purchase_orders', 'concluida_em');
insert into _out select has_column('purchase_orders', 'cancelada_em');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'purchase_orders'::regclass
        and conname = 'purchase_orders_origem_check'
        and pg_get_constraintdef(oid) like '%nacional%'
        and pg_get_constraintdef(oid) like '%importacao%'),
    1::bigint, 'origem aceita nacional e importacao');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'purchase_orders'::regclass
        and conname = 'purchase_orders_tipo_check'
        and pg_get_constraintdef(oid) like '%entrada_direta%'),
    1::bigint, 'tipo aceita entrada_direta');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'purchase_orders'::regclass
        and conname = 'purchase_orders_condicao_check'
        and pg_get_constraintdef(oid) like '%30/60/90%'
        and pg_get_constraintdef(oid) like '%À vista%'),
    1::bigint, 'condicao aceita as 4 condicoes');

-- itens e custos ---------------------------------------------------------------
insert into _out select has_column('purchase_order_items', 'qtd_recebida');
insert into _out select has_column('purchase_order_items', 'custo_final');
insert into _out
  select is(
    (select count(*) from pg_index
      where indexrelid = to_regclass('public.purchase_order_items_po_item_key')
        and indisunique),
    1::bigint, 'PC-05: mesmo produto so uma linha por pedido');
insert into _out select has_column('item_commercial_data', 'fob_price');
insert into _out
  select is(
    (select count(*) from information_schema.columns
      where table_schema = 'public'
        and table_name = 'item_commercial_data'
        and column_name = 'cost_price'
        and data_type = 'numeric'
        and numeric_precision = 12
        and numeric_scale = 4),
    1::bigint, 'cost_price sobe para numeric(12,4)');

-- tabelas novas -----------------------------------------------------------------
insert into _out select is(to_regclass('public.compra_importacao') is not null, true,
  'tabela compra_importacao existe');
insert into _out select is(to_regclass('public.nfe_recebidas') is not null, true,
  'tabela nfe_recebidas existe');
insert into _out select is(to_regclass('public.notas_entrada') is not null, true,
  'tabela notas_entrada existe');
insert into _out select is(to_regclass('public.compra_transporte') is not null, true,
  'tabela compra_transporte existe');
insert into _out select is(to_regclass('public.compra_transporte_eventos') is not null, true,
  'tabela compra_transporte_eventos existe');
insert into _out select is(to_regclass('public.compra_envios') is not null, true,
  'tabela compra_envios existe');
insert into _out select is(to_regclass('public.supplier_item_map') is not null, true,
  'tabela supplier_item_map existe');
insert into _out
  select is(
    (select count(*) from pg_index
      where indexrelid = to_regclass('public.nfe_recebidas_tenant_id_chave_key')
        and indisunique),
    1::bigint, 'chave da NF-e unica por tenant');
insert into _out
  select is(
    (select count(*) from pg_index
      where indexrelid = to_regclass('public.notas_entrada_purchase_order_id_key')
        and indisunique),
    1::bigint, '1 nota de entrada por pedido (unica)');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'compra_transporte'::regclass
        and conname = 'compra_transporte_status_check'
        and pg_get_constraintdef(oid) like '%desembaraco%'
        and pg_get_constraintdef(oid) like '%chegou%'),
    1::bigint, 'transporte cobre as duas sequencias (5.5)');
insert into _out
  select is(
    (select count(*) from pg_index
      where indexrelid = to_regclass('public.idx_nfe_recebidas_pendentes')),
    1::bigint, 'indice de notas pendentes existe');

-- RLS --------------------------------------------------------------------------
insert into _out select policies_are('nfe_recebidas',
  array['le nfe_recebidas (gestao)']);
insert into _out select policies_are('compra_transporte',
  array['le compra_transporte (gestao)']);

set local role authenticated;
insert into _out
  select is((select count(*) from nfe_recebidas), 0::bigint,
    'authenticated sem papel nao le nfe_recebidas');
insert into _out
  select throws_ok(
    $q$insert into compra_transporte (purchase_order_id, tenant_id)
       select po_id, '00000000-0000-0000-0000-000000000001' from _po where nome = 'po1'$q$,
    '42501', null, 'authenticated nao escreve em compra_transporte (deny-all)');
reset role;

-- NF de entrada: CFOP valido ----------------------------------------------------
insert into _out
  select throws_ok(
    $q$insert into notas_entrada (tenant_id, purchase_order_id, tipo, numero,
                                  serie, cfop, status)
       select '00000000-0000-0000-0000-000000000001', po_id, 'fornecedor',
              '1', '1', '9999', 'ok' from _po where nome = 'po2'$q$,
    '23514', null, 'CFOP fora de 1102/2102/3102 e rejeitado');

-- recebimento nacional (regressao f6): 4 de 10, titulo 80, 1x 28 dias ---------
insert into _out
  select is(
    (select (purchase_receive(
        po_id,
        ('[{"purchase_order_item_id": "' || poi_id || '", "quantity": 4}]')::jsonb,
        'teste-0017-rec-a', null, null)->>'duplicate')
      from _po where nome = 'po1'),
    'false', 'recebimento parcial 4 de 10 registra');
insert into _out
  select is(
    (select qtd_recebida from purchase_order_items
      where id = (select poi_id from _po where nome = 'po1')),
    4, 'qtd_recebida acumula a entrada parcial');
insert into _out
  select is(
    (select custo_final from purchase_order_items
      where id = (select poi_id from _po where nome = 'po1')),
    20::numeric, 'custo_final nacional sem frete = custo do item');
insert into _out
  select is(
    (select principal_amount from financial_titles
      where source_type = 'purchase_receipt'
        and source_id = (select id from purchase_receipts
          where idempotency_key = 'teste-0017-rec-a')),
    80::numeric, 'titulo a pagar vale o recebimento (4x20 = 80)');
insert into _out
  select is(
    (select count(*) from financial_installments fi
      join financial_titles t on t.id = fi.title_id
     where t.source_type = 'purchase_receipt'
       and t.source_id = (select id from purchase_receipts
         where idempotency_key = 'teste-0017-rec-a')
       and fi.due_date = current_date + 28),
    1::bigint, 'condicao 28 dias gera 1 parcela vencendo +28');
insert into _out
  select is(
    (select cost_price from item_commercial_data
      where item_id = (select item_id from _po where nome = 'po1')),
    20::numeric, 'custo medio ponderado nasce no primeiro recebimento');
insert into _out
  select is(
    (select status from purchase_orders
      where id = (select po_id from _po where nome = 'po1')),
    'parcial', 'PO parcial apos 4 de 10');

-- fecha o PO1 (10 de 10) -------------------------------------------------------
insert into _out
  select is(
    (select purchase_receive(
        po_id,
        ('[{"purchase_order_item_id": "' || poi_id || '", "quantity": 6}]')::jsonb,
        'teste-0017-rec-b', null, null) is not null
      from _po where nome = 'po1'),
    true, 'recebimento final 6 de 10 conclui');
insert into _out
  select is(
    (select status from purchase_orders
      where id = (select po_id from _po where nome = 'po1')),
    'recebido', 'PO vira recebido quando fecha 10 de 10');
insert into _out
  select is(
    (select concluida_em is not null from purchase_orders
      where id = (select po_id from _po where nome = 'po1')),
    true, 'concluida_em preenchida ao concluir sem diferenca');
insert into _out
  select is(
    (select qtd_recebida from purchase_order_items
      where id = (select poi_id from _po where nome = 'po1')),
    10, 'qtd_recebida fecha em 10');

-- RC-05: conferencia exige nota de entrada -------------------------------------
insert into _out
  select throws_ok(
    $q$select purchase_receive(
         (select po_id from _po where nome = 'po2'),
         (select ('[{"purchase_order_item_id": "' || poi_id || '", "quantity": 5}]')::jsonb
            from _po where nome = 'po2'),
         'teste-0017-conf-a', null, null, true)$q$,
    'P0001', 'NOTA_OBRIGATORIA', 'conferencia sem nota ok e barrada (RC-05)');
insert into notas_entrada
  (tenant_id, purchase_order_id, tipo, numero, serie, cfop, status)
values ('00000000-0000-0000-0000-000000000001',
        (select po_id from _po where nome = 'po2'),
        'fornecedor', '9001', '1', '1102', 'ok');
insert into _out
  select is(
    (select purchase_receive(
        po_id,
        ('[{"purchase_order_item_id": "' || poi_id || '", "quantity": 5}]')::jsonb,
        'teste-0017-conf-b', null, null, true) is not null
      from _po where nome = 'po2'),
    true, 'com nota ok a conferencia conclui (p_conferido)');
insert into _out
  select is(
    (select conferido_em is not null from purchase_orders
      where id = (select po_id from _po where nome = 'po2')),
    true, 'conferido_em gravada na conferencia');

-- condicao 30/60: N parcelas ----------------------------------------------------
insert into _out
  select is(
    (select purchase_receive(
        po_id,
        ('[{"purchase_order_item_id": "' || poi_id || '", "quantity": 4}]')::jsonb,
        'teste-0017-rec-c', null, null) is not null
      from _po where nome = 'po3'),
    true, 'recebimento fechado na condicao 30/60');
insert into _out
  select is(
    (select count(*) from financial_installments fi
      join financial_titles t on t.id = fi.title_id
     where t.source_type = 'purchase_receipt'
       and t.source_id = (select id from purchase_receipts
         where idempotency_key = 'teste-0017-rec-c')),
    2::bigint, '30/60 gera 2 parcelas');
insert into _out
  select is(
    (select count(*) from financial_installments fi
      join financial_titles t on t.id = fi.title_id
     where t.source_type = 'purchase_receipt'
       and t.source_id = (select id from purchase_receipts
         where idempotency_key = 'teste-0017-rec-c')
       and fi.due_date in (current_date + 30, current_date + 60)),
    2::bigint, 'parcelas vencem +30 e +60');

-- rateio com frete (5.2 nacional): custo_final 21 e titulo 84 -------------------
insert into _out
  select is(
    (select purchase_receive(
        po_id,
        ('[{"purchase_order_item_id": "' || poi_id || '", "quantity": 4}]')::jsonb,
        'teste-0017-rec-d', null, null) is not null
      from _po where nome = 'po4'),
    true, 'recebimento do PO com frete conclui');
insert into _out
  select is(
    (select custo_final from purchase_order_items
      where id = (select poi_id from _po where nome = 'po4')),
    21::numeric, 'frete rateado: 20 x 210/200 = 21');
insert into _out
  select is(
    (select principal_amount from financial_titles
      where source_type = 'purchase_receipt'
        and source_id = (select id from purchase_receipts
          where idempotency_key = 'teste-0017-rec-d')),
    84::numeric, 'titulo usa custo nacionalizado (4 x 21 = 84)');

-- importacao (5.2): FOB_moeda 100 -> FOB 500, PIS 10,50, COFINS 48,25 -> 558,75 -
insert into _out
  select is(
    (select purchase_receive(
        po_id,
        ('[{"purchase_order_item_id": "' || poi_id || '", "quantity": 2}]')::jsonb,
        'teste-0017-rec-e', null, null) is not null
      from _po where nome = 'po5'),
    true, 'recebimento da importacao conclui');
insert into _out
  select is(
    (select custo_final from purchase_order_items
      where id = (select poi_id from _po where nome = 'po5')),
    55.875::numeric, 'custo final importado nacionalizado (10 x 558,75/100)');
insert into _out
  select is(
    (select principal_amount from financial_titles
      where source_type = 'purchase_receipt'
        and source_id = (select id from purchase_receipts
          where idempotency_key = 'teste-0017-rec-e')),
    111.75::numeric, 'titulo da importacao em R$ (2 recebidos x 55,875)');
insert into _out
  select is(
    (select total from purchase_orders
      where id = (select po_id from _po where nome = 'po5')),
    558.75::numeric, 'total do PO de importacao = custo nacionalizado (FOB 500 + PIS/COFINS)');

-- regressoes f6: QTD_ACIMA e PC-05 -----------------------------------------------
insert into _out
  select throws_ok(
    $q$select purchase_receive(
         (select po_id from _po where nome = 'po6'),
         (select ('[{"purchase_order_item_id": "' || poi_id || '", "quantity": 3}]')::jsonb
            from _po where nome = 'po6'),
         'teste-0017-acima', null, null)$q$,
    'P0001', 'QTD_ACIMA_DO_PEDIDO: SKU-0017-F (pendente 2)',
    'quantidade acima do pedido continua bloqueada (I6 do f6)');
insert into _out
  select throws_ok(
    $q$insert into purchase_order_items
         (tenant_id, purchase_order_id, item_id, sku_snapshot, name_snapshot,
          quantity, unit_cost, line_total)
       select '00000000-0000-0000-0000-000000000001', po_id, item_id,
              'SKU-0017-F', 'Item teste 0017 6', 1, 20, 20
         from _po where nome = 'po6'$q$,
    '23505', null, 'mesmo produto duas vezes no pedido e rejeitado (PC-05)');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
from _out;
rollback;
