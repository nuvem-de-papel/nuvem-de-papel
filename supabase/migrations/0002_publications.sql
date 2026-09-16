-- 0002_publications.sql — blog/publicações, mesmo padrão multi-tenant da 0001.

create table if not exists publications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  slug text not null,
  title text not null,
  category text not null,
  excerpt text,
  reading_minutes integer,
  published_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

alter table publications enable row level security;

create policy publications_public_read on publications
  for select using (published_at <= now());
