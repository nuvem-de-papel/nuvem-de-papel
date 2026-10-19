-- 0037_reativacao_avaliacoes.sql - reativação de clientes + coleta de avaliações.
--
-- Contexto (regra 19/10/2026 - staging primeiro):
--   * dois prompts da familia A ("Reativação de clientes inativos" + "Coleta
--     automática de avaliações") numa unica entrega, versão SEM IA e SEM
--     WhatsApp (stack nao tem provedor de IA; WhatsApp oficial fica pra etapa
--     2). Tudo por e-mail (Resend, ja integrado), regras simples, reaproveitando
--     customers + orders que ja existem.
--
-- Parte A - Reativação: cliente que ja comprou e nao volta ha N dias recebe
--   e-mail citando a ultima compra, com opt-out (LGPD). Cooldown impede
--   re-contato em janela curta; para sozinho quando o cliente volta a comprar.
-- Parte B - Avaliações: pedido que vira `entregue` ganha pedido de avaliação
--   com link do Google (curto, mede clique), igual pra todos (sem review
--   gating — regra do Google). Reclamação (resposta negativa) vira flag pro
--   dono resolver.
--
-- Tabelas:
--   * marketing_config      - knob por tenant (link do Google, prazos, cooldown).
--   * customer_reactivation - estado de reativação + opt-out por cliente.
--   * review_requests       - 1 por pedido (unique order_id), trilha de clique/nota.
-- RLS so leitura master/gerente (0008:179-204), escrita so pelo service role
-- (crons/server actions). Opt-out e feito pela rota publica /sair/[token] (anon).
--
-- Regra do Google embutida: o pedido de avaliação sai para TODOS os pedidos
-- entregues do mesmo jeito; quem reclama NAO e filtrado — o link ja foi
-- enviado igual. Nenhuma mensagem pede nota alta nem oferece vantagem (CDC).

begin;

create table if not exists marketing_config (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  google_review_link text not null default '',
  reativacao_dias integer not null default 90,
  reativacao_cooldown_dias integer not null default 60,
  avaliacao_atraso_dias integer not null default 3,
  atualizado_em timestamptz not null default now()
);

create table if not exists customer_reactivation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  status text not null default 'na_base'
    check (status in ('na_base','em_campanha','respondeu','voltou','saiu','nao_incomodar')),
  ultimo_contato_em timestamptz,
  descadastro_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, customer_id)
);

create table if not exists review_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  enviado_em timestamptz not null default now(),
  link_clicado_em timestamptz,
  nota integer check (nota between 1 and 5),
  comentario text,
  reclamacao boolean not null default false,
  resolvida boolean not null default false,
  email_message_id uuid,
  unique (tenant_id, order_id)
);

create index if not exists idx_review_requests_reclamacao
  on review_requests(tenant_id, reclamacao, resolvida);
create index if not exists idx_customer_reactivation_status
  on customer_reactivation(tenant_id, status);

alter table marketing_config enable row level security;
alter table customer_reactivation enable row level security;
alter table review_requests enable row level security;

create policy "le marketing_config (gestao)"
  on marketing_config for select to authenticated
  using (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('master','gerente') and p.status = 'ativo'
  ));

create policy "le customer_reactivation (gestao)"
  on customer_reactivation for select to authenticated
  using (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('master','gerente') and p.status = 'ativo'
  ));

create policy "le review_requests (gestao)"
  on review_requests for select to authenticated
  using (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('master','gerente') and p.status = 'ativo'
  ));

-- seed do config para todos os tenants (idempotente)
insert into marketing_config (tenant_id)
select id from tenants
on conflict (tenant_id) do nothing;

commit;
