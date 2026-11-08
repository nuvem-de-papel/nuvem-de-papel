-- 0042_move_pgtap_extensions.sql
-- Auditoria 2026-11-07, confirmado na pratica em 08/11/2026 (teste de restore):
-- extensao pgtap instalada em "public" em vez de "extensions" (schema proprio
-- do Supabase pra isso). Isso faz o pg_dump incluir GRANT de cada uma das
-- ~300 funcoes internas do pgtap misturado com o schema do negocio, causando
-- ruido/erros irrelevantes num restore (confirmado no teste de 08/11/2026:
-- _retval, _typename, col_is_pk, format_type_string, has_pk).
--
-- search_path do projeto ja inclui "extensions" ("$user", public, extensions),
-- entao mover o pgtap nao quebra nenhuma chamada sem qualificacao nos testes
-- pgTAP (supabase/tests/*.sql) -- confirmado: nenhum arquivo de teste usa
-- "public.ok(", "public.plan(" etc, todos chamam sem qualificar o schema.

begin;

alter extension pgtap set schema extensions;

commit;
