-- Preflight 0017 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.suppliers') is null then
    raise exception 'preflight 0017: public.suppliers ausente (0006 nao aplicada)';
  end if;
  if to_regclass('public.purchase_orders') is null then
    raise exception 'preflight 0017: public.purchase_orders ausente (0009 nao aplicada)';
  end if;
  if to_regclass('public.purchase_order_items') is null then
    raise exception 'preflight 0017: public.purchase_order_items ausente (0009 nao aplicada)';
  end if;
  if to_regclass('public.item_commercial_data') is null then
    raise exception 'preflight 0017: public.item_commercial_data ausente (0001 nao aplicada)';
  end if;
  if not exists (select 1 from pg_proc
                 where proname = 'purchase_receive'
                   and pronargs = 5) then
    raise exception 'preflight 0017: purchase_receive de 5 args ausente (0009 nao aplicada)';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'purchase_orders'
               and column_name = 'origem') then
    raise exception 'preflight 0017: purchase_orders.origem ja existe (migracao ja aplicada?)';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'purchase_order_items'
               and column_name = 'qtd_recebida') then
    raise exception 'preflight 0017: purchase_order_items.qtd_recebida ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.nfe_recebidas') is not null then
    raise exception 'preflight 0017: public.nfe_recebidas ja existe (migracao ja aplicada?)';
  end if;
  if to_regclass('public.compra_transporte') is not null then
    raise exception 'preflight 0017: public.compra_transporte ja existe (migracao ja aplicada?)';
  end if;
  if exists (select 1
               from (select purchase_order_id, item_id
                       from purchase_order_items
                      group by purchase_order_id, item_id
                     having count(*) > 1) dup) then
    raise exception 'preflight 0017: ha itens duplicados no mesmo pedido (PC-05 nao pode criar indice unico)';
  end if;
  if not exists (select 1 from tenants where id = '00000000-0000-0000-0000-000000000001') then
    raise exception 'preflight 0017: tenant padrao 00000000-0000-0000-0000-000000000001 ausente';
  end if;
end $$;
