-- 0041_hardening_security_definer.sql
-- Auditoria 2026-11-07. Dois achados dos advisors de seguranca do Supabase:
--
-- 1) anon_security_definer_function_executable / authenticated_security_definer_function_executable
--    (confirmado SO em producao, nao em staging): 6 funcoes SECURITY DEFINER de
--    lancamento contabil/estoque estavam com EXECUTE liberado pra anon/authenticated,
--    chamaveis direto via /rest/v1/rpc/<funcao>. Sao gatilhos internos (trg_post_*) ou
--    helpers de escrita (garantir_titulo_web, journal_line_leaf_check) — nunca deveriam
--    ser chamados fora do proprio banco. REVOKE nao afeta o disparo via trigger (Postgres
--    nao checa EXECUTE do papel que originou o evento pra funcao de trigger).
--
-- 2) function_search_path_mutable (confirmado nos dois ambientes): 10 funcoes de
--    trigger/validacao sem search_path fixo. Nenhuma e SECURITY DEFINER hoje, mas sao
--    chamadas por gatilhos BEFORE/AFTER em tabelas de diario/caixa/estoque — fixar
--    search_path e defesa em profundidade contra sequestro via search_path do papel.
--
-- Idempotente: roda igual em staging (onde o item 1 ja estava correto) e em producao
-- (onde o item 1 precisa corrigir o drift real).

begin;

-- 1) Revoga execucao direta das 6 funcoes sensiveis (mantem postgres/service_role).
revoke execute on function public.trg_post_order() from public, anon, authenticated;
revoke execute on function public.trg_post_receipt() from public, anon, authenticated;
revoke execute on function public.trg_post_settlement() from public, anon, authenticated;
revoke execute on function public.trg_post_expense() from public, anon, authenticated;
revoke execute on function public.journal_line_leaf_check() from public, anon, authenticated;
revoke execute on function public.garantir_titulo_web(uuid, uuid, text, text, numeric, uuid)
  from public, anon, authenticated;

-- 2) Fixa search_path nas 10 funcoes de trigger/validacao sem config.
alter function public.stock_movements_immutable() set search_path = public, pg_temp;
alter function public.enforce_orders_transition() set search_path = public, pg_temp;
alter function public.caixa_movements_immutable() set search_path = public, pg_temp;
alter function public.financial_settlements_immutable() set search_path = public, pg_temp;
alter function public.journal_entries_immutable() set search_path = public, pg_temp;
alter function public.journal_lines_immutable() set search_path = public, pg_temp;
alter function public.journal_check_balance() set search_path = public, pg_temp;
alter function public.ean_dv_valido(text) set search_path = public, pg_temp;
alter function public.dun14_dv_valido(text) set search_path = public, pg_temp;
alter function public.resolve_price(uuid, sales_channel, integer) set search_path = public, pg_temp;

commit;
