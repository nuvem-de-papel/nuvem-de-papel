-- Rollback 0005 - remove trilha de auditoria e status do perfil.
-- profiles.status e revertida para o estado 0004 (dados de status sao perdidos
-- por design: a coluna e derivada do console, recriavel).
drop policy if exists "leitura da auditoria (gestao)" on audit_log;
drop table if exists audit_log;
alter table profiles drop column if exists status;
