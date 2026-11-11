-- 0048_item_images_product_reviews.sql
-- Galeria de fotos por produto (1 capa + secundarias) e avaliacoes por
-- produto (nota/comentario), separadas de review_requests (0003), que e
-- por PEDIDO e nao identifica qual item do pedido recebeu a nota.
-- Decisao do dono (2026-11-10): schema aprovado antes de migrar fotos.

-- 1) Galeria de fotos --------------------------------------------------------
create table if not exists item_images (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  item_id uuid not null references catalog_items(id) on delete cascade,
  url text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (item_id, position)
);

comment on table item_images is
  'Galeria de fotos por produto: position=0 e a foto principal (capa), 1-4 sao secundarias para a tela de vendas.';
comment on column item_images.position is
  '0 = foto principal/capa (sempre exibida). 1 a 4 = fotos adicionais da tela de vendas.';

create index if not exists idx_item_images_item on item_images(item_id);

alter table item_images enable row level security;

-- mesmo padrao de leitura publica da 0001 (catalog_items_public_read):
-- so mostra foto de produto ativo. Escrita fica so para service_role.
create policy item_images_public_read on item_images
  for select using (
    exists (
      select 1 from catalog_items ci
      where ci.id = item_images.item_id and ci.active = true
    )
  );

-- 2) Avaliacoes por produto ---------------------------------------------------
create table if not exists product_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  item_id uuid not null references catalog_items(id) on delete cascade,
  customer_id uuid references customers(id),
  nota smallint not null check (nota between 1 and 5),
  comentario text,
  aprovado boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table product_reviews is
  'Avaliacoes por PRODUTO (nota 1-5 + comentario). Separada de review_requests (0003), que e por pedido e nao identifica o item avaliado. Comeca vazia - populada manualmente ou por fluxo futuro de pos-venda.';
comment on column product_reviews.aprovado is
  'Moderacao antes de aparecer no site publico. false = ainda nao revisado, nao aparece na tela de vendas.';

create index if not exists idx_product_reviews_item on product_reviews(item_id);

alter table product_reviews enable row level security;

-- leitura publica so de avaliacao aprovada, de produto ativo.
create policy product_reviews_public_read on product_reviews
  for select using (
    aprovado = true
    and exists (
      select 1 from catalog_items ci
      where ci.id = product_reviews.item_id and ci.active = true
    )
  );

-- escrita (insert/update) fica so para service_role por ora - sem fluxo de
-- cliente autenticado enviando avaliacao ainda (fica para quando o
-- pos-venda/CRM pedir isso explicitamente).
