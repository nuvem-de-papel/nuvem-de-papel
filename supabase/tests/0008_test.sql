-- Teste estrutural 0008 - roda dentro de begin;...rollback;
-- Cobre: tabelas/policies do caixa e financeiro, abertura idempotente,
-- venda PDV (preço server-side, estoque, gaveta, título no crédito),
-- idempotência de venda, suprimento/sangria, bate-vale, trava de fechamento,
-- liquidação parcial/total/sobreliquidação, imutabilidade dos livros e
-- permissões.
begin;
select plan(57);

select has_table('caixa_sessions');
select has_table('caixa_movements');
select has_table('financial_titles');
select has_table('financial_installments');
select has_table('financial_settlements');
select has_column('orders', 'idempotency_key');
select policies_are('caixa_sessions', array['le sessoes de caixa (operacional)']);
select policies_are('caixa_movements', array['le movimentos de caixa (operacional)']);
select policies_are('financial_titles', array['le titulos (gestao)']);
select policies_are('financial_installments', array['le parcelas (gestao)']);
select policies_are('financial_settlements', array['le liquidacoes (gestao)']);

-- seed ------------------------------------------------------------------
insert into customers (id, tenant_id, name, email)
values ('bbbbbbbb-0000-4000-8000-000000000003',
        '00000000-0000-0000-0000-000000000001', 'Cliente PDV', 'pdv-teste@exemplo.com');

insert into catalog_items (id, tenant_id, sku, name)
values ('bbbbbbbb-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000001', 'SKU-PDV-A', 'Item A controle'),
       ('bbbbbbbb-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000001', 'SKU-PDV-B', 'Item B sem controle');

insert into item_prices (item_id, channel, price)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'varejo', 50),
       ('bbbbbbbb-0000-4000-8000-000000000002', 'varejo', 30);

select register_stock_movement('bbbbbbbb-0000-4000-8000-000000000001',
  'entrada', 10, 'manual', null, 'seed do teste', null);

-- abertura --------------------------------------------------------------
select is((pdv_open_cash(100, null, 'teste-abertura-0001') ->> 'duplicate')::boolean,
  false, 'abertura de caixa cria a sessao');
select is((pdv_open_cash(100, null, 'teste-abertura-0001') ->> 'duplicate')::boolean,
  true, 'mesma chave de abertura e idempotente');
select is((pdv_open_cash(50, null, 'teste-abertura-0002') ->> 'duplicate')::boolean,
  true, 'outra abertura com sessao ja aberta devolve a vencedora');
select is((select count(*) from caixa_sessions), 1::bigint,
  'uma unica sessao por tenant (trava parcial)');

-- venda a vista no PDV --------------------------------------------------
select is((pdv_register_sale(
  '[{"item_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":2}]',
  'dinheiro', 'varejo', 1, null, 'teste-venda-0001') ->> 'duplicate')::boolean,
  false, 'venda em dinheiro registrada');
select is((select stock_available from item_stock
            where item_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  8, 'venda PDV baixa o estoque direto (sem reserva)');
select is((select status from orders where idempotency_key = 'teste-venda-0001'),
  'pago', 'pedido do PDV nasce pago');
select is((select total_amount from orders where idempotency_key = 'teste-venda-0001'),
  100::numeric, 'total resolvido no servidor (2 x preco varejo)');
select is((pdv_register_sale(
  '[{"item_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":2}]',
  'dinheiro', 'varejo', 1, null, 'teste-venda-0001') ->> 'duplicate')::boolean,
  true, 'venda repetida com a mesma chave e idempotente');
select is((select count(*) from orders where idempotency_key = 'teste-venda-0001'),
  1::bigint, 'chave de idempotencia nao gera pedido duplicado');
select is((select count(*) from caixa_movements), 2::bigint,
  'gaveta so tem abertura + 1 venda ate aqui');

-- venda no credito (titulo + parcelas) ----------------------------------
select is((pdv_register_sale(
  '[{"item_id":"bbbbbbbb-0000-4000-8000-000000000002","quantity":3}]',
  'cartao', 'varejo', 3, null, 'teste-venda-0002') ->> 'title_id') is not null,
  true, 'credito gera titulo a receber');
select is((select count(*) from financial_installments), 3::bigint,
  'titulo parcelado em 3x');
select is((select coalesce(sum(principal_amount), 0) from financial_installments),
  90::numeric, 'parcelas somam exatamente o principal (3 x 30)');
select is((select count(*) from caixa_movements), 2::bigint,
  'credito nao entra na gaveta');

-- suprimento e sangria --------------------------------------------------
select is((pdv_cash_supply('suprimento', 50, 'fundo de troco', 'teste-supr-0001')
  ->> 'duplicate')::boolean, false, 'suprimento registrado');
select is((pdv_cash_supply('suprimento', 50, 'fundo de troco', 'teste-supr-0001')
  ->> 'duplicate')::boolean, true, 'suprimento repetido e idempotente');
select is((pdv_cash_supply('sangria', 30, 'deposito do dia', 'teste-sangr-0001')
  ->> 'duplicate')::boolean, false, 'sangria registrada');
select is((select direction from caixa_movements where movement_type = 'sangria'),
  'out', 'sangria sai da gaveta');
select is((select count(*) from caixa_movements), 4::bigint,
  'livro: abertura + venda + suprimento + sangria');

-- estoque insuficiente derruba a venda inteira (gaveta ainda aberta) -----
select throws_ok(
  $q$select pdv_register_sale('[{"item_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":99}]', 'pix', 'varejo', 1, null, 'teste-venda-caixa-0003')$q$,
  'P0001', null, 'venda acima do estoque derruba tudo (rollback)'
);
select is((select count(*) from orders where idempotency_key = 'teste-venda-caixa-0003'),
  0::bigint, 'venda bloqueada nao deixa pedido para tras');

-- nova venda no credito (1 x 50) para o teste de sobreliquidacao ---------
select is((pdv_register_sale(
  '[{"item_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":1}]',
  'cartao', 'varejo', 1, null, 'teste-venda-0003') ->> 'duplicate')::boolean,
  false, 'nova venda no credito (1x)');

-- fechamento (bate-vale) ------------------------------------------------
-- esperado = 100 (abertura) + 100 (venda) + 50 (suprimento) - 30 (sangria);
-- a venda no credito nao mexe na gaveta.
select is(((pdv_close_cash(220) ->> 'difference'))::numeric, 0::numeric,
  'bate-vale zerado quando a contagem bate');
select is((select count(*) from caixa_sessions where status = 'fechado'),
  1::bigint, 'sessao encerrada');
select throws_ok(
  $q$select pdv_register_sale('[{"item_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":1}]', 'pix', 'varejo', 1, null, 'teste-venda-caixa-0004')$q$,
  'P0001', null, 'venda sem gaveta aberta e bloqueada'
);

-- liquidacoes financeiras ------------------------------------------------
select is((financial_settle(
  (select i.id from financial_installments i join financial_titles t2 on t2.id = i.title_id where t2.idempotency_key = 'teste-venda-0002:titulo' and i.number = 1),
  10, 'pix', 'teste-liq-0001') ->> 'installment_status'),
  'parcial', 'liquidacao parcial marca a parcela como parcial');
select is((financial_settle(
  (select i.id from financial_installments i join financial_titles t2 on t2.id = i.title_id where t2.idempotency_key = 'teste-venda-0002:titulo' and i.number = 1),
  10, 'pix', 'teste-liq-0001') ->> 'duplicate'),
  'true', 'liquidacao repetida e idempotente');
select is((financial_settle(
  (select i.id from financial_installments i join financial_titles t2 on t2.id = i.title_id where t2.idempotency_key = 'teste-venda-0002:titulo' and i.number = 1),
  20, 'pix', 'teste-liq-0002') ->> 'installment_status'),
  'liquidado', 'saldo final liquida a parcela');
select is((financial_settle(
  (select i.id from financial_installments i join financial_titles t2 on t2.id = i.title_id where t2.idempotency_key = 'teste-venda-0002:titulo' and i.number = 2),
  30, 'boleto', 'teste-liq-0003') ->> 'installment_status'),
  'liquidado', 'segunda parcela liquidada');
select is((financial_settle(
  (select i.id from financial_installments i join financial_titles t2 on t2.id = i.title_id where t2.idempotency_key = 'teste-venda-0002:titulo' and i.number = 3),
  30, 'boleto', 'teste-liq-0004') ->> 'installment_status'),
  'liquidado', 'terceira parcela liquidada');
select is((select status from financial_titles where idempotency_key = 'teste-venda-0002:titulo'),
  'liquidado', 'titulo segue o resultado das parcelas');
select is((select count(*) from financial_settlements), 4::bigint,
  'liquidacoes idempotentes: 10 + 20 + 30 + 30');
select throws_ok(
  $q$select financial_settle((select i.id from financial_installments i join financial_titles t2 on t2.id = i.title_id where t2.idempotency_key = 'teste-venda-0002:titulo' and i.number = 1), 1, 'pix', 'teste-liq-0005')$q$,
  'P0001', null, 'liquidar parcela ja encerrada e bloqueado'
);
select throws_ok(
  $q$select financial_settle((select title_id from financial_installments where number = 1 limit 1), 1, 'pix', 'teste-liq-titulo-0001')$q$,
  'P0001', null, 'liquidar titulo inexistente como parcela e bloqueado'
);

-- sobreliquidacao: parcela de 50, tenta receber 51 ----------------------
select throws_ok(
  $q$select financial_settle((select i.id from financial_installments i join financial_titles t on t.id = i.title_id where t.idempotency_key = 'teste-venda-0003:titulo'), 51, 'pix', 'teste-liq-0006')$q$,
  'P0001', null, 'liquidacao acima do saldo da parcela e bloqueada'
);

-- imutabilidade dos livros ----------------------------------------------
select throws_ok(
  'update caixa_movements set amount = 1 where amount > 0',
  'P0001', null, 'livro do caixa bloqueia UPDATE'
);
select throws_ok(
  'delete from caixa_movements',
  'P0001', null, 'livro do caixa bloqueia DELETE'
);
select throws_ok(
  'update financial_settlements set amount = 1 where amount > 0',
  'P0001', null, 'livro de liquidacoes bloqueia UPDATE'
);
select throws_ok(
  'delete from financial_settlements',
  'P0001', null, 'livro de liquidacoes bloqueia DELETE'
);

-- permissoes ------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $q$select pdv_open_cash(0, null, 'teste-perm-0001')$q$,
  '42501', null, 'authenticated nao executa funcoes de PDV'
);
select throws_ok(
  $q$select financial_settle(null, 1, 'pix', 'teste-perm-0002')$q$,
  '42501', null, 'authenticated nao executa funcoes financeiras'
);
select is((select count(*) from caixa_sessions), 0::bigint,
  'authenticated sem perfil nao le sessoes de caixa');
select is((select count(*) from financial_titles), 0::bigint,
  'authenticated sem perfil nao le titulos');
reset role;

set local role anon;
select is((select count(*) from caixa_movements), 0::bigint,
  'anon nao le movimentos de caixa');
select is((select count(*) from financial_installments), 0::bigint,
  'anon nao le parcelas');
reset role;

select * from finish();
rollback;
