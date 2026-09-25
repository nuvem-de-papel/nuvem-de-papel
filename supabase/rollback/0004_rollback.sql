-- Rollback 0004 - remove perfis (identidade continua em auth.users,
-- gerenciada pelo Supabase Auth; remover usuario e decisão separada).
drop policy if exists "le proprio perfil" on profiles;
drop table if exists profiles;
