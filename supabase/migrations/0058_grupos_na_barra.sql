-- 0058 - Grupos na barra do topo (19/11/2026)
-- A 2a linha da barra da loja mostra "Todos os setores" + os grupos marcados
-- aqui. Trocar quem aparece na barra = marcar/desmarcar na tela
-- /configuracoes/setores (sem codigo, sem migration).
begin;

alter table public.catalog_grupos
  add column if not exists na_barra boolean not null default false;

comment on column public.catalog_grupos.na_barra is
  'true = o grupo aparece como atalho na 2a linha da barra da loja (ordem = catalog_grupos.ordem).';

-- semente aprovada pelo Joaquim (19/11/2026): so liga se ninguem mexeu ainda
update public.catalog_grupos g
   set na_barra = true
 where g.slug in ('cadernos', 'papeis-e-agendas', 'lapis-e-canetas', 'infantil-e-livros', 'arte-e-pintura')
   and not exists (select 1 from public.catalog_grupos x where x.tenant_id = g.tenant_id and x.na_barra);

commit;
