-- 0012_clube.sql - Clube de assinantes (F7).
-- Contexto (roadmap F7): planos mensais com beneficios + assinatura do
-- cliente + beneficio no checkout + cancelamento pelo painel do cliente.
--   * club_plans guarda os planos (preco, % de desconto, frete gratis,
--     brinde); seed com 3 planos da marca (papel/criativo/atelier) - o
--     cliente ajusta precos e beneficios pela tela de gestao do painel;
--   * club_subscriptions guarda UMA linha por ciclo do assinante (historico
--     fica: novas assinaturas criam linhas novas); indice unico parcial
--     impede duas assinaturas pendente/ativa simultaneas para o mesmo
--     usuario;
--   * orders.discount_amount registra o desconto aplicado (o total do pedido
--     ja nasce liquido); cobranca/ativacao vem do webhook Mercado Pago
--     (topico preapproval) e o cancelamento encerra o ciclo na hora;
--   * RLS: club_plans e PUBLICO (landing /clube no anon); escrita deny-all
--     (server actions usam service_role); club_subscriptions: le o proprio
--     assinante ou a gestao ativa (master|gerente) - anon nao le (42501).
-- Regra 2: todo dado carrega tenant_id. begin/commit igual ao 0009-0011.

begin;

-- --------------------------------------------------------- club_plans -----
create table if not exists club_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '',
  price_monthly numeric(10,2) not null check (price_monthly > 0),
  discount_pct numeric(5,2) not null default 0
    check (discount_pct >= 0 and discount_pct <= 100),
  free_shipping boolean not null default true,
  gift text not null default '',
  mp_plan_id text,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_club_plans_tenant_active
  on club_plans (tenant_id, active, sort);

alter table club_plans enable row level security;

-- planos sao publicos (landing /clube); escrita so via service_role
drop policy if exists "leitura club_plans (publica)" on club_plans;
create policy "leitura club_plans (publica)"
  on club_plans for select
  using (true);

-- -------------------------------------------------- club_subscriptions -----
create table if not exists club_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid not null references club_plans(id) on delete restrict,
  status text not null default 'pendente'
    check (status in ('pendente', 'ativa', 'cancelada', 'pausada')),
  mp_preapproval_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- no maximo UMA assinatura pendente/ativa por usuario no tenant
create unique index if not exists uq_club_subscriptions_ativa
  on club_subscriptions (tenant_id, profile_id)
  where status in ('pendente', 'ativa');

create index if not exists idx_club_subscriptions_profile
  on club_subscriptions (profile_id, created_at desc);

create index if not exists idx_club_subscriptions_preapproval
  on club_subscriptions (mp_preapproval_id)
  where mp_preapproval_id is not null;

alter table club_subscriptions enable row level security;

-- le o proprio assinante (auth.uid) OU a gestao ativa do mesmo tenant;
-- anon nao tem policy de select -> 42501 (assinante e dado privado)
drop policy if exists "leitura assinatura (propria ou gestao)" on club_subscriptions;
create policy "leitura assinatura (propria ou gestao)"
  on club_subscriptions for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.tenant_id = club_subscriptions.tenant_id
        and p.status = 'ativo'
        and p.role in ('master', 'gerente')
    )
  );

-- ------------------------------------------------------------- orders -----
-- desconto do Clube aplicado no total do pedido (0 = sem desconto)
alter table orders add column if not exists discount_amount
  numeric(10,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'orders'::regclass
      and conname = 'orders_discount_amount_check'
  ) then
    alter table orders
      add constraint orders_discount_amount_check
      check (discount_amount >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------- seed -----
-- 3 planos da marca (ids fixos para rastreio); o cliente ajusta pela tela
insert into club_plans
  (id, tenant_id, code, name, description, price_monthly, discount_pct,
   free_shipping, gift, sort)
values
  ('eeeeeeee-0000-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'papel', 'Clube Papel',
   'Entrada no clube: curadoria mensal e desconto em todas as compras.',
   19.90, 5.00, true, 'Adesivo exclusivo do mes', 1),
  ('eeeeeeee-0000-4000-8000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   'criativo', 'Clube Criativo',
   'Para quem cria todo dia: desconto maior e brinde mensal.',
   34.90, 8.00, true, 'Bloco de notas exclusivo', 2),
  ('eeeeeeee-0000-4000-8000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   'atelier', 'Clube Atelie',
   'O plano completo: maior desconto, frete gratis e brinde sazonal.',
   59.90, 12.00, true, 'Kit canetas sazonais', 3)
on conflict (tenant_id, code) do nothing;

commit;
