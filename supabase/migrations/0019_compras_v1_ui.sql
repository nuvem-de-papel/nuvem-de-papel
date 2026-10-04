-- Compras v1 (0019): sequencias de numeracao + functions de proximo codigo
-- (as actions chamam via PostgREST/rpc — supabase-js nao tem nextval direto).
--   seq_numero_compra  -> 'PC-' || lpad(seq, 8, '0')  (ex.: PC-00000313).
--     O padding de 8 mantem o prefixo PC-0 da spec e casa no contrato
--     intocavel do e2e f6 (/PC-[0-9A-F]{8}/); a versao curta PC-0313 nao
--     casa com {8} e quebraria a suite.
--   seq_entrada_direta -> 'EN-' || lpad(seq, 4, '0')  (ex.: EN-0043).
-- Regra: numeracao monotona (auditoria de PC/EN sem colisao); lacunas de
-- teste sao aceitas (sequences nao fazem rollback). Functions sao
-- security definer com grant so para service_role (mesma formula da 0018).

begin;

create sequence if not exists seq_numero_compra start 313;
create sequence if not exists seq_entrada_direta start 43;

create or replace function compra_proximo_codigo()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return 'PC-' || lpad(nextval('seq_numero_compra')::text, 8, '0');
end $$;

create or replace function compra_proxima_entrada_direta()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return 'EN-' || lpad(nextval('seq_entrada_direta')::text, 4, '0');
end $$;

revoke execute on function compra_proximo_codigo() from public, anon, authenticated;
revoke execute on function compra_proxima_entrada_direta() from public, anon, authenticated;
grant execute on function compra_proximo_codigo() to service_role;
grant execute on function compra_proxima_entrada_direta() to service_role;

commit;
