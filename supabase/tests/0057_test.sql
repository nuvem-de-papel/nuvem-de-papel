-- 0057_test.sql - SQL puro (pgTAP nao instalado no staging/producao, ver 0042).
-- Grupos de setores: 2 tabelas com RLS e leitura publica, 9 grupos, 49
-- setores, CADERNOS dividido, POP IT vazio e todo setor de produto mapeado.
-- Gate: a ultima linha FALHAS tem que ser true. Somente leitura.
with t as (select '00000000-0000-0000-0000-000000000001'::uuid as id),
checks as (
  select 'catalog_grupos existe' as teste, to_regclass('public.catalog_grupos') is not null as ok
  union all
  select 'catalog_setores existe', to_regclass('public.catalog_setores') is not null
  union all
  select 'RLS ligado nas duas',
    (select bool_and(relrowsecurity) from pg_class
      where oid in ('public.catalog_grupos'::regclass, 'public.catalog_setores'::regclass))
  union all
  select 'anon le grupos', has_table_privilege('anon', 'public.catalog_grupos', 'select')
  union all
  select 'anon le setores', has_table_privilege('anon', 'public.catalog_setores', 'select')
  union all
  select 'anon NAO escreve grupos', not has_table_privilege('anon', 'public.catalog_grupos', 'insert')
  union all
  select 'authenticated NAO escreve setores', not has_table_privilege('authenticated', 'public.catalog_setores', 'update')
  union all
  select '9 grupos', (select count(*) = 9 from public.catalog_grupos where tenant_id = (select id from t))
  union all
  select '49 setores', (select count(*) = 49 from public.catalog_setores where tenant_id = (select id from t))
  union all
  select 'todo grupo tem setor',
    not exists (select 1 from public.catalog_grupos g where g.tenant_id = (select id from t)
                and not exists (select 1 from public.catalog_setores s where s.grupo_id = g.id))
  union all
  select 'CADERNOS dividido (0 itens)',
    not exists (select 1 from public.catalog_items where tenant_id = (select id from t) and category = 'CADERNOS')
  union all
  select 'POP IT vazio',
    not exists (select 1 from public.catalog_items where tenant_id = (select id from t) and category = 'POP IT')
  union all
  select 'todo produto com setor tem grupo (exceto E2E)',
    not exists (select 1 from public.catalog_items ci
                where ci.tenant_id = (select id from t)
                  and ci.category is not null and ci.category <> 'E2E'
                  and not exists (select 1 from public.catalog_setores s
                                  where s.tenant_id = ci.tenant_id and s.nome = ci.category))
  union all
  select 'post-it ursinho em POST-IT',
    exists (select 1 from public.catalog_items where tenant_id = (select id from t) and sku = 'BLT11' and category = 'POST-IT')
  union all
  select 'planner semanal em PLANNER',
    exists (select 1 from public.catalog_items where tenant_id = (select id from t) and sku = 'BLT94' and category = 'PLANNER')
  union all
  select 'chaveiros em BRINQUEDOS',
    (select count(*) = 2 from public.catalog_items where tenant_id = (select id from t)
      and sku in ('JJ17','JJ18') and category = 'BRINQUEDOS')
)
select teste, ok from checks
union all
select 'FALHAS', count(*) = 0 from checks where not ok;
