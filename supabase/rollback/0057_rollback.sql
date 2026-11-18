-- 0057_rollback.sql - desfaz os grupos de setores.
-- ATENCAO: reverter ANTES o deploy que le catalog_grupos/catalog_setores
-- (menu da loja, catalogo admin, cadastro), senao essas telas quebram.
-- Produto cadastrado DEPOIS da 0057 num subgrupo de caderno (ESPIRAL,
-- DESENHO...) tambem volta para CADERNOS.
begin;

-- 1. produtos movidos voltam ao setor de origem (antes do passo 2)
update public.catalog_items ci
set category = m.origem
from (values
  ('BLT11',      'POP IT',         'POST-IT'),
  ('BLT08',      'BLOCO DE NOTAS', 'POST-IT'),
  ('BZ341',      'AGENDAS',        'BROCHURA'),
  ('BLT94',      'ORGANIZADORES',  'PLANNER'),
  ('WWJJ02',     'ORGANIZADORES',  'PRANCHETAS'),
  ('WJD-01',     'ESTOJOS',        'ORGANIZADORES'),
  ('WJD-02',     'ESTOJOS',        'ORGANIZADORES'),
  ('WJD-04-1',   'ESTOJOS',        'ORGANIZADORES'),
  ('JJ17',       'CALCULADORAS',   'BRINQUEDOS'),
  ('JJ18',       'CALCULADORAS',   'BRINQUEDOS'),
  ('YZB59-1008', 'NATAL',          'CANETAS')
) as m(sku, origem, novo)
where ci.tenant_id = '00000000-0000-0000-0000-000000000001'
  and ci.sku = m.sku and ci.category = m.novo;

-- 2. tipos de caderno voltam para CADERNOS
update public.catalog_items
set category = 'CADERNOS'
where tenant_id = '00000000-0000-0000-0000-000000000001'
  and category in ('INTELIGENTE / DISCOS','DESENHO','ESPIRAL','DECORATIVO',
                   'CADERNETA / MINI','BROCHURA','PLANNER','FICHÁRIO');

-- 3. tabelas
drop table if exists public.catalog_setores;
drop table if exists public.catalog_grupos;

commit;
