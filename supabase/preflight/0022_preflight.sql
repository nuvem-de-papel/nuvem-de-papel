-- Preflight 0022 - confirma pre-requisitos antes de aplicar.
do $$
begin
  -- 0021 obrigatoria: o diario e o plano sao o alvo dos gatilhos.
  if to_regclass('public.account_catalog') is null then
    raise exception 'preflight 0022: public.account_catalog ausente (0021 nao aplicada)';
  end if;
  if to_regclass('public.journal_entries') is null then
    raise exception 'preflight 0022: public.journal_entries ausente (0021 nao aplicada)';
  end if;
  if to_regclass('public.journal_entry_lines') is null then
    raise exception 'preflight 0022: public.journal_entry_lines ausente (0021 nao aplicada)';
  end if;
  if to_regclass('public.v_dre') is null then
    raise exception 'preflight 0022: public.v_dre ausente (0021 nao aplicada)';
  end if;
  -- tabelas de negocio que ganham gatilho
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0022: public.orders ausente';
  end if;
  if to_regclass('public.purchase_receipts') is null then
    raise exception 'preflight 0022: public.purchase_receipts ausente';
  end if;
  if to_regclass('public.financial_settlements') is null then
    raise exception 'preflight 0022: public.financial_settlements ausente';
  end if;
  -- ja aplicada?
  if exists (select 1 from pg_trigger where tgname = 'trg_post_order_accounting') then
    raise exception 'preflight 0022: trg_post_order_accounting ja existe (migracao ja aplicada?)';
  end if;
  if exists (select 1 from pg_proc where proname = 'post_order_accounting') then
    raise exception 'preflight 0022: post_order_accounting ja existe (migracao ja aplicada?)';
  end if;
end $$;
