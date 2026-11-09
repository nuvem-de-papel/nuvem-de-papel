-- 0047_rollback.sql
-- Desfaz 0047: desliga RLS de ncm_referencia (volta ao estado da 0046).
begin;
alter table ncm_referencia disable row level security;
commit;
