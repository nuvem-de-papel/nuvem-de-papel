-- 0001_core_multi_tenant_catalog.sql
-- Nuvem de Papel — schema inicial. Aplica desde o dia 1 as 5 regras do parecer de
-- migração (ver AGENTS.md): UUID, tenant_id, catálogo separado fiscal/comercial,
-- channel varejo/atacado, branding_tokens estruturado.

create extension if not exists pgcrypto;

-- 1. Tenants ------------------------------------------------------------
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- Regra 5: identidade visual como JSON estruturado, nunca CSS solto/coluna única.
create table if not exists tenant_branding (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  branding_tokens jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into tenants (id, slug, name)
values ('00000000-0000-0000-0000-000000000001', 'nuvem-de-papel', 'Nuvem de Papel')
on conflict (id) do nothing;

-- 2. Canal de venda (gap identificado: não existe em nenhuma plataforma de
--    referência analisada — nasce aqui desde a v1) ----------------------
create type sales_channel as enum ('varejo', 'atacado');

-- 3. Catálogo — 3 blocos separados, nunca achatado -----------------------
create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  sku text not null,
  name text not null,
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create table if not exists item_fiscal_data (
  item_id uuid primary key references catalog_items(id) on delete cascade,
  ncm text,
  cst_csosn text,
  icms_rate numeric(7, 4),
  ipi_rate numeric(7, 4),
  weight_kg numeric(10, 3)
);

create table if not exists item_commercial_data (
  item_id uuid primary key references catalog_items(id) on delete cascade,
  cost_price numeric(12, 2),
  margin_percent numeric(6, 2),
  min_stock integer not null default 0
);

-- Regra 4: preço por canal, default varejo.
create table if not exists item_prices (
  item_id uuid not null references catalog_items(id) on delete cascade,
  channel sales_channel not null default 'varejo',
  price numeric(12, 2) not null,
  min_quantity integer not null default 1,
  primary key (item_id, channel)
);

-- Row Level Security — isolamento por tenant desde o dia 1 -----------------
alter table catalog_items enable row level security;
alter table item_fiscal_data enable row level security;
alter table item_commercial_data enable row level security;
alter table item_prices enable row level security;
alter table tenant_branding enable row level security;

-- Policies mínimas de leitura pública para o site (ajustar quando auth de
-- cliente/CRM entrar em cena) — escrita fica só para service_role.
create policy catalog_items_public_read on catalog_items
  for select using (active = true);

create policy item_prices_public_read on item_prices
  for select using (true);

create policy tenant_branding_public_read on tenant_branding
  for select using (true);
