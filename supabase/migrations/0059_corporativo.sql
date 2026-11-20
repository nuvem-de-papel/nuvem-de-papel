-- 0059 - Conta corporativa (PJ) - etapa 2 de "Contas do Cliente" (20/11/2026)
-- Empresa (corporate_accounts) com varios logins (corporate_buyers). Nasce
-- 'pendente' e so compra depois de aprovada pela gestao em
-- /configuracoes/cadastro?tela=revenda (audit corporativo.aprovado).
-- Limite de credito nasce 0 (fail-closed): a gestao define na aprovacao.
-- corporate_alerts = trilha do aviso de pedido PJ (WhatsApp/e-mail, etapa 4),
-- unique por pedido = nunca avisa duas vezes.
-- Escrita so pela service_role (server actions + audit_log).
begin;

create table if not exists public.corporate_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null unique references public.customers(id) on delete restrict,
  razao_social text not null check (char_length(razao_social) between 3 and 160),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  status text not null default 'pendente'
    check (status in ('pendente', 'ativa', 'bloqueada', 'recusada')),
  limite_credito numeric(12,2) not null default 0 check (limite_credito >= 0),
  prazo_dias integer not null default 0 check (prazo_dias between 0 and 120),
  motivo text check (motivo is null or char_length(motivo) <= 500),
  aprovado_em timestamptz,
  aprovado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, cnpj),
  constraint corporate_accounts_ativa_aprovada check (status <> 'ativa' or aprovado_em is not null)
);

create index if not exists idx_corporate_accounts_status
  on public.corporate_accounts (tenant_id, status, created_at desc);

create table if not exists public.corporate_buyers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.corporate_accounts(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  papel text not null default 'comprador' check (papel in ('comprador', 'financeiro', 'admin')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_corporate_buyers_account on public.corporate_buyers (account_id);

create table if not exists public.corporate_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  account_id uuid references public.corporate_accounts(id) on delete set null,
  canal text not null check (canal in ('whatsapp', 'email')),
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'falhou')),
  erro text,
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists corporate_account_id uuid references public.corporate_accounts(id) on delete set null;
create index if not exists idx_orders_corporate_account
  on public.orders (corporate_account_id) where corporate_account_id is not null;

alter table public.orders drop constraint if exists orders_origem_check;
alter table public.orders add constraint orders_origem_check
  check (origem in ('erp', 'pdv', 'loja', 'manual', 'corporativo'));

-- RLS: o comprador le a propria empresa e o proprio vinculo; gestao le tudo.
alter table public.corporate_accounts enable row level security;
alter table public.corporate_buyers enable row level security;
alter table public.corporate_alerts enable row level security;

drop policy if exists "le empresa (comprador ou gestao)" on public.corporate_accounts;
create policy "le empresa (comprador ou gestao)" on public.corporate_accounts
  for select to authenticated using (
    exists (select 1 from public.corporate_buyers b
             where b.account_id = corporate_accounts.id
               and b.auth_user_id = auth.uid() and b.ativo)
    or exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('master', 'gerente') and p.status = 'ativo')
  );

drop policy if exists "le vinculo (proprio ou gestao)" on public.corporate_buyers;
create policy "le vinculo (proprio ou gestao)" on public.corporate_buyers
  for select to authenticated using (
    auth_user_id = auth.uid()
    or exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('master', 'gerente') and p.status = 'ativo')
  );

drop policy if exists "le alertas (gestao)" on public.corporate_alerts;
create policy "le alertas (gestao)" on public.corporate_alerts
  for select to authenticated using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.role in ('master', 'gerente') and p.status = 'ativo')
  );

revoke all on public.corporate_accounts, public.corporate_buyers, public.corporate_alerts from anon, authenticated;
grant select on public.corporate_accounts, public.corporate_buyers, public.corporate_alerts to authenticated;
grant all on public.corporate_accounts, public.corporate_buyers, public.corporate_alerts to service_role;

comment on table public.corporate_accounts is 'Conta corporativa (PJ): empresa compradora; status pendente|ativa|bloqueada|recusada (0059).';
comment on table public.corporate_buyers is 'Logins de uma conta corporativa (comprador|financeiro|admin); 1 login = 1 empresa (0059).';
comment on table public.corporate_alerts is 'Trilha do aviso de pedido corporativo (WhatsApp/e-mail); unique por pedido (0059).';

commit;
