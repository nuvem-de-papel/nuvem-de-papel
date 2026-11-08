-- 0041_rollback.sql
-- Desfaz 0041: regrava EXECUTE para anon/authenticated nas 6 funcoes e remove o
-- search_path fixo das 10 funcoes de trigger/validacao, voltando ao estado anterior.
--
-- ATENCAO: rodar isso em producao REABRE o buraco de seguranca (RPC publico nas
-- funcoes de lancamento contabil). So usar se a 0041 causou regressao real e
-- precisar reverter enquanto investiga — nao e um rollback de rotina.

begin;

grant execute on function public.trg_post_order() to public, anon, authenticated;
grant execute on function public.trg_post_receipt() to public, anon, authenticated;
grant execute on function public.trg_post_settlement() to public, anon, authenticated;
grant execute on function public.trg_post_expense() to public, anon, authenticated;
grant execute on function public.journal_line_leaf_check() to public, anon, authenticated;
grant execute on function public.garantir_titulo_web(uuid, uuid, text, text, numeric, uuid)
  to public, anon, authenticated;

alter function public.stock_movements_immutable() reset search_path;
alter function public.enforce_orders_transition() reset search_path;
alter function public.caixa_movements_immutable() reset search_path;
alter function public.financial_settlements_immutable() reset search_path;
alter function public.journal_entries_immutable() reset search_path;
alter function public.journal_lines_immutable() reset search_path;
alter function public.journal_check_balance() reset search_path;
alter function public.ean_dv_valido(text) reset search_path;
alter function public.dun14_dv_valido(text) reset search_path;
alter function public.resolve_price(uuid, sales_channel, integer) reset search_path;

commit;
