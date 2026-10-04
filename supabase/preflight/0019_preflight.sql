-- Preflight 0019 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.purchase_orders') is null then
    raise exception 'preflight 0019: public.purchase_orders ausente (0006 nao aplicada)';
  end if;
  if to_regclass('public.nfe_recebidas') is null then
    raise exception 'preflight 0019: public.nfe_recebidas ausente (0017 nao aplicada)';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public'
                   and table_name = 'purchase_orders'
                   and column_name = 'origem') then
    raise exception 'preflight 0019: purchase_orders.origem ausente (0017 nao aplicada)';
  end if;
  if to_regclass('public.seq_numero_compra') is not null then
    raise exception 'preflight 0019: seq_numero_compra ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.seq_entrada_direta') is not null then
    raise exception 'preflight 0019: seq_entrada_direta ja existe (migracao ja aplicada?)';
  end if;
end $$;
