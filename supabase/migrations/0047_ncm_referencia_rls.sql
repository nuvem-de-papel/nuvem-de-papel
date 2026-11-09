-- 0047_ncm_referencia_rls.sql
-- Fecha o advisor ERROR "RLS Disabled in Public" da 0046: ncm_referencia e
-- tabela interna (consulta manual via server actions, nunca client-side).
-- Mesmo padrao de item_fiscal_data: RLS ligado, SEM policy -> PostgREST/anon
-- nao leem nada; so o service role (server actions) acessa.
alter table ncm_referencia enable row level security;
