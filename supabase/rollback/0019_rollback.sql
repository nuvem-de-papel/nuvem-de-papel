-- Rollback 0019 - desfaz a migration 0019 (functions e sequencias; as
-- numeracoes ja emitidas permanecem, como em qualquer uso de sequence).
begin;
drop function if exists compra_proximo_codigo();
drop function if exists compra_proxima_entrada_direta();
drop sequence if exists seq_numero_compra;
drop sequence if exists seq_entrada_direta;
commit;
