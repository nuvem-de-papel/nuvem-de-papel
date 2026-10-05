-- supabase/seed/demo.sql - dados FICTICIOS de demonstracao.
--
-- Contexto (decisao do cliente, 2026-10-04): a producao ainda nao e usada por
-- ninguem, entao pode ser povoada com valores, quantidades, precos, pesos,
-- clientes, fornecedores, revenda e produtos para as demonstracoes. No voao
-- definitivo tudo isso e apagado - para isso existe o demo-wipe.sql.
--
-- Cada linha passa pelo caminho de verdade (pedido -> faturamento -> titulo ->
-- liquidacao; compra -> recebimento -> estoque; despesa -> gatilho 0023 ->
-- diario), entao o que aparece na tela e o que o sistema calcula.
--
-- ECONOMIA DE DEMONSTRACAO (nao pode virar "empresa que da prejuizo"):
--   * receita ~R$ 16-21 mil por mes (balcao + revenda no atacado);
--   * CMV ~57% (margem liquida ~43%, coerente com os precos do catalogo);
--   * custo fixo R$ 6.170 + depreciacao R$ 250 -> EBITDA positivo todo mes;
--   * contas sao as FOLHAS reais do plano 0021 - nada de codigo inventado.
--   Coerencia de estoque: compras 82.096,00 - CMV = saldo do item_stock (p.4).
--
-- IDEMPOTENCIA: ids fixos (prefixo d3e00000-...) e `where not exists` em toda
-- insercao. Rodar de novo nao duplica. O que NAO da e trocar valores depois:
-- o diario e imutavel - para recomecar, rode o demo-wipe.sql e depois este.
begin;

drop table if exists _t;
create temp table _t (id uuid);
insert into _t select id from tenants limit 1;

-- ===========================================================================
-- 1. Fornecedores
-- ===========================================================================
insert into suppliers (id, tenant_id, name, contact_email, cnpj, uf, pais, active)
select v.id, t.id, v.name, v.email, v.cnpj, v.uf, 'BR', true
  from (values
    ('d3e00000-0000-4000-8000-00000000c001'::uuid, 'Papelaria Central Distribuidora', 'comercial@papelariacentral.com.br', '12345678000190', 'SP'),
    ('d3e00000-0000-4000-8000-00000000c002'::uuid, 'Grafica Serra Azul',             'pedidos@serraazulgrafica.com.br',   '98765432000110', 'MG')
  ) v(id, name, email, cnpj, uf)
  cross join _t t
 where not exists (select 1 from suppliers x where x.id = v.id);

-- ===========================================================================
-- 2. Clientes (7 novos - ja existem "Cliente Balcao" e um cliente fisico)
-- ===========================================================================
insert into customers (id, tenant_id, name, email, tier, documento, uf)
select v.id, t.id, v.name, v.email, v.tier, null, v.uf
  from (values
    ('d3e00000-0000-4000-8000-00000000c011'::uuid, 'Mariana Souza Alves',       'mariana.alves@email.com.br',       'prata',    'SP'),
    ('d3e00000-0000-4000-8000-00000000c012'::uuid, 'Rafael Nogueira Pinto',     'rafael.pinto@email.com.br',        'bronze',   'RJ'),
    ('d3e00000-0000-4000-8000-00000000c013'::uuid, 'Escola Municipal Vila Nova', 'financeiro@escolavilanova.edu.br', 'ouro',     'MG'),
    ('d3e00000-0000-4000-8000-00000000c014'::uuid, 'Papel e Cia Distribuidora',  'compras@papelcia.com.br',          'diamante', 'PR'),
    ('d3e00000-0000-4000-8000-00000000c015'::uuid, 'Juliana Ferreira Barros',    'ju.barros@email.com.br',           'bronze',   'PE'),
    ('d3e00000-0000-4000-8000-00000000c016'::uuid, 'Studio Desenho Livre',       'oi@desenholivre.com.br',           'prata',    'BA'),
    ('d3e00000-0000-4000-8000-00000000c017'::uuid, 'Pedro Henrique Martins',     'pedro.martins@email.com.br',       'bronze',   'SC')
  ) v(id, name, email, tier, uf)
  cross join _t t
 where not exists (select 1 from customers x where x.id = v.id);

-- ===========================================================================
-- 3. Catalogo - 4 produtos novos (custo, preco varejo e atacado)
-- ===========================================================================
insert into catalog_items (id, tenant_id, sku, name, category, active)
select v.id, t.id, v.sku, v.name, v.cat, true
  from (values
    ('d3e00000-0000-4000-8000-00000000a101'::uuid, 'MARC-EST-DUP', 'Marcador Dupla Ponta 12 Cores',       'Escrita'),
    ('d3e00000-0000-4000-8000-00000000a102'::uuid, 'PAP-A4-75G',   'Resma Papel A4 75g (500 folhas)',     'Papel'),
    ('d3e00000-0000-4000-8000-00000000a103'::uuid, 'LIV-CAD-PON',  'Livro Pontilhado A5 96 folhas',       'Cadernos'),
    ('d3e00000-0000-4000-8000-00000000a104'::uuid, 'KIT-ESC-2027', 'Kit Escolar 2027 (mochila + estojo)', 'Kits')
  ) v(id, sku, name, cat)
  cross join _t t
 where not exists (select 1 from catalog_items x where x.id = v.id);

insert into item_commercial_data (item_id, cost_price, margin_percent, min_stock)
select ci.id, v.cost, v.margin, v.minstock
  from (values
    ('MARC-EST-DUP'::text, 18.40::numeric, 116::numeric, 20::int),
    ('PAP-A4-75G'::text,   22.00::numeric,  58::numeric, 30::int),
    ('LIV-CAD-PON'::text,  15.50::numeric, 138::numeric, 25::int),
    ('KIT-ESC-2027'::text, 46.00::numeric, 117::numeric, 10::int)
  ) v(sku, cost, margin, minstock)
  join catalog_items ci on ci.sku = v.sku
 where not exists (select 1 from item_commercial_data x where x.item_id = ci.id);

insert into item_prices (item_id, channel, price, min_quantity)
select ci.id, v.channel::sales_channel, v.price, v.minq
  from (values
    ('MARC-EST-DUP'::text, 'varejo'::text,  39.90::numeric, 1::int),
    ('MARC-EST-DUP'::text, 'atacado'::text, 31.90::numeric, 10::int),
    ('PAP-A4-75G'::text,   'varejo'::text,  34.90::numeric, 1::int),
    ('PAP-A4-75G'::text,   'atacado'::text, 27.90::numeric, 10::int),
    ('LIV-CAD-PON'::text,  'varejo'::text,  36.90::numeric, 1::int),
    ('LIV-CAD-PON'::text,  'atacado'::text, 29.50::numeric, 10::int),
    ('KIT-ESC-2027'::text, 'varejo'::text,  99.90::numeric, 1::int),
    ('KIT-ESC-2027'::text, 'atacado'::text, 79.90::numeric, 10::int),
    ('ADS-NUV-LUA-120'::text,  'atacado'::text, 19.90::numeric, 10::int),
    ('CAD-NUV-PAS-10M'::text,  'atacado'::text, 71.90::numeric, 10::int),
    ('CAN-GEL-PAST-6C'::text,  'atacado'::text, 26.30::numeric, 10::int),
    ('CAN-NUV-ALGODAO'::text,  'atacado'::text, 31.90::numeric, 10::int),
    ('EST-BOX-NDP'::text,      'atacado'::text, 39.90::numeric, 10::int),
    ('PLN-FOF-SEM-2027'::text, 'atacado'::text, 51.90::numeric, 10::int)
  ) v(sku, channel, price, minq)
  join catalog_items ci on ci.sku = v.sku
 where not exists (select 1 from item_prices p
                    where p.item_id = ci.id
                      and p.channel = v.channel::sales_channel);

insert into item_fiscal_data (item_id, ncm, weight_kg, unit, weight_gross_kg, origem)
select ci.id, v.ncm, v.peso, 'UN', v.pesobr, '0'
  from (values
    ('ADS-NUV-LUA-120'::text,  '48219000'::text, 0.25::numeric, 0.30::numeric),
    ('CAD-NUV-PAS-10M'::text,  '48201000'::text, 0.42::numeric, 0.48::numeric),
    ('CAN-GEL-PAST-6C'::text,  '96083000'::text, 0.15::numeric, 0.19::numeric),
    ('CAN-NUV-ALGODAO'::text,  '69120000'::text, 0.35::numeric, 0.44::numeric),
    ('EST-BOX-NDP'::text,      '42029200'::text, 0.28::numeric, 0.33::numeric),
    ('PLN-FOF-SEM-2027'::text, '48201000'::text, 0.48::numeric, 0.55::numeric),
    ('MARC-EST-DUP'::text,     '96082000'::text, 0.18::numeric, 0.22::numeric),
    ('PAP-A4-75G'::text,       '48025610'::text, 2.30::numeric, 2.45::numeric),
    ('LIV-CAD-PON'::text,      '48201000'::text, 0.32::numeric, 0.37::numeric),
    ('KIT-ESC-2027'::text,     '96100090'::text, 1.10::numeric, 1.35::numeric)
  ) v(sku, ncm, peso, pesobr)
  join catalog_items ci on ci.sku = v.sku
 where not exists (select 1 from item_fiscal_data x where x.item_id = ci.id);

-- ===========================================================================
-- 4. Estoque final = compras - CMV (saldo em custo). Definido DEPOIS das
--    compras: recebimento nao mexe em item_stock, so o diario (0022).
-- ===========================================================================
insert into item_stock (item_id, tenant_id, stock_on_hand, stock_available)
select ci.id, t.id, v.qty, v.qty
  from (values
    ('CAD-NUV-PAS-10M'::text, 105::int), ('CAN-GEL-PAST-6C'::text, 189::int),
    ('ADS-NUV-LUA-120'::text, 160::int), ('PAP-A4-75G'::text, 100::int),
    ('PLN-FOF-SEM-2027'::text, 50::int), ('KIT-ESC-2027'::text, 78::int),
    ('EST-BOX-NDP'::text, 113::int),     ('LIV-CAD-PON'::text, 106::int),
    ('MARC-EST-DUP'::text, 95::int),     ('CAN-NUV-ALGODAO'::text, 107::int)
  ) v(sku, qty)
  join catalog_items ci on ci.sku = v.sku
  cross join _t t
 where not exists (select 1 from item_stock s where s.item_id = ci.id);

update item_stock s
   set stock_on_hand = v.qty, stock_available = v.qty, updated_at = now()
  from (values
    ('CAD-NUV-PAS-10M'::text, 105::int), ('CAN-GEL-PAST-6C'::text, 189::int),
    ('ADS-NUV-LUA-120'::text, 160::int), ('PAP-A4-75G'::text, 100::int),
    ('PLN-FOF-SEM-2027'::text, 50::int), ('KIT-ESC-2027'::text, 78::int),
    ('EST-BOX-NDP'::text, 113::int),     ('LIV-CAD-PON'::text, 106::int),
    ('MARC-EST-DUP'::text, 95::int),     ('CAN-NUV-ALGODAO'::text, 107::int)
  ) v(sku, qty)
 where s.item_id = (select ci.id from catalog_items ci where ci.sku = v.sku);

-- ===========================================================================
-- 5. Compras: 3 pedidos + recebimentos -> compra no diario (1.1.3 x 2.1.1)
-- ===========================================================================
insert into purchase_orders (id, tenant_id, supplier_id, code, status, total,
                             origem, tipo, idempotency_key, created_at, notes)
select v.id, t.id, v.forn, v.code, 'recebido', v.total, 'nacional', 'pedido',
       v.idem, v.ts, 'Compra de reposicao (demonstracao)'
  from (values
    ('d3e00000-0000-4000-8000-000000009001'::uuid, 'd3e00000-0000-4000-8000-00000000c001'::uuid, 'PO-DEMO-001'::text, 20050::numeric, timestamp '2026-05-10 09:00', 'demo-po-01'::text),
    ('d3e00000-0000-4000-8000-000000009002'::uuid, 'd3e00000-0000-4000-8000-00000000c001'::uuid, 'PO-DEMO-002'::text, 35860::numeric, timestamp '2026-07-08 10:30', 'demo-po-02'::text),
    ('d3e00000-0000-4000-8000-000000009003'::uuid, 'd3e00000-0000-4000-8000-00000000c002'::uuid, 'PO-DEMO-003'::text, 26186::numeric, timestamp '2026-09-05 14:20', 'demo-po-03'::text)
  ) v(id, forn, code, total, ts, idem)
  cross join _t t
 where not exists (select 1 from purchase_orders x where x.id = v.id);

insert into purchase_order_items (id, tenant_id, purchase_order_id, item_id,
                                  sku_snapshot, name_snapshot, quantity,
                                  unit_cost, line_total, qtd_recebida, custo_final, created_at)
select v.id, t.id, v.po, ci.id, ci.sku, ci.name, v.qty, v.cost, v.qty * v.cost,
       v.qty, v.cost, v.ts
  from (values
    ('d3e00000-0000-4000-8000-000000009101'::uuid, 'd3e00000-0000-4000-8000-000000009001'::uuid, 'CAD-NUV-PAS-10M'::text, 300::int, 42.00::numeric, timestamp '2026-05-10 09:00'),
    ('d3e00000-0000-4000-8000-000000009102'::uuid, 'd3e00000-0000-4000-8000-000000009001'::uuid, 'CAN-GEL-PAST-6C'::text, 200::int, 12.00::numeric, timestamp '2026-05-10 09:00'),
    ('d3e00000-0000-4000-8000-000000009103'::uuid, 'd3e00000-0000-4000-8000-000000009001'::uuid, 'ADS-NUV-LUA-120'::text, 300::int, 9.50::numeric, timestamp '2026-05-10 09:00'),
    ('d3e00000-0000-4000-8000-000000009104'::uuid, 'd3e00000-0000-4000-8000-000000009001'::uuid, 'PAP-A4-75G'::text, 100::int, 22.00::numeric, timestamp '2026-05-10 09:00'),
    ('d3e00000-0000-4000-8000-000000009111'::uuid, 'd3e00000-0000-4000-8000-000000009002'::uuid, 'PLN-FOF-SEM-2027'::text, 350::int, 28.00::numeric, timestamp '2026-07-08 10:30'),
    ('d3e00000-0000-4000-8000-000000009112'::uuid, 'd3e00000-0000-4000-8000-000000009002'::uuid, 'KIT-ESC-2027'::text, 260::int, 46.00::numeric, timestamp '2026-07-08 10:30'),
    ('d3e00000-0000-4000-8000-000000009113'::uuid, 'd3e00000-0000-4000-8000-000000009002'::uuid, 'EST-BOX-NDP'::text, 450::int, 21.00::numeric, timestamp '2026-07-08 10:30'),
    ('d3e00000-0000-4000-8000-000000009114'::uuid, 'd3e00000-0000-4000-8000-000000009002'::uuid, 'LIV-CAD-PON'::text, 300::int, 15.50::numeric, timestamp '2026-07-08 10:30'),
    ('d3e00000-0000-4000-8000-000000009121'::uuid, 'd3e00000-0000-4000-8000-000000009003'::uuid, 'CAD-NUV-PAS-10M'::text, 300::int, 42.00::numeric, timestamp '2026-09-05 14:20'),
    ('d3e00000-0000-4000-8000-000000009122'::uuid, 'd3e00000-0000-4000-8000-000000009003'::uuid, 'CAN-GEL-PAST-6C'::text, 200::int, 12.00::numeric, timestamp '2026-09-05 14:20'),
    ('d3e00000-0000-4000-8000-000000009123'::uuid, 'd3e00000-0000-4000-8000-000000009003'::uuid, 'MARC-EST-DUP'::text, 290::int, 18.40::numeric, timestamp '2026-09-05 14:20'),
    ('d3e00000-0000-4000-8000-000000009124'::uuid, 'd3e00000-0000-4000-8000-000000009003'::uuid, 'CAN-NUV-ALGODAO'::text, 200::int, 15.00::numeric, timestamp '2026-09-05 14:20'),
    ('d3e00000-0000-4000-8000-000000009125'::uuid, 'd3e00000-0000-4000-8000-000000009003'::uuid, 'ADS-NUV-LUA-120'::text, 300::int, 9.50::numeric, timestamp '2026-09-05 14:20')
  ) v(id, po, sku, qty, cost, ts)
  join catalog_items ci on ci.sku = v.sku
  cross join _t t
 where not exists (select 1 from purchase_order_items x where x.id = v.id);

insert into purchase_receipts (id, tenant_id, purchase_order_id, code, status,
                               received_at, total, idempotency_key, notes)
select v.id, t.id, v.po, v.code, 'postado', v.at, v.total, v.idem,
       'Recebimento conferido (demonstracao)'
  from (values
    ('d3e00000-0000-4000-8000-000000009201'::uuid, 'd3e00000-0000-4000-8000-000000009001'::uuid, 'RC-DEMO-001'::text, timestamp '2026-05-14 11:00', 20050::numeric, 'demo-rc-01'::text),
    ('d3e00000-0000-4000-8000-000000009202'::uuid, 'd3e00000-0000-4000-8000-000000009002'::uuid, 'RC-DEMO-002'::text, timestamp '2026-07-11 15:40', 35860::numeric, 'demo-rc-02'::text),
    ('d3e00000-0000-4000-8000-000000009203'::uuid, 'd3e00000-0000-4000-8000-000000009003'::uuid, 'RC-DEMO-003'::text, timestamp '2026-09-09 09:20', 26186::numeric, 'demo-rc-03'::text)
  ) v(id, po, code, at, total, idem)
  cross join _t t
 where not exists (select 1 from purchase_receipts x where x.id = v.id);

insert into purchase_receipt_items (id, tenant_id, receipt_id, purchase_order_item_id, quantity, created_at)
select v.id, t.id, v.rc, v.poi, v.qty, v.at
  from (values
    ('d3e00000-0000-4000-8000-000000009301'::uuid, 'd3e00000-0000-4000-8000-000000009201'::uuid, 'd3e00000-0000-4000-8000-000000009101'::uuid, 300::int, timestamp '2026-05-14 11:00'),
    ('d3e00000-0000-4000-8000-000000009302'::uuid, 'd3e00000-0000-4000-8000-000000009201'::uuid, 'd3e00000-0000-4000-8000-000000009102'::uuid, 200::int, timestamp '2026-05-14 11:00'),
    ('d3e00000-0000-4000-8000-000000009303'::uuid, 'd3e00000-0000-4000-8000-000000009201'::uuid, 'd3e00000-0000-4000-8000-000000009103'::uuid, 300::int, timestamp '2026-05-14 11:00'),
    ('d3e00000-0000-4000-8000-000000009304'::uuid, 'd3e00000-0000-4000-8000-000000009201'::uuid, 'd3e00000-0000-4000-8000-000000009104'::uuid, 100::int, timestamp '2026-05-14 11:00'),
    ('d3e00000-0000-4000-8000-000000009311'::uuid, 'd3e00000-0000-4000-8000-000000009202'::uuid, 'd3e00000-0000-4000-8000-000000009111'::uuid, 350::int, timestamp '2026-07-11 15:40'),
    ('d3e00000-0000-4000-8000-000000009312'::uuid, 'd3e00000-0000-4000-8000-000000009202'::uuid, 'd3e00000-0000-4000-8000-000000009112'::uuid, 260::int, timestamp '2026-07-11 15:40'),
    ('d3e00000-0000-4000-8000-000000009313'::uuid, 'd3e00000-0000-4000-8000-000000009202'::uuid, 'd3e00000-0000-4000-8000-000000009113'::uuid, 450::int, timestamp '2026-07-11 15:40'),
    ('d3e00000-0000-4000-8000-000000009314'::uuid, 'd3e00000-0000-4000-8000-000000009202'::uuid, 'd3e00000-0000-4000-8000-000000009114'::uuid, 300::int, timestamp '2026-07-11 15:40'),
    ('d3e00000-0000-4000-8000-000000009321'::uuid, 'd3e00000-0000-4000-8000-000000009203'::uuid, 'd3e00000-0000-4000-8000-000000009121'::uuid, 300::int, timestamp '2026-09-09 09:20'),
    ('d3e00000-0000-4000-8000-000000009322'::uuid, 'd3e00000-0000-4000-8000-000000009203'::uuid, 'd3e00000-0000-4000-8000-000000009122'::uuid, 200::int, timestamp '2026-09-09 09:20'),
    ('d3e00000-0000-4000-8000-000000009323'::uuid, 'd3e00000-0000-4000-8000-000000009203'::uuid, 'd3e00000-0000-4000-8000-000000009123'::uuid, 290::int, timestamp '2026-09-09 09:20'),
    ('d3e00000-0000-4000-8000-000000009324'::uuid, 'd3e00000-0000-4000-8000-000000009203'::uuid, 'd3e00000-0000-4000-8000-000000009124'::uuid, 200::int, timestamp '2026-09-09 09:20'),
    ('d3e00000-0000-4000-8000-000000009325'::uuid, 'd3e00000-0000-4000-8000-000000009203'::uuid, 'd3e00000-0000-4000-8000-000000009125'::uuid, 300::int, timestamp '2026-09-09 09:20')
  ) v(id, rc, poi, qty, at)
  cross join _t t
 where not exists (select 1 from purchase_receipt_items x where x.id = v.id);

-- ===========================================================================
-- 6. Vendas: 34 pedidos em 6 competencias. O status ja nasce final (o gatilho
--    e ADIADO e roda no commit, entao enxerga o estado final do pedido).
--    ATENCAO: orders.channel e o enum sales_channel - so 'varejo' e 'atacado'.
--    O canal da transacao (pdv, loja, erp) e orders.origem.
-- ===========================================================================
drop table if exists _d_o;
create temp table _d_o (
  oid     uuid primary key,
  cemail  text,
  channel text,
  status  text,
  origem  text,
  pay     text,
  ts      timestamp
);

drop table if exists _d_i;
create temp table _d_i (oid uuid, sku text, qty int, price numeric);

insert into _d_o (oid, cemail, channel, status, origem, pay, ts) values
  ('d3e00000-0000-4000-8000-000000000d01', 'mariana.alves@email.com.br',       'varejo', 'pago',                 'pdv',  'pix',     '2026-05-09 10:15'),
  ('d3e00000-0000-4000-8000-000000000d02', 'rafael.pinto@email.com.br',        'varejo', 'pago',                 'pdv',  'dinheiro','2026-05-17 15:40'),
  ('d3e00000-0000-4000-8000-000000000d03', 'balcao@nuvemdepapel.com.br',       'varejo', 'pago',                 'pdv',  'cartao',  '2026-05-24 11:05'),
  ('d3e00000-0000-4000-8000-000000000d04', 'compras@papelcia.com.br',          'atacado','pago',                 'erp',  'cartao',  '2026-05-28 09:30'),
  ('d3e00000-0000-4000-8000-000000000d05', 'pedro.martins@email.com.br',       'varejo', 'pago',                 'loja', 'pix',     '2026-05-30 18:20'),
  ('d3e00000-0000-4000-8000-000000000d06', 'financeiro@escolavilanova.edu.br', 'atacado','pago',                 'erp',  'boleto',  '2026-05-13 14:00'),
  ('d3e00000-0000-4000-8000-000000000d07', 'mariana.alves@email.com.br',       'varejo', 'pago',                 'pdv',  'pix',     '2026-06-06 09:10'),
  ('d3e00000-0000-4000-8000-000000000d08', 'compras@papelcia.com.br',          'atacado','pago',                 'erp',  'cartao',  '2026-06-18 10:45'),
  ('d3e00000-0000-4000-8000-000000000d09', 'oi@desenholivre.com.br',           'varejo', 'pago',                 'loja', 'cartao',  '2026-06-26 16:30'),
  ('d3e00000-0000-4000-8000-000000000d10', 'ju.barros@email.com.br',           'varejo', 'pago',                 'pdv',  'dinheiro','2026-06-11 11:25'),
  ('d3e00000-0000-4000-8000-000000000d11', 'financeiro@escolavilanova.edu.br', 'atacado','pago',                 'erp',  'boleto',  '2026-06-23 08:50'),
  ('d3e00000-0000-4000-8000-000000000d12', 'rafael.pinto@email.com.br',        'varejo', 'pago',                 'pdv',  'pix',     '2026-07-04 15:10'),
  ('d3e00000-0000-4000-8000-000000000d13', 'balcao@nuvemdepapel.com.br',       'varejo', 'pago',                 'pdv',  'dinheiro','2026-07-11 10:00'),
  ('d3e00000-0000-4000-8000-000000000d14', 'compras@papelcia.com.br',          'atacado','pago',                 'erp',  'cartao',  '2026-07-21 09:20'),
  ('d3e00000-0000-4000-8000-000000000d15', 'pedro.martins@email.com.br',       'varejo', 'pago',                 'loja', 'boleto',  '2026-07-27 19:05'),
  ('d3e00000-0000-4000-8000-000000000d16', 'financeiro@escolavilanova.edu.br', 'atacado','pago',                 'erp',  'boleto',  '2026-07-16 14:40'),
  ('d3e00000-0000-4000-8000-000000000d33', 'oi@desenholivre.com.br',           'varejo', 'cancelado',            'pdv',  'pix',     '2026-07-18 12:00'),
  ('d3e00000-0000-4000-8000-000000000d17', 'rafael.pinto@email.com.br',        'varejo', 'pago',                 'pdv',  'pix',     '2026-08-05 11:15'),
  ('d3e00000-0000-4000-8000-000000000d18', 'mariana.alves@email.com.br',       'varejo', 'pago',                 'pdv',  'dinheiro','2026-08-08 16:50'),
  ('d3e00000-0000-4000-8000-000000000d19', 'compras@papelcia.com.br',          'atacado','pago',                 'erp',  'cartao',  '2026-08-14 09:35'),
  ('d3e00000-0000-4000-8000-000000000d20', 'oi@desenholivre.com.br',           'varejo', 'pago',                 'loja', 'cartao',  '2026-08-27 20:10'),
  ('d3e00000-0000-4000-8000-000000000d21', 'financeiro@escolavilanova.edu.br', 'atacado','pago',                 'erp',  'boleto',  '2026-08-19 08:30'),
  ('d3e00000-0000-4000-8000-000000000d22', 'mariana.alves@email.com.br',       'varejo', 'pago',                 'pdv',  'pix',     '2026-09-03 10:20'),
  ('d3e00000-0000-4000-8000-000000000d23', 'compras@papelcia.com.br',          'atacado','pago',                 'erp',  'cartao',  '2026-09-15 09:05'),
  ('d3e00000-0000-4000-8000-000000000d24', 'ju.barros@email.com.br',           'varejo', 'pago',                 'pdv',  'dinheiro','2026-09-12 15:55'),
  ('d3e00000-0000-4000-8000-000000000d25', 'oi@desenholivre.com.br',           'varejo', 'pago',                 'loja', 'cartao',  '2026-09-26 21:30'),
  ('d3e00000-0000-4000-8000-000000000d26', 'financeiro@escolavilanova.edu.br', 'atacado','pago',                 'erp',  'boleto',  '2026-09-19 08:15'),
  ('d3e00000-0000-4000-8000-000000000d34', 'pedro.martins@email.com.br',       'varejo', 'aguardando_pagamento', 'loja', 'boleto',  '2026-09-24 17:40'),
  ('d3e00000-0000-4000-8000-000000000d27', 'rafael.pinto@email.com.br',        'varejo', 'pago',                 'pdv',  'dinheiro','2026-10-01 10:45'),
  ('d3e00000-0000-4000-8000-000000000d28', 'ju.barros@email.com.br',           'varejo', 'pago',                 'pdv',  'pix',     '2026-10-02 14:30'),
  ('d3e00000-0000-4000-8000-000000000d29', 'compras@papelcia.com.br',          'atacado','pago',                 'erp',  'cartao',  '2026-10-02 16:10'),
  ('d3e00000-0000-4000-8000-000000000d30', 'mariana.alves@email.com.br',       'varejo', 'aguardando_pagamento', 'loja', 'boleto',  '2026-10-03 09:50'),
  ('d3e00000-0000-4000-8000-000000000d31', 'financeiro@escolavilanova.edu.br', 'atacado','processando',          'erp',  'cartao',  '2026-10-03 16:20'),
  ('d3e00000-0000-4000-8000-000000000d32', 'oi@desenholivre.com.br',           'varejo', 'pago',                 'pdv',  'debito',  '2026-10-03 11:20');

insert into _d_i (oid, sku, qty, price) values
  ('d3e00000-0000-4000-8000-000000000d01', 'CAD-NUV-PAS-10M', 10, 89.90),
  ('d3e00000-0000-4000-8000-000000000d01', 'CAN-GEL-PAST-6C', 8, 32.90),
  ('d3e00000-0000-4000-8000-000000000d02', 'PLN-FOF-SEM-2027', 6, 64.90),
  ('d3e00000-0000-4000-8000-000000000d02', 'EST-BOX-NDP', 6, 49.90),
  ('d3e00000-0000-4000-8000-000000000d03', 'ADS-NUV-LUA-120', 20, 24.90),
  ('d3e00000-0000-4000-8000-000000000d03', 'CAN-NUV-ALGODAO', 8, 39.90),
  ('d3e00000-0000-4000-8000-000000000d04', 'CAD-NUV-PAS-10M', 100, 71.90),
  ('d3e00000-0000-4000-8000-000000000d04', 'CAN-GEL-PAST-6C', 80, 26.30),
  ('d3e00000-0000-4000-8000-000000000d05', 'PLN-FOF-SEM-2027', 4, 64.90),
  ('d3e00000-0000-4000-8000-000000000d05', 'KIT-ESC-2027', 3, 99.90),
  ('d3e00000-0000-4000-8000-000000000d06', 'EST-BOX-NDP', 90, 39.90),
  ('d3e00000-0000-4000-8000-000000000d06', 'MARC-EST-DUP', 60, 31.90),
  ('d3e00000-0000-4000-8000-000000000d07', 'CAD-NUV-PAS-10M', 8, 89.90),
  ('d3e00000-0000-4000-8000-000000000d07', 'ADS-NUV-LUA-120', 15, 24.90),
  ('d3e00000-0000-4000-8000-000000000d08', 'PLN-FOF-SEM-2027', 90, 51.90),
  ('d3e00000-0000-4000-8000-000000000d08', 'LIV-CAD-PON', 80, 29.50),
  ('d3e00000-0000-4000-8000-000000000d09', 'EST-BOX-NDP', 5, 49.90),
  ('d3e00000-0000-4000-8000-000000000d09', 'CAN-GEL-PAST-6C', 5, 32.90),
  ('d3e00000-0000-4000-8000-000000000d10', 'KIT-ESC-2027', 4, 99.90),
  ('d3e00000-0000-4000-8000-000000000d10', 'MARC-EST-DUP', 4, 39.90),
  ('d3e00000-0000-4000-8000-000000000d11', 'CAD-NUV-PAS-10M', 120, 71.90),
  ('d3e00000-0000-4000-8000-000000000d11', 'ADS-NUV-LUA-120', 150, 19.90),
  ('d3e00000-0000-4000-8000-000000000d12', 'PLN-FOF-SEM-2027', 7, 64.90),
  ('d3e00000-0000-4000-8000-000000000d12', 'CAN-GEL-PAST-6C', 7, 32.90),
  ('d3e00000-0000-4000-8000-000000000d13', 'CAD-NUV-PAS-10M', 6, 89.90),
  ('d3e00000-0000-4000-8000-000000000d13', 'EST-BOX-NDP', 5, 49.90),
  ('d3e00000-0000-4000-8000-000000000d14', 'KIT-ESC-2027', 70, 79.90),
  ('d3e00000-0000-4000-8000-000000000d14', 'MARC-EST-DUP', 70, 31.90),
  ('d3e00000-0000-4000-8000-000000000d15', 'ADS-NUV-LUA-120', 25, 24.90),
  ('d3e00000-0000-4000-8000-000000000d15', 'LIV-CAD-PON', 6, 36.90),
  ('d3e00000-0000-4000-8000-000000000d16', 'EST-BOX-NDP', 100, 39.90),
  ('d3e00000-0000-4000-8000-000000000d16', 'CAN-NUV-ALGODAO', 80, 31.90),
  ('d3e00000-0000-4000-8000-000000000d33', 'LIV-CAD-PON', 3, 36.90),
  ('d3e00000-0000-4000-8000-000000000d17', 'CAD-NUV-PAS-10M', 7, 89.90),
  ('d3e00000-0000-4000-8000-000000000d17', 'CAN-GEL-PAST-6C', 6, 32.90),
  ('d3e00000-0000-4000-8000-000000000d18', 'PLN-FOF-SEM-2027', 5, 64.90),
  ('d3e00000-0000-4000-8000-000000000d18', 'ADS-NUV-LUA-120', 12, 24.90),
  ('d3e00000-0000-4000-8000-000000000d19', 'CAD-NUV-PAS-10M', 90, 71.90),
  ('d3e00000-0000-4000-8000-000000000d19', 'KIT-ESC-2027', 40, 79.90),
  ('d3e00000-0000-4000-8000-000000000d20', 'LIV-CAD-PON', 8, 36.90),
  ('d3e00000-0000-4000-8000-000000000d20', 'MARC-EST-DUP', 6, 39.90),
  ('d3e00000-0000-4000-8000-000000000d21', 'CAN-GEL-PAST-6C', 100, 26.30),
  ('d3e00000-0000-4000-8000-000000000d21', 'ADS-NUV-LUA-120', 200, 19.90),
  ('d3e00000-0000-4000-8000-000000000d22', 'CAD-NUV-PAS-10M', 9, 89.90),
  ('d3e00000-0000-4000-8000-000000000d22', 'EST-BOX-NDP', 7, 49.90),
  ('d3e00000-0000-4000-8000-000000000d23', 'PLN-FOF-SEM-2027', 100, 51.90),
  ('d3e00000-0000-4000-8000-000000000d23', 'CAD-NUV-PAS-10M', 60, 71.90),
  ('d3e00000-0000-4000-8000-000000000d24', 'MARC-EST-DUP', 5, 39.90),
  ('d3e00000-0000-4000-8000-000000000d24', 'CAN-NUV-ALGODAO', 5, 39.90),
  ('d3e00000-0000-4000-8000-000000000d25', 'KIT-ESC-2027', 5, 99.90),
  ('d3e00000-0000-4000-8000-000000000d25', 'PLN-FOF-SEM-2027', 4, 64.90),
  ('d3e00000-0000-4000-8000-000000000d26', 'EST-BOX-NDP', 120, 39.90),
  ('d3e00000-0000-4000-8000-000000000d26', 'LIV-CAD-PON', 100, 29.50),
  ('d3e00000-0000-4000-8000-000000000d34', 'CAN-NUV-ALGODAO', 4, 39.90),
  ('d3e00000-0000-4000-8000-000000000d27', 'CAD-NUV-PAS-10M', 5, 89.90),
  ('d3e00000-0000-4000-8000-000000000d27', 'CAN-GEL-PAST-6C', 5, 32.90),
  ('d3e00000-0000-4000-8000-000000000d28', 'PLN-FOF-SEM-2027', 4, 64.90),
  ('d3e00000-0000-4000-8000-000000000d28', 'ADS-NUV-LUA-120', 10, 24.90),
  ('d3e00000-0000-4000-8000-000000000d29', 'KIT-ESC-2027', 60, 79.90),
  ('d3e00000-0000-4000-8000-000000000d29', 'MARC-EST-DUP', 50, 31.90),
  ('d3e00000-0000-4000-8000-000000000d30', 'LIV-CAD-PON', 6, 36.90),
  ('d3e00000-0000-4000-8000-000000000d30', 'PAP-A4-75G', 4, 34.90),
  ('d3e00000-0000-4000-8000-000000000d31', 'CAD-NUV-PAS-10M', 80, 71.90),
  ('d3e00000-0000-4000-8000-000000000d31', 'PLN-FOF-SEM-2027', 80, 51.90),
  ('d3e00000-0000-4000-8000-000000000d32', 'EST-BOX-NDP', 4, 49.90),
  ('d3e00000-0000-4000-8000-000000000d32', 'ADS-NUV-LUA-120', 8, 24.90);

insert into orders (id, tenant_id, customer_id, channel, status, origem,
                    payment_method, created_at, total_amount,
                    venda_numero, pedido_numero, etapa)
select o.oid,
       t.id,
       (select c.id from customers c where c.email = o.cemail),
       o.channel::sales_channel, o.status, o.origem, o.pay, o.ts,
       (select coalesce(sum(i.qty * i.price), 0) from _d_i i where i.oid = o.oid),
       case when o.origem in ('pdv','loja')
            then 'V-' || lpad((row_number() over (order by o.ts))::text, 4, '0') end,
       case when o.origem = 'erp'
            then 'P-' || lpad((row_number() over (order by o.ts))::text, 4, '0') end,
       case when o.status in ('pago','processando','em_rota','entregue')
            then 'venda' else 'pedido' end
  from _d_o o
  cross join _t t
 where not exists (select 1 from orders x where x.id = o.oid);

insert into order_items (tenant_id, order_id, item_id, sku, name, unit_price, quantity, total)
select t.id, i.oid, ci.id, ci.sku, ci.name, i.price, i.qty, i.qty * i.price
  from _d_i i
  join catalog_items ci on ci.sku = i.sku
  cross join _t t
 where not exists (select 1 from order_items x where x.order_id = i.oid and x.sku = i.sku);

-- ===========================================================================
-- 7. Titulos. So nasce titulo quando a venda e "cartao" (0022); as demais
--    formas debitam Caixa direto. A liquidacao entra em
--    financial_settlements e o gatilho deferred 0022 posta no diario no
--    commit, competencia = created_at::date da liquidacao.
-- ===========================================================================
drop table if exists _tits;
create temp table _tits (
  tid    uuid primary key,
  oid    uuid,
  kind   text,       -- 'a' = a receber, 'p' = a pagar
  code   text,
  valor  numeric,
  venc   date,
  pago   date,
  forn   uuid
);

-- 7.1 A receber (11): todas liquidadas exceto a ultima (em aberto p/ outubro)
insert into _tits (tid, oid, kind, code, valor, venc, pago, forn) values
  ('d3e00000-0000-4000-8000-00000000a001', 'd3e00000-0000-4000-8000-000000000d03', 'a', 'FAT-DEMO-001', 405.20, date '2026-05-24', date '2026-05-31', null),
  ('d3e00000-0000-4000-8000-00000000a002', 'd3e00000-0000-4000-8000-000000000d04', 'a', 'FAT-DEMO-002', 9304.00, date '2026-05-28', date '2026-06-10', null),
  ('d3e00000-0000-4000-8000-00000000a003', 'd3e00000-0000-4000-8000-000000000d08', 'a', 'FAT-DEMO-003', 6940.00, date '2026-06-18', date '2026-07-02', null),
  ('d3e00000-0000-4000-8000-00000000a004', 'd3e00000-0000-4000-8000-000000000d09', 'a', 'FAT-DEMO-004', 414.00, date '2026-06-26', date '2026-07-03', null),
  ('d3e00000-0000-4000-8000-00000000a005', 'd3e00000-0000-4000-8000-000000000d14', 'a', 'FAT-DEMO-005', 7756.00, date '2026-07-21', date '2026-08-04', null),
  ('d3e00000-0000-4000-8000-00000000a006', 'd3e00000-0000-4000-8000-000000000d19', 'a', 'FAT-DEMO-006', 9686.00, date '2026-08-14', date '2026-08-27', null),
  ('d3e00000-0000-4000-8000-00000000a007', 'd3e00000-0000-4000-8000-000000000d20', 'a', 'FAT-DEMO-007', 531.20, date '2026-08-27', date '2026-09-04', null),
  ('d3e00000-0000-4000-8000-00000000a008', 'd3e00000-0000-4000-8000-000000000d23', 'a', 'FAT-DEMO-008', 9704.00, date '2026-09-15', date '2026-09-28', null),
  ('d3e00000-0000-4000-8000-00000000a009', 'd3e00000-0000-4000-8000-000000000d25', 'a', 'FAT-DEMO-009', 759.60, date '2026-09-26', date '2026-10-02', null),
  ('d3e00000-0000-4000-8000-00000000a010', 'd3e00000-0000-4000-8000-000000000d29', 'a', 'FAT-DEMO-010', 6474.50, date '2026-10-02', date '2026-10-06', null),
  ('d3e00000-0000-4000-8000-00000000a011', 'd3e00000-0000-4000-8000-000000000d31', 'a', 'FAT-DEMO-011', 9872.00, date '2026-10-20', null, null);

-- 7.2 A pagar (3): 2 liquidadas (caixa baixa) e 1 em aberto (saldo fornecedor)
insert into _tits (tid, oid, kind, code, valor, venc, pago, forn) values
  ('d3e00000-0000-4000-8000-00000000a021', null, 'p', 'NF-DEMO-RC1', 20050.00, date '2026-06-10', date '2026-06-10', 'd3e00000-0000-4000-8000-00000000c001'),
  ('d3e00000-0000-4000-8000-00000000a022', null, 'p', 'NF-DEMO-RC2', 35860.00, date '2026-08-11', date '2026-08-11', 'd3e00000-0000-4000-8000-00000000c001'),
  ('d3e00000-0000-4000-8000-00000000a023', null, 'p', 'NF-DEMO-RC3', 26186.00, date '2026-10-10', null,             'd3e00000-0000-4000-8000-00000000c002');

-- 7.3 Valor REAL do titulo: a receber vem do proprio pedido (nao se confia em
--     valor digitado a mao); a pagar vem do recebimento da compra.
alter table _tits add column val_real numeric;
update _tits x
   set val_real = case when x.kind = 'a'
                       then (select coalesce(sum(i.qty * i.price), 0)
                               from _d_i i where i.oid = x.oid)
                       else x.valor end;

-- 7.4 Cabecalho do titulo. O canal do pedido vira source_type (0008: pdv/web;
--     compra usa purchase_receipt). status = liquidado quando ja pago.
insert into financial_titles (id, tenant_id, code, direction, status, principal_amount,
                              issue_date, due_date, source_type, source_id, customer_id,
                              notes, idempotency_key, created_at)
select x.tid, t.id, x.code,
       case when x.kind = 'a' then 'receivable' else 'payable' end,
       case when x.pago is not null then 'liquidado' else 'aberto' end,
       x.val_real,
       coalesce((select o.created_at::date from orders o where o.id = x.oid),
                x.venc - 15),
       x.venc,
       case when x.kind = 'a'
            then (select case when o.origem = 'pdv' then 'pdv' else 'web' end
                    from orders o where o.id = x.oid)
            else 'purchase_receipt' end,
       coalesce(x.oid,
                (select r.id from purchase_receipts r
                  where r.code = replace(x.code, 'NF-DEMO-RC', 'RC-DEMO-00'))),
       case when x.kind = 'a'
            then (select o.customer_id from orders o where o.id = x.oid) end,
       'Titulo de demonstracao',
       'demo-titulo:' || x.tid::text,
       coalesce(x.pago, x.venc)::timestamptz + interval '10 hour'
  from _tits x
  cross join _t t
 where not exists (select 1 from financial_titles f where f.id = x.tid);

-- 7.5 Parcela unica (1x)
insert into financial_installments (id, tenant_id, title_id, number, status, due_date,
                                    principal_amount, paid_amount, settled_at, created_at)
select ('d3e00000-0000-4000-8000-000000007' || right(x.tid::text, 3))::uuid,
       t.id, x.tid, 1,
       case when x.pago is not null then 'liquidado' else 'aberto' end,
       x.venc, x.val_real,
       case when x.pago is not null then x.val_real else 0 end,
       case when x.pago is not null then x.pago::timestamptz + interval '10 hour' end,
       coalesce(x.pago, x.venc)::timestamptz + interval '10 hour'
  from _tits x
  cross join _t t
 where not exists (select 1 from financial_installments i where i.title_id = x.tid);

-- 7.6 Liquidacao: o gatilho deferred 0022 posta no diario no commit
--     (recebimento = caixa x 1.1.2; pagamento = 2.1.1 x caixa).
insert into financial_settlements (id, tenant_id, installment_id, type, amount, method,
                                   notes, idempotency_key, created_at)
select ('d3e00000-0000-4000-8000-000000008' || right(x.tid::text, 3))::uuid,
       t.id,
       ('d3e00000-0000-4000-8000-000000007' || right(x.tid::text, 3))::uuid,
       'liquidacao', x.val_real,
       case when x.kind = 'a' then 'cartao' else 'boleto' end,
       'Liquidacao de demonstracao',
       'demo-liq:' || x.tid::text,
       x.pago::timestamptz + interval '10 hour'
  from _tits x
  cross join _t t
 where x.pago is not null
   and not exists (
     select 1 from financial_settlements s
      where s.idempotency_key = 'demo-liq:' || x.tid::text);

-- ===========================================================================
-- 8. Despesas fixas: o gatilho 0023 posta no diario no commit.
--    competencia = mes da despesa; paid_at preenchido credita 1.1.1 Caixa,
--    em aberto credita 2.1.1 Fornecedores.
--    Centros de custo vem do seed_cost_centers (0021): ADM / COM / FIN / LOG.
-- ===========================================================================
drop table if exists _fixas;
create temp table _fixas (
  eid     uuid primary key,
  descr   text,
  valor   numeric,
  venc    date,
  pago    date,
  conta   text,       -- folha 6.x do plano 0021
  cc      text        -- codigo do centro de custo (0021)
);

insert into _fixas (eid, descr, valor, venc, pago, conta, cc) values
  -- MAIO
  ('d3e00000-0000-4000-8000-00000000f001', 'Aluguel loja maio/2026',        2800.00, date '2026-05-10', date '2026-05-10', '6.1.2', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f002', 'Folha de pagamento maio/2026',  1900.00, date '2026-05-05', date '2026-05-05', '6.1.1', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f003', 'Energia, agua e telefone maio',  640.00, date '2026-05-15', date '2026-05-20', '6.1.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f004', 'Marketing maio/2026',           450.00, date '2026-05-25', date '2026-05-25', '6.2.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f005', 'Frete de vendas maio',          220.00, date '2026-05-28', date '2026-05-28', '6.2.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f006', 'Contabilidade maio/2026',       160.00, date '2026-05-30', date '2026-05-30', '6.4.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f007', 'Depreciacao bens maio/2026',    250.00, date '2026-05-31', null,               '6.1.5', 'ADM'),
  -- JUNHO
  ('d3e00000-0000-4000-8000-00000000f011', 'Aluguel loja junho/2026',       2800.00, date '2026-06-10', date '2026-06-10', '6.1.2', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f012', 'Folha de pagamento junho/2026', 1900.00, date '2026-06-05', date '2026-06-05', '6.1.1', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f013', 'Energia, agua e telefone junho', 640.00, date '2026-06-15', date '2026-06-18', '6.1.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f014', 'Marketing junho/2026',          450.00, date '2026-06-25', date '2026-06-25', '6.2.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f015', 'Frete de vendas junho',         220.00, date '2026-06-28', date '2026-06-28', '6.2.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f016', 'Contabilidade junho/2026',      160.00, date '2026-06-30', date '2026-06-30', '6.4.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f017', 'Depreciacao bens junho/2026',   250.00, date '2026-06-30', null,               '6.1.5', 'ADM'),
  -- JULHO
  ('d3e00000-0000-4000-8000-00000000f021', 'Aluguel loja julho/2026',       2800.00, date '2026-07-10', date '2026-07-10', '6.1.2', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f022', 'Folha de pagamento julho/2026', 1900.00, date '2026-07-05', date '2026-07-05', '6.1.1', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f023', 'Energia, agua e telefone julho', 640.00, date '2026-07-15', date '2026-07-19', '6.1.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f024', 'Marketing julho/2026',          450.00, date '2026-07-25', date '2026-07-25', '6.2.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f025', 'Frete de vendas julho',         220.00, date '2026-07-28', date '2026-07-28', '6.2.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f026', 'Contabilidade julho/2026',      160.00, date '2026-07-30', date '2026-07-30', '6.4.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f027', 'Depreciacao bens julho/2026',   250.00, date '2026-07-31', null,               '6.1.5', 'ADM'),
  -- AGOSTO
  ('d3e00000-0000-4000-8000-00000000f031', 'Aluguel loja agosto/2026',      2800.00, date '2026-08-10', date '2026-08-10', '6.1.2', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f032', 'Folha de pagamento agosto/2026',1900.00, date '2026-08-05', date '2026-08-05', '6.1.1', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f033', 'Energia, agua e telefone agosto',640.00, date '2026-08-15', date '2026-08-21', '6.1.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f034', 'Marketing agosto/2026',         450.00, date '2026-08-25', date '2026-08-25', '6.2.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f035', 'Frete de vendas agosto',        220.00, date '2026-08-28', date '2026-08-28', '6.2.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f036', 'Contabilidade agosto/2026',     160.00, date '2026-08-30', date '2026-08-30', '6.4.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f037', 'Depreciacao bens agosto/2026',  250.00, date '2026-08-31', null,               '6.1.5', 'ADM'),
  -- SETEMBRO
  ('d3e00000-0000-4000-8000-00000000f041', 'Aluguel loja setembro/2026',    2800.00, date '2026-09-10', date '2026-09-10', '6.1.2', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f042', 'Folha de pagamento setembro/26',1900.00, date '2026-09-05', date '2026-09-05', '6.1.1', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f043', 'Energia, agua e telefone setem', 640.00, date '2026-09-15', date '2026-09-17', '6.1.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f044', 'Marketing setembro/2026',       450.00, date '2026-09-25', date '2026-09-25', '6.2.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f045', 'Frete de vendas setembro',      220.00, date '2026-09-28', date '2026-09-28', '6.2.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f046', 'Contabilidade setembro/2026',   160.00, date '2026-09-30', date '2026-09-30', '6.4.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f047', 'Depreciacao bens setembro/26',  250.00, date '2026-09-30', null,               '6.1.5', 'ADM'),
  -- OUTUBRO (competencia de outubro; algumas pagas em 06/10)
  ('d3e00000-0000-4000-8000-00000000f051', 'Aluguel loja outubro/2026',     2800.00, date '2026-10-10', date '2026-10-06', '6.1.2', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f052', 'Folha de pagamento outubro/26', 1900.00, date '2026-10-05', date '2026-10-05', '6.1.1', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f053', 'Energia, agua e telefone outub', 640.00, date '2026-10-15', null,               '6.1.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f054', 'Marketing outubro/2026',        450.00, date '2026-10-25', null,               '6.2.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f055', 'Frete de vendas outubro',       220.00, date '2026-10-28', null,               '6.2.3', 'COM'),
  ('d3e00000-0000-4000-8000-00000000f056', 'Contabilidade outubro/2026',    160.00, date '2026-10-30', null,               '6.4.2', 'ADM'),
  ('d3e00000-0000-4000-8000-00000000f057', 'Depreciacao bens outubro/26',   250.00, date '2026-10-31', null,               '6.1.5', 'ADM');

-- 8.1 Despesas pagas/abertas -> gatilho 0023 escreve o diario no commit
insert into expenses (id, tenant_id, competencia, description, account_code,
                      cost_center_id, amount, recurring, paid_at, created_at)
select x.eid, t.id, date_trunc('month', x.venc)::date, x.descr, x.conta,
       (select c.id from cost_centers c
         where c.tenant_id = t.id and c.code = x.cc),
       x.valor, true, x.pago,
       (coalesce(x.pago, x.venc) + interval '9 hour')
  from _fixas x
  cross join _t t
 where x.conta <> '6.1.5'
   and not exists (select 1 from expenses e where e.id = x.eid);

-- 8.2 Depreciacao: nao sai do caixa, entra direto no diario
--     (debita 6.1.5 Despesa de depreciacao, credita 1.2.2 Deprec. acumulada)
select journal_post(
         p_tenant       => t.id,
         p_competencia  => date_trunc('month', x.venc)::date,
         p_source_type  => 'manual',
         p_source_id    => null,
         p_description  => x.descr,
         p_document     => null,
         p_cost_center  => (select c.id from cost_centers c
                             where c.tenant_id = t.id and c.code = x.cc),
         p_lines         => jsonb_build_array(
           jsonb_build_object('code', '6.1.5', 'debit', x.valor, 'credit', 0),
           jsonb_build_object('code', '1.2.2', 'debit', 0,       'credit', x.valor)),
         p_idem         => 'demo:depr:' || to_char(date_trunc('month', x.venc)::date, 'YYYYMM'))
  from _fixas x
  cross join _t t
 where x.conta = '6.1.5';

-- O diario das vendas, compras, recebimentos e despesas e escrito por
-- gatilhos DEFERRED: eles so rodam no COMMIT. Por isso o seed fecha a
-- transacao aqui e abre outra para o passo 9, que le o diario ja pronto.
commit;
begin;

-- ===========================================================================
-- 9. PIS/COFINS e IRPJ/CSLL, calculados sobre o diario que ja existe.
--    Contas 4.2.1 (deducao da receita) e 6.5.1 (IR) sao folhas do plano 0021.
-- ===========================================================================
drop table if exists _mes;
create temp table _mes (
  comp      date primary key,
  receita   numeric,
  deducao   numeric,
  pis       numeric,
  cmv       numeric,
  despesas  numeric,
  outras    numeric,
  ir        numeric
);

insert into _mes (comp, receita, deducao, pis, cmv, despesas, outras, ir)
select m.comp,
       m.rb,
       m.dd,
       round(m.rb * 0.0365, 2),
       m.cmv,
       m.desp,
       m.outras,
       round(greatest(0, m.rb - m.dd - round(m.rb * 0.0365, 2) - m.cmv - m.desp + m.outras)
             * 0.145, 2)
  from (
    select date_trunc('month', e.competencia)::date as comp,
           coalesce(sum(case when l.code = '4.1.1' then l.credit else 0 end), 0) as rb,
           coalesce(sum(case when l.code like '4.2.%' and e.source_type <> 'manual'
                             then l.debit else 0 end), 0) as dd,
           coalesce(sum(case when l.code like '5.1.%' then l.debit else 0 end), 0) as cmv,
           coalesce(sum(case when l.code like '6.%' and l.code <> '6.5.1'
                             then l.debit else 0 end), 0)
         - coalesce(sum(case when l.code like '6.3.%' then l.credit else 0 end), 0) as desp,
           coalesce(sum(case when l.code like '4.3.%' then l.credit else 0 end), 0) as outras
      from journal_entries e
      join journal_entry_lines l on l.entry_id = e.id
     cross join _t t
     where e.tenant_id = t.id
       and e.source_type in ('venda', 'compra', 'despesa', 'manual', 'recebimento', 'pagamento')
     group by date_trunc('month', e.competencia)
  ) m;

-- 9.1 PIS/COFINS 3,65% sobre a receita bruta: reduz a receita liquida
select journal_post(
         p_tenant       => t.id,
         p_competencia  => x.comp,
         p_source_type  => 'manual',
         p_source_id    => null,
         p_description  => 'PIS/COFINS 3,65% s/ vendas ' || to_char(x.comp, 'MM/YYYY') || ' (demonstracao)',
         p_document     => null,
         p_cost_center  => null,
         p_lines         => jsonb_build_array(
           jsonb_build_object('code', '4.2.1', 'debit', x.pis, 'credit', 0),
           jsonb_build_object('code', '2.1.1', 'debit', 0,      'credit', x.pis)),
         p_idem         => 'demo:pis:' || to_char(x.comp, 'YYYYMM'))
  from _mes x
  cross join _t t
 where x.pis > 0;

-- 9.2 IRPJ/CSLL 14,5% sobre o resultado do mes apos o PIS/COFINS
select journal_post(
         p_tenant       => t.id,
         p_competencia  => x.comp,
         p_source_type  => 'manual',
         p_source_id    => null,
         p_description  => 'IRPJ/CSLL ' || to_char(x.comp, 'MM/YYYY') || ' (demonstracao)',
         p_document     => null,
         p_cost_center  => null,
         p_lines         => jsonb_build_array(
           jsonb_build_object('code', '6.5.1', 'debit', x.ir, 'credit', 0),
           jsonb_build_object('code', '2.1.1', 'debit', 0,     'credit', x.ir)),
         p_idem         => 'demo:ir:' || to_char(x.comp, 'YYYYMM'))
  from _mes x
  cross join _t t
 where x.ir > 0;

-- ===========================================================================
-- 10. Caixa: 3 sessoes de outubro
-- ===========================================================================
insert into caixa_sessions (id, tenant_id, status, opened_at, closed_at,
                            opening_amount, expected_amount, counted_amount,
                            difference_amount, idempotency_key, created_at)
select v.id, t.id, 'fechado', v.open, v.close, v.ini, v.ini, v.ini, 0,
       v.idem, v.open
  from (values
    ('d3e00000-0000-4000-8000-00000000ca01'::uuid, timestamp '2026-10-01 08:00', timestamp '2026-10-01 18:00', 1500.00::numeric, 'demo-caixa-01'::text),
    ('d3e00000-0000-4000-8000-00000000ca02'::uuid, timestamp '2026-10-02 08:00', timestamp '2026-10-02 18:00', 1200.00::numeric, 'demo-caixa-02'::text),
    ('d3e00000-0000-4000-8000-00000000ca03'::uuid, timestamp '2026-10-03 08:00', timestamp '2026-10-03 18:00', 1800.00::numeric, 'demo-caixa-03'::text)
  ) v(id, open, close, ini, idem)
  cross join _t t
 where not exists (select 1 from caixa_sessions s where s.id = v.id);

insert into caixa_movements (id, tenant_id, session_id, movement_type, direction,
                             amount, reason, idempotency_key, created_at)
select v.id, t.id, v.sid, v.tipo, v.dir, v.amt, v.descr, v.idem, v.ts
  from (values
    ('d3e00000-0000-4000-8000-00000000cb01'::uuid, 'd3e00000-0000-4000-8000-00000000ca01'::uuid, 'sangria'::text,    'out'::text, 380.00::numeric, 'Reposicao de troco'::text,              'demo-mv-01'::text, timestamp '2026-10-01 08:10'),
    ('d3e00000-0000-4000-8000-00000000cb02'::uuid, 'd3e00000-0000-4000-8000-00000000ca02'::uuid, 'suprimento'::text, 'in'::text,  400.00::numeric, 'Suprimento de caixa'::text,             'demo-mv-02'::text, timestamp '2026-10-02 08:15'),
    ('d3e00000-0000-4000-8000-00000000cb03'::uuid, 'd3e00000-0000-4000-8000-00000000ca03'::uuid, 'sangria'::text,    'out'::text, 250.00::numeric, 'Material de escritorio'::text,          'demo-mv-03'::text, timestamp '2026-10-03 14:00'),
    ('d3e00000-0000-4000-8000-00000000cb04'::uuid, 'd3e00000-0000-4000-8000-00000000ca03'::uuid, 'suprimento'::text, 'in'::text,  759.60::numeric, 'Recebimento titulo FAT-DEMO-009'::text, 'demo-mv-04'::text, timestamp '2026-10-03 16:30')
  ) v(id, sid, tipo, dir, amt, descr, idem, ts)
  cross join _t t
 where not exists (select 1 from caixa_movements m where m.id = v.id);

-- ===========================================================================
-- Resumo (o helper devolve o ultimo result set com linhas)
-- ===========================================================================
select (select count(*) from orders)                                as pedidos,
       (select count(*) from purchase_orders)                       as compras,
       (select count(*) from financial_titles)                      as titulos,
       (select count(*) from financial_settlements)                 as liquidacoes,
       (select count(*) from expenses)                              as despesas,
       (select count(*) from journal_entries)                       as lancamentos,
       (select count(*) from journal_entry_lines)                   as linhas,
       (select count(*) from tenant_accounts)                       as contas,
       round((select coalesce(sum(total_amount), 0) from orders
               where status not in ('cancelado', 'aguardando_pagamento')), 2) as receita,
       round((select coalesce(sum(stock_on_hand * coalesce(icd.cost_price, 0)), 0)
                from item_stock s join item_commercial_data icd on icd.item_id = s.item_id), 2) as estoque,
       (select round(sum(debit), 2)  from journal_entry_lines)      as debito,
       (select round(sum(credit), 2) from journal_entry_lines)      as credito;

select comp                             as mes,
       receita                          as receita_bruta,
       pis                              as deducao_pis_cofins,
       receita - pis                    as receita_liquida,
       cmv,
       receita - pis - cmv              as lucro_bruto,
       despesas                         as despesas_operacionais,
       outras                           as outras_receitas,
       ir                               as irpj_csll,
       receita - pis - cmv - despesas + outras - ir as resultado_liquido
  from _mes
 order by comp;

commit;
