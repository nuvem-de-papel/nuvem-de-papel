-- 0041_preflight.sql
-- Confere que as 16 funcoes existem com a assinatura esperada antes de alterar grants/config.
-- Deve retornar 16 linhas. Rodar manualmente e conferir a contagem antes do apply.

select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'trg_post_order','trg_post_receipt','trg_post_settlement','trg_post_expense',
    'journal_line_leaf_check','garantir_titulo_web',
    'stock_movements_immutable','enforce_orders_transition','caixa_movements_immutable',
    'financial_settlements_immutable','journal_entries_immutable','journal_lines_immutable',
    'journal_check_balance','ean_dv_valido','dun14_dv_valido','resolve_price'
  )
order by p.proname;

-- Esperado: 16 linhas. Se vier menos, alguma funcao foi renomeada/removida desde a
-- auditoria (2026-11-07) e a migration 0041 vai falhar em "function does not exist" —
-- pare e investigue antes de aplicar.
