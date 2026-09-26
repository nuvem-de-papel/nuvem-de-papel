-- 0005_audit_log.sql - trilha de auditoria (quem/quando/o que) + status do perfil.
-- Escrita: somente servidor (service_role ignora RLS por design) nas Server
-- Actions de gestao de usuarios. Leitura: master|gerente (console de auditoria).
-- Regra 2: todo dado carrega tenant_id. RLS: deny-all (sem policy de escrita)
-- + policy de leitura restrita a papeis de gestao ativos.

alter table profiles
  add column if not exists status text not null default 'ativo'
  check (status in ('ativo', 'inativo'));

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_user_id uuid,          -- null = sistema (rotina/seed)
  action text not null,        -- ex.: usuario.criado, usuario.papel_alterado
  entity text not null,        -- ex.: profiles
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_tenant_created
  on audit_log(tenant_id, created_at desc);

alter table audit_log enable row level security;

create policy "leitura da auditoria (gestao)"
  on audit_log for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.tenant_id = audit_log.tenant_id
        and p.status = 'ativo'
        and p.role in ('master', 'gerente')
    )
  );
