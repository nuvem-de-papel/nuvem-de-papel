-- 0049_orcamento_sob_consulta.sql
-- Produto com saldo zero no CD fica "sob consulta": vitrine mostra o saldo
-- do CD e o botao "Pedir orcamento" grava em quote_requests (CRM).
-- Decisao do dono (2026-11-11).

-- 1) Saldo do CD pra vitrine (leitura anonima). Venda web = so CD.
create or replace view item_stock_cd_public as
  select s.item_id, s.stock_on_hand
    from item_stock_by_location s
    join stock_locations l on l.id = s.location_id
   where l.tipo = 'cd'
     and l.tenant_id = '00000000-0000-0000-0000-000000000001';

grant select on item_stock_cd_public to anon, authenticated;

-- 2) Pedidos de orcamento ----------------------------------------------------
create table if not exists quote_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  item_id uuid references catalog_items(id) on delete set null,
  sku text not null,
  product_name text not null,
  quantidade integer not null default 1 check (quantidade between 1 and 10000),
  nome text not null check (char_length(nome) between 2 and 120),
  contato text not null check (char_length(contato) between 5 and 160),
  mensagem text check (mensagem is null or char_length(mensagem) <= 1000),
  status text not null default 'novo'
    check (status in ('novo', 'em_atendimento', 'respondido', 'fechado')),
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_requests_status
  on quote_requests(tenant_id, status, created_at desc);

-- Sem policy: anon/authenticated nao leem nem escrevem. Escrita pela server
-- action (service_role), leitura pelo CRM (service_role).
alter table quote_requests enable row level security;
revoke all on quote_requests from anon, authenticated;

comment on table quote_requests is
  'Pedidos de orcamento de produto sob consulta (saldo CD = 0). Gravado pela server action /orcamento; lido pelo CRM.';
