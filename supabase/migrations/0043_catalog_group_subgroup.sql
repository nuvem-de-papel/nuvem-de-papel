-- 0043_catalog_group_subgroup.sql
-- Pedido do dono (08/11/2026): cadastro de produto nao tinha campo de
-- Grupo/Subgrupo para classificar o catalogo (ex.: Canetas e Lapiseiras >
-- Canetas, Cadernos > Cadernos/Agendas/Refil). "Setor" (category) ja existia
-- e continua existindo sem mudanca - estes sao 2 campos novos, opcionais,
-- sem nenhum impacto fiscal (NF-e/NFC-e/CF-e nao usam estas colunas).

begin;

alter table catalog_items
  add column if not exists group_name text,
  add column if not exists subgroup_name text;

comment on column catalog_items.group_name is
  'Classificacao interna do produto (ex.: "Canetas e Lapiseiras", "Cadernos"). Nao usado em NF-e/fiscal.';
comment on column catalog_items.subgroup_name is
  'Subclassificacao dentro do grupo (ex.: "Canetas", "Cadernos, Agendas e Refil"). Nao usado em NF-e/fiscal.';

commit;
