-- 0050_orcamento_lista_cliente.sql
-- Orcamento com varios itens (estoque + sob encomenda) e cliente com login.
-- Decisao do dono (2026-11-11). quote_requests da 0049 estava com 0 linhas:
-- recriada no formato cabecalho + itens.

-- 1) Cliente vinculado ao login (auth.users). Staff continua em profiles.
alter table customers
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- 2) Cabecalho do orcamento (sem itens)
drop table if exists quote_requests;

create table quote_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null references customers(id) on delete restrict,
  cep text not null check (cep ~ '^[0-9]{8}$'),
  prazo_encomenda_dias integer
    check (prazo_encomenda_dias is null or prazo_encomenda_dias between 1 and 365),
  mensagem text check (mensagem is null or char_length(mensagem) <= 1000),
  status text not null default 'novo'
    check (status in ('novo', 'em_atendimento', 'respondido', 'fechado')),
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_requests_status
  on quote_requests(tenant_id, status, created_at desc);

-- 3) Itens do orcamento. tipo_prazo: 'estoque' (prazo pelo CEP) ou 'encomenda'
create table quote_request_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  quote_id uuid not null references quote_requests(id) on delete cascade,
  item_id uuid references catalog_items(id) on delete set null,
  sku text not null,
  product_name text not null,
  quantidade integer not null check (quantidade between 1 and 10000),
  tipo_prazo text not null check (tipo_prazo in ('estoque', 'encomenda')),
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_items_quote on quote_request_items(quote_id);

-- RLS deny-all: escrita e leitura so via service_role (server actions / CRM)
alter table quote_requests enable row level security;
alter table quote_request_items enable row level security;
revoke all on quote_requests, quote_request_items from anon, authenticated;
