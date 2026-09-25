-- seed.sql — 6 produtos reais extraídos do canvas de design (Main.dc.html),
-- canal varejo, tenant único Nuvem de Papel.
-- NCM/CST abaixo são placeholders plausíveis para papelaria — validar com
-- contador antes de emitir qualquer NF-e real (mesma ressalva do parecer
-- técnico original: fiscal exige revisão profissional, não é dado final).

with novo_item as (
  insert into catalog_items (tenant_id, sku, name, category)
  values
    ('00000000-0000-0000-0000-000000000001', 'CAD-NUV-PAS-10M', 'Caderno Nuvem Pastel 10 Matérias', 'Cadernos'),
    ('00000000-0000-0000-0000-000000000001', 'PLN-FOF-SEM-2027', 'Planner Semanal 2027', 'Planners'),
    ('00000000-0000-0000-0000-000000000001', 'ADS-NUV-LUA-120', 'Kit Adesivos Nuvem & Lua (120un)', 'Adesivos'),
    ('00000000-0000-0000-0000-000000000001', 'EST-BOX-NDP', 'Estojo Box Nuvem de Papel', 'Material Escolar'),
    ('00000000-0000-0000-0000-000000000001', 'CAN-NUV-ALGODAO', 'Caneca Nuvem de Algodão', 'Presentes'),
    ('00000000-0000-0000-0000-000000000001', 'CAN-GEL-PAST-6C', 'Kit Canetas Gel Pastel (6 cores)', 'Material Escolar')
  returning id, sku
)
select * from novo_item;

-- fiscal (NCM placeholder — revisar com contador)
insert into item_fiscal_data (item_id, ncm, cst_csosn, icms_rate, ipi_rate, weight_kg)
select id, v.ncm, v.cst_csosn, v.icms_rate, v.ipi_rate, v.weight_kg
from catalog_items c
join (values
  ('CAD-NUV-PAS-10M', '4820.20.00', '102', 18.0000, 0.0000, 0.420),
  ('PLN-FOF-SEM-2027', '4820.10.00', '102', 18.0000, 0.0000, 0.380),
  ('ADS-NUV-LUA-120', '4911.91.00', '102', 18.0000, 0.0000, 0.050),
  ('EST-BOX-NDP', '4202.92.00', '102', 18.0000, 0.0000, 0.220),
  ('CAN-NUV-ALGODAO', '6912.00.00', '102', 18.0000, 0.0000, 0.350),
  ('CAN-GEL-PAST-6C', '9608.10.00', '102', 18.0000, 0.0000, 0.060)
) as v(sku, ncm, cst_csosn, icms_rate, ipi_rate, weight_kg) on v.sku = c.sku
where c.tenant_id = '00000000-0000-0000-0000-000000000001';

-- comercial (custo/margem/estoque mínimo — valores de teste)
insert into item_commercial_data (item_id, cost_price, margin_percent, min_stock)
select id, v.cost_price, v.margin_percent, v.min_stock
from catalog_items c
join (values
  ('CAD-NUV-PAS-10M', 42.00, 114.0, 20),
  ('PLN-FOF-SEM-2027', 28.00, 132.0, 15),
  ('ADS-NUV-LUA-120', 9.50, 162.0, 40),
  ('EST-BOX-NDP', 21.00, 137.0, 15),
  ('CAN-NUV-ALGODAO', 15.00, 166.0, 25),
  ('CAN-GEL-PAST-6C', 12.00, 174.0, 30)
) as v(sku, cost_price, margin_percent, min_stock) on v.sku = c.sku
where c.tenant_id = '00000000-0000-0000-0000-000000000001';

-- preço, canal varejo (regra 4: channel default varejo)
insert into item_prices (item_id, channel, price, min_quantity)
select id, 'varejo', v.price, 1
from catalog_items c
join (values
  ('CAD-NUV-PAS-10M', 89.90),
  ('PLN-FOF-SEM-2027', 64.90),
  ('ADS-NUV-LUA-120', 24.90),
  ('EST-BOX-NDP', 49.90),
  ('CAN-NUV-ALGODAO', 39.90),
  ('CAN-GEL-PAST-6C', 32.90)
) as v(sku, price) on v.sku = c.sku
where c.tenant_id = '00000000-0000-0000-0000-000000000001';
