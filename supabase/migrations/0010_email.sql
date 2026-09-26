-- 0010_email.sql - F6.5: modulo de e-mail da empresa (Resend envia + recebe).
-- Escopo (roadmap F6.5, envio e recebimento 100% via Resend):
--   * email_messages: caixa unica da empresa — outbound (o que o sistema
--     envia pela API do Resend) e inbound (o que chega no dominio via MX +
--     webhook email.received da Resend Receiving API);
--   * dedupe de inbound por (tenant_id, external_message_id) — o webhook do
--     Resend pode reentregar (retry) e o Message-ID identifica a mensagem;
--   * anexos: metadados + storage_path no JSONB; binarios vivem no bucket
--     privado email-attachments (URL de download do Resend expira em 1h —
--     baixamos na hora do webhook; leitura posterior via URL assinada do
--     servidor); bucket sem policies = somente service_role (RLS deny-all
--     por omissao em storage.objects);
--   * webhook_events (0006) ja cobre provider='resend' pelo unique
--     (provider, external_id, event_type) — idempotencia sem DDL novo;
--   * RLS: leitura restrita a gestao ativa (master|gerente) — mesma
--     formula do audit_log (0005); escrita deny-all (webhooks e server
--     actions usam service_role por design, regra dos 0005/0006/0009).
-- Regra 2: todo dado carrega tenant_id. begin/commit igual ao 0009.

begin;

-- ------------------------------------------------------ A) email_messages --
create table if not exists email_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  direction text not null check (direction in ('outbound', 'inbound')),
  status text not null default 'queued'
    check (status in (
      'queued', 'sent', 'delivered', 'opened', 'clicked',
      'bounced', 'complained', 'received', 'failed', 'canceled'
    )),
  source text not null default 'system'
    check (source in ('system', 'manual')),
  from_email text not null,
  from_name text,
  to_emails jsonb not null default '[]'::jsonb,
  cc_emails jsonb not null default '[]'::jsonb,
  reply_to jsonb not null default '[]'::jsonb,
  subject text not null default '',
  html text,
  text text,                       -- corpo texto puro (plain text)
  headers jsonb,                   -- inbound: cabecalhos originais
  resend_id text,                  -- outbound: id da mensagem na Resend
  external_message_id text,        -- inbound: Message-ID (dedupe)
  thread_id text,
  in_reply_to text,
  attachments jsonb not null default '[]'::jsonb,
  read_at timestamptz,
  error text,                      -- motivo de bounce/falha (webhook)
  actor_user_id uuid,              -- null = gatilho transacional (sistema)
  related_entity text,             -- vinculo opcional: order, purchase_orders...
  related_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- inbound idempotente: mesma mensagem (tenant + Message-ID) nunca duplica.
create unique index if not exists uq_email_messages_dedupe_inbound
  on email_messages (tenant_id, external_message_id)
  where direction = 'inbound' and external_message_id is not null;

-- outbound: o id retornado pela Resend e unico.
create unique index if not exists uq_email_messages_resend_id
  on email_messages (resend_id)
  where resend_id is not null;

create index if not exists idx_email_messages_tenant_dir_created
  on email_messages (tenant_id, direction, created_at desc);

-- badge de nao-lidas da Entrada.
create index if not exists idx_email_messages_nao_lidas
  on email_messages (tenant_id, created_at desc)
  where direction = 'inbound' and read_at is null;

alter table email_messages enable row level security;

drop policy if exists "leitura da caixa (gestao)" on email_messages;
create policy "leitura da caixa (gestao)"
  on email_messages for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.tenant_id = email_messages.tenant_id
        and p.status = 'ativo'
        and p.role in ('master', 'gerente')
    )
  );

-- ------------------------------------------------- B) bucket de anexos -----
-- Privado e sem policies: nem anon nem authenticated tocam no bucket —
-- so service_role (upload no webhook, download para URL assinada).
insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', false)
on conflict (id) do nothing;

-- ------------------------------------------------------ C) observacoes ----
-- webhook_events: unique (provider, external_id, event_type) da 0006 ja
-- garante a idempotencia dos eventos da Resend (provider='resend',
-- external_id=svix-id) — nenhuma alteracao aqui.
-- audit_log: envios manuais gravam action='email.enviado' via server
-- action (0005) — nenhuma alteracao de schema.

commit;
