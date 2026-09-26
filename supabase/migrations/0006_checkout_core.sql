-- 0006_checkout_core.sql — base do checkout web (F3): pedido ligado ao usuário,
-- itens snapshot, endereços do cliente e idempotência de webhook (MP).
-- Regras: UUID v4, tenant_id, preço SEMPRE resolvido no servidor (o cliente
-- nunca envia valor), channel 'varejo' no checkout web.
-- RLS: pedidos legíveis só pelo dono (novo policy own-select; escrita só via
-- service_role), itens via pedido dono, endereços próprios, webhooks deny-all.

alter table orders
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists address_snapshot jsonb,
  add column if not exists payment_method text
    check (payment_method in ('pix', 'cartao', 'boleto')),
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id text;

-- Estende o ciclo de vida: aguardando_pagamento -> pago -> processando ->
-- em_rota -> entregue | cancelado (CRM já usa os 4 últimos).
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('aguardando_pagamento','pago','processando','em_rota','entregue','cancelado'));

create index if not exists idx_orders_user on orders(user_id, created_at desc);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid references catalog_items(id) on delete set null,
  sku text not null,                -- snapshot no momento da compra
  name text not null,               -- snapshot no momento da compra
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  total numeric(10,2) not null check (total >= 0)
);

create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text not null,
  cep text not null,
  logradouro text not null,
  numero text not null,
  complemento text,
  bairro text not null,
  cidade text not null,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now()
);

-- Idempotência de webhook: o mesmo evento nunca processa duas vezes.
create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider text not null,
  external_id text not null,
  event_type text not null,
  payload jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, external_id, event_type)
);

create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_addresses_user on addresses(user_id, created_at desc);

alter table orders enable row level security;      -- já habilitada; garante
alter table order_items enable row level security;
alter table addresses enable row level security;
alter table webhook_events enable row level security;

create policy "le proprios pedidos"
  on orders for select
  to authenticated
  using (auth.uid() = user_id);

create policy "itens do proprio pedido"
  on order_items for select
  to authenticated
  using (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and o.user_id = auth.uid()
  ));

create policy "le proprios enderecos"
  on addresses for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insere proprio endereco"
  on addresses for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "atualiza proprio endereco"
  on addresses for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "apaga proprio endereco"
  on addresses for delete
  to authenticated
  using (auth.uid() = user_id);
