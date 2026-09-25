-- 0004_auth_roles.sql - autenticacao operacional: perfis e papeis (RBAC).
-- Fonte da identidade: auth.users (Supabase Auth, email+senha, cookie via
-- @supabase/ssr). Aqui fica apenas o perfil por tenant + papel operacional.
-- Regra 2: todo dado carrega tenant_id (00000000-0000-0000-0000-000000000001).
-- RLS: deny-all por padrao (mesma filosofia do 0003) + uma policy de leitura
-- do proprio perfil (exigida pelo middleware). Escrita so via service_role.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null,
  email text not null,
  full_name text,
  role text not null default 'operador'
    check (role in ('master','gerente','operador','vendedor','fornecedor','revenda')),
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_tenant on profiles(tenant_id);
create index if not exists idx_profiles_role on profiles(tenant_id, role);

alter table profiles enable row level security;

create policy "le proprio perfil"
  on profiles for select
  to authenticated
  using (auth.uid() = id);
