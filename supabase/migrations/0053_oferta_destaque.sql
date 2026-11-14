-- 0053_oferta_destaque_flags.sql
-- Flags de vitrine: em_oferta (banner de Ofertas) e em_destaque (banner de
-- Destaques) em catalog_items. As colunas ja existem no STAGING
-- (cwfvxthfwbvpfjhsxpmc) desde a aplicacao manual anterior; esta migration
-- as versiona. Idempotente: seguro rodar em base que ja tenha as colunas.
-- Dependencia: a vitrine (getStoreProducts) le estas colunas no select,
-- entao precisa estar aplicada em producao ANTES do deploy que as usa.
alter table public.catalog_items add column if not exists em_oferta boolean not null default false;
alter table public.catalog_items add column if not exists em_destaque boolean not null default false;

comment on column public.catalog_items.em_oferta is
  'Item em oferta: aparece no banner de Ofertas da vitrine.';
comment on column public.catalog_items.em_destaque is
  'Item em destaque: aparece no banner de Destaques da vitrine.';
