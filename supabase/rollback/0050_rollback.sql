-- 0050_rollback.sql — volta ao formato 0049 (quote_requests sem itens).
-- Apaga orcamentos gravados desde a 0050.
drop table if exists quote_request_items;
drop table if exists quote_requests;
alter table customers drop column if exists auth_user_id;
create table quote_requests (
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
alter table quote_requests enable row level security;
revoke all on quote_requests from anon, authenticated;
