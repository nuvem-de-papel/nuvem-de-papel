-- 0044_canal_web_estoque_por_local.sql
-- F: canal de preco "web" + estoque por local (fase 1 — schema + cadastro).
--
-- Contexto (decisao do dono, 2026-11-08): o negocio trata 3 canais de preco
-- (balcao/loja, distribuidora/atacado, web) e 3 locais fisicos de estoque
-- (loja, deposito, CD) com saldo somado/pool: se faltar num local, a venda
-- "pega de outro" seguindo uma ordem de prioridade.
--
-- Escopo DESTA migration (combinado): so SCHEMA + Cadastro de Produto.
-- NAO mexe no ledger existente (stock_movements/register_stock_movement/
-- item_stock/item_stock_public da 0007) — aquele e o caminho que PDV e
-- checkout ja usam pra reservar/baixar estoque, com lock de linha e ledger
-- imutavel; continua intacto e sem mudanca de comportamento.
--
-- item_stock_by_location aqui e um cadastro de saldo por local, ISOLADO do
-- ledger: o dono informa quanto tem em cada local pelo Cadastro de Produto.
-- Ligar isso na baixa automatica de venda (PDV escolhe loja de origem, web
-- consome por prioridade CD -> Deposito -> Loja) fica pra uma proxima
-- entrega, quando for explicitamente pedido — por ora e so cadastro/leitura.

-- 1) Canal de preco "web" ---------------------------------------------------
-- sales_channel ja tinha varejo/atacado (0007/0025 usam item_prices.channel).
-- ADD VALUE roda sozinho na migration (nao e referenciado em outro statement
-- da mesma transacao, o que o Postgres exige).
alter type sales_channel add value if not exists 'web';

-- 2) Locais de estoque -------------------------------------------------------
create table if not exists stock_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  code text not null,
  name text not null,
  tipo text not null check (tipo in ('loja', 'deposito', 'cd')),
  -- ordem de consumo PADRAO pra venda sem origem fisica (ex.: pedido web):
  -- menor numero = consumido primeiro. CD=1 (hub de despacho), Deposito=2,
  -- Loja=3 (ultimo recurso). Venda com origem fisica (PDV de uma loja)
  -- consome a propria loja primeiro — regra de alocacao entra quando a fase 2
  -- ligar isso no PDV/checkout.
  priority integer not null default 99,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

comment on table stock_locations is
  'Locais fisicos de estoque (loja/deposito/CD). Fase 1: cadastro. Fase 2: liga no PDV/checkout pra reserva/baixa por local.';
comment on column stock_locations.priority is
  'Ordem de consumo quando a venda nao tem origem fisica (ex.: web): menor numero primeiro.';

-- 3) Saldo por local ----------------------------------------------------------
create table if not exists item_stock_by_location (
  item_id uuid not null references catalog_items(id) on delete cascade,
  location_id uuid not null references stock_locations(id) on delete restrict,
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  updated_at timestamptz not null default now(),
  primary key (item_id, location_id)
);

comment on table item_stock_by_location is
  'Saldo fisico por item x local. Cadastro manual (Cadastro de Produto). NAO e o ledger de vendas — ver item_stock/stock_movements (0007) pra isso.';

create index if not exists idx_item_stock_by_location_location
  on item_stock_by_location(location_id);

alter table stock_locations enable row level security;
alter table item_stock_by_location enable row level security;

-- mesmo padrao de leitura operacional da 0007 (item_stock): perfis
-- master/gerente/operador/vendedor ativos. Escrita deny-all — service_role.
create policy "le locais de estoque (operacional)"
  on stock_locations for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master', 'gerente', 'operador', 'vendedor')
      and p.status = 'ativo'
  ));

create policy "le estoque por local (operacional)"
  on item_stock_by_location for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master', 'gerente', 'operador', 'vendedor')
      and p.status = 'ativo'
  ));

-- 4) Seed dos 3 locais do tenant Nuvem de Papel ------------------------------
insert into stock_locations (tenant_id, code, name, tipo, priority)
values
  ('00000000-0000-0000-0000-000000000001', 'cd', 'Centro de Distribuição', 'cd', 1),
  ('00000000-0000-0000-0000-000000000001', 'deposito', 'Depósito', 'deposito', 2),
  ('00000000-0000-0000-0000-000000000001', 'loja', 'Loja', 'loja', 3)
on conflict (tenant_id, code) do nothing;
