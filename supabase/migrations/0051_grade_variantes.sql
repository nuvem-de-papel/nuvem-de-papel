-- 0051_grade_variantes.sql
-- Grade de produto: um produto principal (sku = grupo, ex.: BLT38) e as
-- variantes (ex.: BLT38A/B/C) com grupo_pai = principal. Cada variante tem
-- estoque, preco e foto proprios (catalog_items + item_images).
-- Aplicada no STAGING (cwfvxthfwbvpfjhsxpmc) em 2026-11-12 como teste.
alter table catalog_items add column if not exists grupo_pai text;
alter table catalog_items add column if not exists cor text;

comment on column catalog_items.grupo_pai is
  'SKU do produto pai da grade (ex.: BLT38). Itens da mesma grade compartilham o mesmo grupo_pai. Null = item sem grade.';
comment on column catalog_items.cor is
  'Rotulo da variante dentro da grade (ex.: Modelo 1, Modelo 2). Exibido no seletor da pagina do produto.';

create index if not exists idx_catalog_items_grupo_pai
  on catalog_items(grupo_pai) where grupo_pai is not null;
