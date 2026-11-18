-- 0057_preflight.sql - rodar antes de aplicar. Tudo true = seguro.
-- Somente leitura.
select
  (select to_regclass('public.catalog_grupos') is null) as grupos_livre,
  (select to_regclass('public.catalog_setores') is null) as setores_livre,
  (select exists (select 1 from public.tenants
                   where id = '00000000-0000-0000-0000-000000000001')) as tenant_existe,
  (select count(*) > 0 from public.catalog_items
    where tenant_id = '00000000-0000-0000-0000-000000000001'
      and category = 'CADERNOS') as tem_cadernos,
  -- os 11 produtos a mover estao no setor de origem esperado
  (select count(*) = 11 from public.catalog_items ci
     join (values ('BLT11','POP IT'), ('BLT08','BLOCO DE NOTAS'), ('BZ341','AGENDAS'),
                  ('BLT94','ORGANIZADORES'), ('WWJJ02','ORGANIZADORES'),
                  ('WJD-01','ESTOJOS'), ('WJD-02','ESTOJOS'), ('WJD-04-1','ESTOJOS'),
                  ('JJ17','CALCULADORAS'), ('JJ18','CALCULADORAS'),
                  ('YZB59-1008','NATAL')) m(sku, origem)
       on ci.sku = m.sku and ci.category = m.origem
    where ci.tenant_id = '00000000-0000-0000-0000-000000000001') as moves_no_lugar,
  -- nenhum setor novo de caderno ja em uso (nao misturar com produto antigo)
  (select not exists (select 1 from public.catalog_items
    where tenant_id = '00000000-0000-0000-0000-000000000001'
      and category in ('INTELIGENTE / DISCOS','DESENHO','ESPIRAL','DECORATIVO',
                       'CADERNETA / MINI','BROCHURA','PLANNER','FICHÁRIO'))) as subgrupos_livres;
