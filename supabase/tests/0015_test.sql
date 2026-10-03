-- Teste da migration 0015 - roda dentro de begin;...rollback;
-- Cobre: colunas de documento em orders (origem/etapa/numeros/frete/condicao),
-- constraints de origem/etapa/condicao, indices unicos de P-/V-, sequences
-- seq_pedido_numero/seq_venda_numero, venda PDV com desconto (PDV-10), call
-- antiga sem p_default (compat E2E f5), limite de desconto, CX-04 (motivo
-- obrigatorio) e CX-05 (sangria limitada a gaveta).
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(32);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;

-- colunas de documento -------------------------------------------------------
insert into _out select has_column('orders', 'origem');
insert into _out select has_column('orders', 'caixa_sessao_id');
insert into _out select has_column('orders', 'etapa');
insert into _out select has_column('orders', 'pedido_numero');
insert into _out select has_column('orders', 'venda_numero');
insert into _out select has_column('orders', 'convertido_em');
insert into _out select has_column('orders', 'cancelado_em');
insert into _out select has_column('orders', 'frete');
insert into _out select has_column('orders', 'condicao');

-- constraints e indices ------------------------------------------------------
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'orders'::regclass
        and conname = 'orders_origem_check'
        and pg_get_constraintdef(oid) like '%erp%'
        and pg_get_constraintdef(oid) like '%pdv%'
        and pg_get_constraintdef(oid) like '%loja%'),
    1::bigint, 'origem aceita erp, pdv e loja');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'orders'::regclass
        and conname = 'orders_etapa_check'
        and pg_get_constraintdef(oid) like '%pedido%'
        and pg_get_constraintdef(oid) like '%venda%'),
    1::bigint, 'etapa aceita pedido e venda (e nula)');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'orders'::regclass
        and conname = 'orders_condicao_check'
        and pg_get_constraintdef(oid) like '%30/60/90%'),
    1::bigint, 'condicao aceita as 4 condicoes de pagamento');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'orders'::regclass
        and conname = 'orders_frete_check'),
    1::bigint, 'frete nao aceita valor negativo');
insert into _out
  select is(
    (select count(*) from pg_index
      where indexrelid = to_regclass('public.orders_pedido_numero_key')
        and indisunique),
    1::bigint, 'pedido_numero e unico por tenant');
insert into _out
  select is(
    (select count(*) from pg_index
      where indexrelid = to_regclass('public.orders_venda_numero_key')
        and indisunique),
    1::bigint, 'venda_numero e unico por tenant');
insert into _out
  select is(to_regclass('public.seq_pedido_numero') is not null, true,
    'sequence seq_pedido_numero existe (start 1043)');
insert into _out
  select is(to_regclass('public.seq_venda_numero') is not null, true,
    'sequence seq_venda_numero existe (start 2211)');

-- setup: fecha caixa legada aberta (prod), abre a sessao do teste -----------
do $$
declare
  v_item uuid;
begin
  update caixa_sessions set status = 'fechado', closed_at = now()
    where status = 'aberto';
  if pdv_open_cash(100, null, 'e2e-0015-abertura') is null then
    raise exception 'seed: abertura de caixa falhou';
  end if;
  insert into catalog_items (tenant_id, sku, name)
  values ('00000000-0000-0000-0000-000000000001', 'SKU-0015-PDV',
          'Produto teste 0015')
  returning id into v_item;
  insert into item_prices (item_id, channel, price)
  values (v_item, 'varejo', 50);
  perform register_stock_movement(
    v_item, 'ajuste', 10, 'manual', null, 'seed teste 0015', null);
end $$;

-- venda com desconto (PDV-10): 2 x 50 - 10 = 90 ------------------------------
insert into _out
  select is(
    (pdv_register_sale(
       ('[{"item_id": "' || (select id from catalog_items
                             where sku = 'SKU-0015-PDV')::text ||
       '", "quantity": 2}]')::jsonb,
       'dinheiro', 'varejo', 1, null, 'e2e-0015-venda-a', 10)->>'total')::numeric,
    90::numeric, 'venda com desconto de 10 fecha em 90');
insert into _out
  select is(
    (select etapa from orders where idempotency_key = 'e2e-0015-venda-a'),
    'venda', 'venda PDV nasce com etapa venda');
insert into _out
  select is(
    (select origem from orders where idempotency_key = 'e2e-0015-venda-a'),
    'pdv', 'venda PDV nasce com origem pdv (FV-03)');
insert into _out
  select is(
    (select count(*) from orders
      where idempotency_key = 'e2e-0015-venda-a'
        and venda_numero ~ '^V-[0-9]{4}$'),
    1::bigint, 'venda PDV recebe numero V- na sequence');
insert into _out
  select is(
    (select discount_amount from orders
      where idempotency_key = 'e2e-0015-venda-a'),
    10::numeric, 'orders.discount_amount guarda o desconto');
insert into _out
  select is(
    (select caixa_sessao_id from orders
      where idempotency_key = 'e2e-0015-venda-a'),
    (select id from caixa_sessions
      where idempotency_key = 'e2e-0015-abertura'),
    'venda PDV aponta para a sessao de caixa aberta');

-- constraints rejeitam valor invalido ----------------------------------------
insert into _out
  select throws_ok(
    $q$insert into orders (tenant_id, customer_id, total_amount, origem)
       values ('00000000-0000-0000-0000-000000000001',
               (select id from customers
                 where email = 'balcao@nuvemdepapel.com.br'),
               10, 'marketplace')$q$,
    '23514', null, 'origem fora de erp/pdv/loja e rejeitado');
insert into _out
  select throws_ok(
    $q$insert into orders (tenant_id, customer_id, total_amount, etapa)
       values ('00000000-0000-0000-0000-000000000001',
               (select id from customers
                 where email = 'balcao@nuvemdepapel.com.br'),
               10, 'nota')$q$,
    '23514', null, 'etapa fora de pedido/venda e rejeitada');
insert into _out
  select throws_ok(
    $q$insert into orders (tenant_id, customer_id, total_amount, condicao)
       values ('00000000-0000-0000-0000-000000000001',
               (select id from customers
                 where email = 'balcao@nuvemdepapel.com.br'),
               10, '90/90')$q$,
    '23514', null, 'condicao fora da lista e rejeitada');

-- call antiga (6 args, como o f5 faz) usa default p_discount = 0 -------------
insert into _out
  select is(
    (pdv_register_sale(
       ('[{"item_id": "' || (select id from catalog_items
                             where sku = 'SKU-0015-PDV')::text ||
       '", "quantity": 1}]')::jsonb,
       'pix', 'varejo', 1, null, 'e2e-0015-venda-b')->>'total')::numeric,
    50::numeric, 'chamada sem p_discount mantem o total cheio');

-- desconto nao pode zerar a venda --------------------------------------------
insert into _out
  select throws_ok(
    format($f$select pdv_register_sale(
             '[{"item_id": "%s", "quantity": 1}]'::jsonb,
             'pix', 'varejo', 1, null, 'e2e-0015-desc-max', 50)$f$,
           (select id from catalog_items
             where sku = 'SKU-0015-PDV'
               and tenant_id = '00000000-0000-0000-0000-000000000001')),
    'P0001', 'DESCONTO_EXCEDE_SUBTOTAL',
    'desconto >= subtotal derruba a venda');

-- CX-05: gaveta agora tem 100 + 90 + 50 = 240 --------------------------------
insert into _out
  select throws_ok(
    $q$select pdv_cash_supply('sangria', 500, 'acima da gaveta',
                              'e2e-0015-sangria-alta')$q$,
    'P0001', 'GAVETA_INSUFICIENTE: A gaveta tem só R$ 240,00 em dinheiro.',
    'sangria acima do dinheiro da gaveta e barrada (CX-05)');

-- CX-04: sangria/suprimento exigem motivo -----------------------------------
insert into _out
  select throws_ok(
    $q$select pdv_cash_supply('sangria', 10, '   ',
                              'e2e-0015-sangria-sem-motivo')$q$,
    'P0001', 'MOTIVO_OBRIGATORIO', 'sangria sem motivo e barrada (CX-04)');

-- sangria valida: 100 + 90 + 50 = 240; 50 passa ------------------------------
select pdv_cash_supply('sangria', 50, 'retirada de teste',
                       'e2e-0015-sangria-ok');
insert into _out
  select is(
    (select count(*) from caixa_movements
      where idempotency_key = 'e2e-0015-sangria-ok'),
    1::bigint, 'sangria dentro do limite registra movimento');

insert into _out
  select is(
    (pdv_close_cash(190)->>'difference')::numeric,
    0::numeric, 'fechamento bate (100 abertura + 90 + 50 - 50 sangria)');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
from _out;
rollback;
