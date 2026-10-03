-- Teste da migration 0018 - roda dentro de begin;...rollback;
-- Cobre: funcoes de conversao (VL-01..VL-03 + baixa de estoque atomica +
-- rollback de saldo insuficiente + numero V-) e de importacao da loja (numero
-- P-, idempotencia, guarda de origem) + permissoes (so service_role).
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(28);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;

-- fixtures --------------------------------------------------------------------
insert into customers (id, tenant_id, name, email)
values ('d1000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        'Cliente Conversao V5', 'v5-convert@e2e.test');
insert into customers (id, tenant_id, name, email, documento)
values ('d1000000-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        '   ', 'v5-espaco@e2e.test', '12345678000190');

insert into catalog_items (id, tenant_id, sku, name)
values ('d2000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        'V5-CONV-01', 'Produto Conversao V5');
select register_stock_movement(
  'd2000000-0000-4000-8000-000000000001', 'ajuste', 10,
  'manual', null, 'seed teste 0018', null);

insert into orders (id, tenant_id, customer_id, channel, status,
                    total_amount, origem, etapa)
values
  -- A: atacado sem CNPJ (conversao valida depois do documento)
  ('d3000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001',
   'd1000000-0000-4000-8000-000000000001', 'atacado', 'processando',
   50.00, 'erp', 'pedido'),
  -- B: sem itens
  ('d3000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001',
   'd1000000-0000-4000-8000-000000000001', 'varejo', 'processando',
   10.00, 'erp', 'pedido'),
  -- C: cancelado
  ('d3000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000001',
   'd1000000-0000-4000-8000-000000000001', 'varejo', 'processando',
   10.00, 'erp', 'pedido'),
  -- D: etapa nula (pedido da loja nao importado)
  ('d3000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000001',
   'd1000000-0000-4000-8000-000000000001', 'varejo', 'processando',
   10.00, 'loja', null),
  -- E: atacado com CNPJ mas sem nome de cliente
  ('d3000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000001',
   'd1000000-0000-4000-8000-000000000002', 'atacado', 'processando',
   25.00, 'erp', 'pedido'),
  -- F: saldo insuficiente (999 de 8)
  ('d3000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000001',
   'd1000000-0000-4000-8000-000000000001', 'varejo', 'processando',
   999.00, 'erp', 'pedido'),
  -- X: pedido da loja pendente de importacao
  ('d4000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001',
   'd1000000-0000-4000-8000-000000000001', 'varejo', 'processando',
   30.00, 'loja', null),
  -- G: origem erp - nunca entra na importacao
  ('d4000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001',
   'd1000000-0000-4000-8000-000000000001', 'varejo', 'processando',
   30.00, 'erp', null);

update orders set cancelado_em = now()
 where id = 'd3000000-0000-4000-8000-000000000003';

insert into order_items
  (tenant_id, order_id, item_id, sku, name, unit_price, quantity, total)
select '00000000-0000-0000-0000-000000000001', t.id,
       'd2000000-0000-4000-8000-000000000001',
       'V5-CONV-01', 'Produto Conversao V5', 25.00, t.q, 25.00 * t.q
  from (values
    ('d3000000-0000-4000-8000-000000000001'::uuid, 2),
    ('d3000000-0000-4000-8000-000000000005'::uuid, 1),
    ('d3000000-0000-4000-8000-000000000006'::uuid, 999)
  ) as t(id, q);

-- funcoes existem ---------------------------------------------------------------
insert into _out
  select is(to_regprocedure('public.vendas_convert_to_sale(uuid)') is not null,
            true, '0018 funcao de conversao existe');
insert into _out
  select is(to_regprocedure('public.vendas_import_loja(uuid[])') is not null,
            true, '0018 funcao de importacao existe');

-- conversao: validacoes ----------------------------------------------------------
insert into _out
  select throws_ok(
    $q$select vendas_convert_to_sale('d3000000-0000-4000-8000-000000000001')$q$,
    'P0001', 'ATACADO_SEM_CNPJ',
    'convert exige CNPJ de 14 digitos no atacado');

-- com o CNPJ cadastrado a mesma conversao passa
update customers set documento = '12345678000190'
 where id = 'd1000000-0000-4000-8000-000000000001';

-- conversao: sucesso + efeitos ----------------------------------------------------
insert into _out
  select is(
    (vendas_convert_to_sale('d3000000-0000-4000-8000-000000000001')
      ->> 'venda_numero') ~ '^V-[0-9]{4,}$',
    true, 'convert devolve numero V-');
insert into _out
  select is((select etapa from orders
              where id = 'd3000000-0000-4000-8000-000000000001'),
            'venda', 'convert muda etapa para venda');
insert into _out
  select is((select convertido_em is not null from orders
              where id = 'd3000000-0000-4000-8000-000000000001'),
            true, 'convert preenche convertido_em');
insert into _out
  select is((select stock_available from item_stock
              where item_id = 'd2000000-0000-4000-8000-000000000001'),
            8, 'convert baixa 2 do estoque (10 -> 8)');
insert into _out
  select is((select count(*) from stock_movements
              where movement_type = 'venda'
                and reference_type = 'order'
                and reference_id = 'd3000000-0000-4000-8000-000000000001'
                and item_id = 'd2000000-0000-4000-8000-000000000001'),
            1::bigint, 'convert registra movimento de estoque do pedido');

-- conversao: re-execucao e guardas ------------------------------------------------
insert into _out
  select throws_ok(
    $q$select vendas_convert_to_sale('d3000000-0000-4000-8000-000000000001')$q$,
    'P0001', 'JA_E_VENDA', 'reconverter venda ja convertida falha');
insert into _out
  select throws_ok(
    $q$select vendas_convert_to_sale('d3000000-0000-4000-8000-000000000002')$q$,
    'P0001', 'SEM_ITENS', 'pedido sem item nao converte');
insert into _out
  select throws_ok(
    $q$select vendas_convert_to_sale('d3000000-0000-4000-8000-000000000003')$q$,
    'P0001', 'DOCUMENTO_CANCELADO', 'pedido cancelado nao converte');
insert into _out
  select throws_ok(
    $q$select vendas_convert_to_sale('d3000000-0000-4000-8000-000000000004')$q$,
    'P0001', 'ETAPA_NAO_E_PEDIDO', 'documento fora da etapa pedido nao converte');
insert into _out
  select throws_ok(
    $q$select vendas_convert_to_sale('d3000000-0000-4000-8000-000000000005')$q$,
    'P0001', 'SEM_NOME_CLIENTE', 'canal exige nome do cliente');

-- conversao: saldo insuficiente derruba tudo ---------------------------------------
insert into _out
  select throws_ok(
    $q$select vendas_convert_to_sale('d3000000-0000-4000-8000-000000000006')$q$,
    'P0001',
    'ESTOQUE_INSUFICIENTE: venda (d2000000-0000-4000-8000-000000000001) — disponível 8',
    'saldo insuficiente derra a conversao com a mensagem da RPC');
insert into _out
  select is((select stock_available from item_stock
              where item_id = 'd2000000-0000-4000-8000-000000000001'),
            8, 'falha de saldo nao mexe no estoque');
insert into _out
  select is((select etapa from orders
              where id = 'd3000000-0000-4000-8000-000000000006'),
            'pedido', 'falha de saldo nao muda a etapa');

-- importacao: numero P-, idempotencia e guarda de origem ---------------------------
insert into _out
  select is(
    (vendas_import_loja(array[
      'd4000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000002'
    ]::uuid[]) ->> 'importados')::integer,
    1, 'import so conta pedido da loja pendente (id repetido nao duplica)');
insert into _out
  select is((select pedido_numero from orders
              where id = 'd4000000-0000-4000-8000-000000000001') ~ '^P-[0-9]{4,}$',
            true, 'import gera numero P-');
insert into _out
  select is((select etapa from orders
              where id = 'd4000000-0000-4000-8000-000000000001'),
            'pedido', 'import muda etapa para pedido');
insert into _out
  select is(
    (vendas_import_loja(array[
      'd4000000-0000-4000-8000-000000000001'
    ]::uuid[]) ->> 'importados')::integer,
    0, 're-execucao importa 0 (idempotente)');
insert into _out
  select is((select pedido_numero is null and etapa is null from orders
              where id = 'd4000000-0000-4000-8000-000000000002'),
            true, 'pedido de origem erp nao e importado');
insert into _out
  select throws_ok($q$select vendas_import_loja(null)$q$,
                   'P0001', 'LISTA_INVALIDA', 'lista nula e rejeitada');
insert into _out
  select throws_ok($q$select vendas_import_loja('{}'::uuid[])$q$,
                   'P0001', 'LISTA_INVALIDA', 'lista vazia e rejeitada');

-- permissoes ---------------------------------------------------------------------
insert into _out
  select is(has_function_privilege('authenticated',
            'public.vendas_convert_to_sale(uuid)', 'EXECUTE'),
            false, 'authenticated nao executa convert');
insert into _out
  select is(has_function_privilege('authenticated',
            'public.vendas_import_loja(uuid[])', 'EXECUTE'),
            false, 'authenticated nao executa import');
insert into _out
  select is(has_function_privilege('anon',
            'public.vendas_convert_to_sale(uuid)', 'EXECUTE'),
            false, 'anon nao executa convert');
insert into _out
  select is(has_function_privilege('service_role',
            'public.vendas_convert_to_sale(uuid)', 'EXECUTE'),
            true, 'service_role executa convert');
insert into _out
  select is(has_function_privilege('service_role',
            'public.vendas_import_loja(uuid[])', 'EXECUTE'),
            true, 'service_role executa import');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
from _out;
rollback;
