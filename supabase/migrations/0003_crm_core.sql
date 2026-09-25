-- 0003_crm_core.sql — CRM core: clientes, pedidos, campanhas.
-- Segue as 5 regras (UUID v4, tenant_id, channel quando aplicável).
-- IMPORTANTE: estes dados são sensíveis (PII + faturamento). RLS fica
-- habilitado SEM nenhuma policy de leitura pública — deny-all por padrão
-- para anon/authenticated. A leitura só acontece via service role, no
-- servidor (src/lib/supabase/admin.ts), nunca no client.

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  email text not null,
  tier text not null default 'bronze' check (tier in ('bronze','prata','ouro','diamante')),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null references customers(id) on delete restrict,
  channel sales_channel not null default 'varejo',
  status text not null default 'processando' check (status in ('processando','em_rota','entregue','cancelado')),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  status text not null default 'ativa' check (status in ('ativa','agendada','encerrada')),
  info text,
  starts_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_customers_tenant on customers(tenant_id);
create index if not exists idx_orders_tenant on orders(tenant_id);
create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_campaigns_tenant on campaigns(tenant_id);

alter table customers enable row level security;
alter table orders enable row level security;
alter table campaigns enable row level security;

-- Nenhuma policy de leitura pública criada de propósito (ver comentário acima).
