-- Preflight 0023 - confirma pre-requisitos antes de aplicar.
-- O preflight do 0022 recusa reaplicacao, entao a correcao do faturamento e a
-- inclusao de despesas viram uma migration nova (0023).
do $$
begin
  -- 0021 obrigatoria: plano e diario sao o alvo das escritas.
  if to_regclass('public.account_catalog') is null then
    raise exception 'preflight 0023: public.account_catalog ausente (0021 nao aplicada)';
  end if;
  if to_regclass('public.journal_entries') is null then
    raise exception 'preflight 0023: public.journal_entries ausente (0021 nao aplicada)';
  end if;
  -- 0022 obrigatoria: 0023 da create or replace em post_order_accounting,
  -- entao a versao original precisa existir antes.
  if not exists (select 1 from pg_trigger where tgname = 'trg_post_order_accounting') then
    raise exception 'preflight 0023: trg_post_order_accounting ausente (0022 nao aplicada)';
  end if;
  if not exists (select 1 from pg_proc where proname = 'post_order_accounting') then
    raise exception 'preflight 0023: post_order_accounting ausente (0022 nao aplicada)';
  end if;
  -- tabelas que a 0023 usa
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0023: public.orders ausente';
  end if;
  if to_regclass('public.expenses') is null then
    raise exception 'preflight 0023: public.expenses ausente';
  end if;
  -- ja aplicada?
  if exists (select 1 from pg_trigger where tgname = 'trg_post_expense_accounting') then
    raise exception 'preflight 0023: trg_post_expense_accounting ja existe (migracao ja aplicada?)';
  end if;
end $$;
