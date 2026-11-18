-- 0057_grupos_setores.sql
-- Grupos de setores (18/11/2026, aprovado pelo Joaquim no artefato
-- "Grupos de Setores", versao 4): o catalogo tinha 43 setores soltos
-- (catalog_items.category, texto em MAIUSCULAS vindo do JQ). Agora fica em
-- dois niveis: GRUPO (9, com icone) > SUBGRUPO (= o setor de sempre, 49).
--
-- Modelo:
--   catalog_grupos  = o grupo (nome, slug, icone, ordem). Leitura publica:
--                     o menu da loja (visitante anonimo) lista os grupos.
--   catalog_setores = qual grupo cada setor pertence (chave = o texto de
--                     catalog_items.category). Setor fora desta tabela
--                     aparece como "Sem grupo" (ex.: setor novo digitado no
--                     cadastro antes de escolher o grupo).
--   catalog_items.category continua sendo o subgrupo: nenhum leitor antigo
--   quebra (checkout, PDV, relatorios, importador JQ).
--
-- Dados (mesma transacao):
--   1. CADERNOS (176 itens) se divide pelo TIPO, lido do nome: INTELIGENTE /
--      DISCOS, DESENHO, ESPIRAL, DECORATIVO, CADERNETA / MINI, BROCHURA,
--      PLANNER, FICHARIO. A ordem do CASE importa (primeira regra que casa).
--   2. 11 produtos fora do lugar mudam de setor (por SKU, conferindo o setor
--      de origem - rodar de novo nao faz nada).
--   3. POP IT fica sem produto (o unico era um post-it) e nao entra no mapa:
--      o setor deixa de existir.
-- Rollback: rollback/0057_rollback.sql devolve os setores antigos.
-- Dependencia: a loja (categoriasProdutos.ts) casava /^cadernos$/; o deploy
-- que le os grupos tem de subir logo depois desta migration em producao.

begin;

create table if not exists public.catalog_grupos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  nome text not null check (char_length(nome) between 2 and 60 and nome = btrim(nome)),
  icone text not null check (icone ~ '^[a-z-]{2,30}$'),
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, nome)
);

create table if not exists public.catalog_setores (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 60 and nome = btrim(nome)),
  grupo_id uuid not null references public.catalog_grupos(id) on delete restrict,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  primary key (tenant_id, nome)
);

create index if not exists idx_catalog_setores_grupo on public.catalog_setores (grupo_id);

comment on table public.catalog_grupos is
  'Grupo de setores do catalogo (menu da loja e catalogo admin). icone = chave do desenho SVG em src/lib/gruposSetores.ts.';
comment on table public.catalog_setores is
  'Setor (= catalog_items.category) -> grupo. Setor sem linha aqui aparece como "Sem grupo".';

-- RLS: leitura publica (o menu da loja roda anonimo); escrita so service_role.
alter table public.catalog_grupos enable row level security;
alter table public.catalog_setores enable row level security;

drop policy if exists catalog_grupos_public_read on public.catalog_grupos;
create policy catalog_grupos_public_read on public.catalog_grupos
  for select using (ativo);

drop policy if exists catalog_setores_public_read on public.catalog_setores;
create policy catalog_setores_public_read on public.catalog_setores
  for select using (true);

revoke all on public.catalog_grupos, public.catalog_setores from anon, authenticated;
grant select on public.catalog_grupos, public.catalog_setores to anon, authenticated;
grant all on public.catalog_grupos, public.catalog_setores to service_role;

-- Semente: 9 grupos (ordem do menu)
insert into public.catalog_grupos (tenant_id, slug, nome, icone, ordem)
select t.id, g.slug, g.nome, g.icone, g.ordem
from public.tenants t
cross join (values
  ('cadernos',                 'CADERNOS',                 'caderno',  1),
  ('papeis-e-agendas',         'PAPÉIS E AGENDAS',         'agenda',   2),
  ('lapis-e-canetas',          'LÁPIS E CANETAS',          'lapis',    3),
  ('arte-e-pintura',           'ARTE E PINTURA',           'paleta',   4),
  ('material-escolar',         'MATERIAL ESCOLAR',         'mochila',  5),
  ('escritorio-e-organizacao', 'ESCRITÓRIO E ORGANIZAÇÃO', 'maleta',   6),
  ('adesivos-e-presentes',     'ADESIVOS E PRESENTES',     'presente', 7),
  ('infantil-e-livros',        'INFANTIL E LIVROS',        'livro',    8),
  ('datas-comemorativas',      'DATAS COMEMORATIVAS',      'estrela',  9)
) as g(slug, nome, icone, ordem)
where t.id = '00000000-0000-0000-0000-000000000001'
on conflict (tenant_id, slug) do nothing;

-- Semente: 49 setores -> grupo
insert into public.catalog_setores (tenant_id, nome, grupo_id, ordem)
select g.tenant_id, s.nome, g.id, s.ordem
from (values
  ('cadernos', 'INTELIGENTE / DISCOS', 1), ('cadernos', 'DESENHO', 2),
  ('cadernos', 'ESPIRAL', 3), ('cadernos', 'DECORATIVO', 4),
  ('cadernos', 'CADERNETA / MINI', 5), ('cadernos', 'BROCHURA', 6),
  ('cadernos', 'PLANNER', 7), ('cadernos', 'FICHÁRIO', 8),
  ('cadernos', 'REFIL DE FOLHAS', 9),
  ('papeis-e-agendas', 'POST-IT', 1), ('papeis-e-agendas', 'AGENDAS', 2),
  ('papeis-e-agendas', 'BLOCO DE NOTAS', 3),
  ('lapis-e-canetas', 'CANETAS', 1), ('lapis-e-canetas', 'BORRACHAS', 2),
  ('lapis-e-canetas', 'CORRETIVOS', 3), ('lapis-e-canetas', 'FINE LINE', 4),
  ('lapis-e-canetas', 'CANETAS TOUCH', 5), ('lapis-e-canetas', 'LAPIS', 6),
  ('lapis-e-canetas', 'LAPISEIRAS', 7), ('lapis-e-canetas', 'GRAFITES', 8),
  ('arte-e-pintura', 'MARCADORES', 1), ('arte-e-pintura', 'PONTA DUPLA BRUSH', 2),
  ('arte-e-pintura', 'GIZ DE CERA', 3), ('arte-e-pintura', 'TINTAS', 4),
  ('arte-e-pintura', 'MALETA DE PINTURA', 5), ('arte-e-pintura', 'MASSINHA', 6),
  ('arte-e-pintura', 'CANETINHAS', 7), ('arte-e-pintura', 'CARIMBOS', 8),
  ('material-escolar', 'APONTADORES', 1), ('material-escolar', 'ESTOJOS', 2),
  ('material-escolar', 'REGUAS', 3), ('material-escolar', 'TESOURAS', 4),
  ('material-escolar', 'COLAS', 5), ('material-escolar', 'BOLSAS E MOCHILAS', 6),
  ('escritorio-e-organizacao', 'ORGANIZADORES', 1), ('escritorio-e-organizacao', 'GRAMPEADORES', 2),
  ('escritorio-e-organizacao', 'CALCULADORAS', 3), ('escritorio-e-organizacao', 'QUADROS/LOUSAS', 4),
  ('escritorio-e-organizacao', 'PRANCHETAS', 5), ('escritorio-e-organizacao', 'UTILIDADES', 6),
  ('adesivos-e-presentes', 'ADESIVOS', 1), ('adesivos-e-presentes', 'SACOLAS DE PRESENTE', 2),
  ('infantil-e-livros', 'BRINQUEDOS', 1), ('infantil-e-livros', 'LIVROS INTERATIVOS', 2),
  ('infantil-e-livros', 'LIVROS DE COLORIR', 3), ('infantil-e-livros', 'LIVROS', 4),
  ('infantil-e-livros', 'MESA INFANTIL', 5),
  ('datas-comemorativas', 'NATAL', 1), ('datas-comemorativas', 'COPA DO MUNDO 2026', 2)
) as s(grupo_slug, nome, ordem)
join public.catalog_grupos g
  on g.slug = s.grupo_slug and g.tenant_id = '00000000-0000-0000-0000-000000000001'
on conflict (tenant_id, nome) do nothing;

-- Dados 1: CADERNOS -> tipo (nome sem acento, minusculo; primeira regra vence)
update public.catalog_items ci
set category = case
  when x.n ~ 'fichario' then 'FICHÁRIO'
  when x.n ~ 'inteligente|disco' then 'INTELIGENTE / DISCOS'
  when x.n ~ 'desenho|sketch' then 'DESENHO'
  when x.n ~ 'espiral' then 'ESPIRAL'
  when x.n ~ 'brochura' then 'BROCHURA'
  when x.n ~ 'caderneta|mini|pequen|a6|a7' then 'CADERNETA / MINI'
  when x.n ~ 'planner' then 'PLANNER'
  else 'DECORATIVO'
end
from (
  select id, lower(translate(name,
    'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')) as n
  from public.catalog_items
  where tenant_id = '00000000-0000-0000-0000-000000000001' and category = 'CADERNOS'
) x
where ci.id = x.id;

-- Dados 2: produtos fora do lugar (sku, setor de origem, setor novo)
update public.catalog_items ci
set category = m.novo
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
  and ci.sku = m.sku and ci.category = m.origem;

commit;
