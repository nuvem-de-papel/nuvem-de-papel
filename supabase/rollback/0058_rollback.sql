-- 0058 - rollback: a barra volta a nao ter atalhos de grupo.
alter table public.catalog_grupos drop column if exists na_barra;
