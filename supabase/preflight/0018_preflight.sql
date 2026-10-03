-- Preflight 0018 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.orders') is null then
    raise exception 'preflight 0018: public.orders ausente (0003 nao aplicada)';
  end if;
  if to_regclass('public.order_items') is null then
    raise exception 'preflight 0018: public.order_items ausente (0006 nao aplicada)';
  end if;
  if to_regclass('public.seq_pedido_numero') is null then
    raise exception 'preflight 0018: seq_pedido_numero ausente (0015 nao aplicada)';
  end if;
  if to_regclass('public.seq_venda_numero') is null then
    raise exception 'preflight 0018: seq_venda_numero ausente (0015 nao aplicada)';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public'
                   and table_name = 'customers'
                   and column_name = 'documento') then
    raise exception 'preflight 0018: customers.documento ausente (0016 nao aplicada)';
  end if;
  if to_regprocedure('public.vendas_convert_to_sale(uuid)') is not null then
    raise exception 'preflight 0018: vendas_convert_to_sale ja existe (migracao ja aplicada?)';
  end if;
  if to_regprocedure('public.vendas_import_loja(uuid[])') is not null then
    raise exception 'preflight 0018: vendas_import_loja ja existe (migracao ja aplicada?)';
  end if;
end $$;
