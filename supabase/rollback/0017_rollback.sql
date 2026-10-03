-- Rollback 0017 (destrutivo - laboratorio). Remove as tabelas novas do
-- modulo de Compras, os dados fiscais do fornecedor, as colunas de
-- ciclo/origem/condicao do pedido e os custos, e restaura a
-- purchase_receive de 5 args da 0009 (titulo 1x +30 dias, sem rateio).
-- Nao afeta codes PC-/NR- ja gerados nem financial_titles existentes.
begin;

drop function if exists purchase_receive(uuid, jsonb, text, text, uuid, boolean);

drop table if exists supplier_item_map;
drop table if exists compra_envios;
drop table if exists compra_transporte_eventos;
drop table if exists compra_transporte;
drop table if exists notas_entrada;
drop table if exists nfe_recebidas;
drop table if exists compra_importacao;

drop index if exists purchase_order_items_po_item_key;

alter table purchase_order_items
  drop column if exists custo_final,
  drop column if exists qtd_recebida;

alter table purchase_orders
  drop constraint if exists purchase_orders_condicao_check,
  drop constraint if exists purchase_orders_tipo_check,
  drop constraint if exists purchase_orders_origem_check,
  drop column if exists cancelada_em,
  drop column if exists concluida_em,
  drop column if exists conferido_em,
  drop column if exists condicao,
  drop column if exists desconto,
  drop column if exists frete,
  drop column if exists tipo,
  drop column if exists origem;

alter table suppliers
  drop constraint if exists suppliers_uf_check,
  drop column if exists pais,
  drop column if exists uf,
  drop column if exists ie;

alter table item_commercial_data
  drop column if exists fob_price,
  alter column cost_price type numeric(12,2);

-- purchase_receive de 5 args (corpo copiado da 0009_f6_revenda_fornecedor.sql)
create function purchase_receive(
  p_purchase_order_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_notes text default null,
  p_created_by uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_key text := coalesce(nullif(trim(coalesce(p_idempotency_key, '')), ''), '');
  v_po record;
  v_receipt uuid;
  v_code text;
  v_total numeric(12,2) := 0;
  v_title uuid := null;
  v_dup jsonb;
  v_elem jsonb;
  v_poi record;
  v_qty integer;
begin
  if length(v_key) < 8 then
    raise exception 'CHAVE_IDEMPOTENCIA_INVALIDA';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'RECEBIMENTO_VAZIO';
  end if;

  -- idempotência: a mesma chave nunca gera duas notas.
  select jsonb_build_object('receipt_id', r.id, 'total', r.total,
                            'duplicate', true)
    into v_dup
    from purchase_receipts r
   where r.tenant_id = v_tenant and r.idempotency_key = v_key;
  if v_dup is not null then
    return v_dup;
  end if;

  select * into v_po
    from purchase_orders
   where id = p_purchase_order_id and tenant_id = v_tenant
     for update;
  if not found then
    raise exception 'PEDIDO_INEXISTENTE';
  end if;
  if v_po.status in ('recebido', 'cancelado') then
    raise exception 'PO_NAO_RECEBIVEL: %', v_po.status;
  end if;

  v_receipt := gen_random_uuid();
  v_code := 'NR-' || upper(substr(v_receipt::text, 1, 8));

  insert into purchase_receipts
    (id, tenant_id, purchase_order_id, code, notes, idempotency_key, created_by)
  values
    (v_receipt, v_tenant, v_po.id, v_code,
     nullif(trim(coalesce(p_notes, '')), ''), v_key, p_created_by);

  for v_elem in select elem from jsonb_array_elements(p_items) as elem loop
    v_qty := (v_elem->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 999999 then
      raise exception 'QUANTIDADE_INVALIDA';
    end if;

    select poi.*,
           coalesce((select sum(ri.quantity)
                       from purchase_receipt_items ri
                      where ri.purchase_order_item_id = poi.id), 0) as ja_recebido
      into v_poi
      from purchase_order_items poi
     where poi.id = (v_elem->>'purchase_order_item_id')::uuid
       and poi.purchase_order_id = v_po.id;
    if not found then
      raise exception 'ITEM_FORA_DO_PEDIDO';
    end if;
    if v_poi.ja_recebido + v_qty > v_poi.quantity then
      raise exception 'QTD_ACIMA_DO_PEDIDO: % (pendente %)',
        v_poi.sku_snapshot, v_poi.quantity - v_poi.ja_recebido;
    end if;

    insert into purchase_receipt_items
      (tenant_id, receipt_id, purchase_order_item_id, quantity)
    values
      (v_tenant, v_receipt, v_poi.id, v_qty);

    v_total := v_total + v_qty * v_poi.unit_cost;

    perform register_stock_movement(
      v_poi.item_id, 'entrada', v_qty, 'compra', v_receipt,
      'recebimento ' || v_code, p_created_by);
  end loop;

  if v_total <= 0 then
    raise exception 'TOTAL_INVALIDO';
  end if;

  update purchase_receipts set total = v_total where id = v_receipt;

  update purchase_orders po
     set status = case
       when not exists (
         select 1 from purchase_order_items i
          where i.purchase_order_id = po.id
            and coalesce((select sum(ri.quantity)
                            from purchase_receipt_items ri
                           where ri.purchase_order_item_id = i.id), 0)
                < i.quantity
       ) then 'recebido'
       else 'parcial'
     end,
     total = v_total,
     updated_at = now()
   where id = v_po.id;

  -- título a pagar (1x, 30 dias) — /financeiro e portal mostram o saldo
  v_title := gen_random_uuid();
  insert into financial_titles
    (id, tenant_id, code, direction, status, principal_amount, issue_date,
     due_date, source_type, source_id, customer_id, idempotency_key, created_by)
  values
    (v_title, v_tenant, 'FIN-' || upper(substr(v_title::text, 1, 8)),
     'payable', 'aberto', v_total, current_date, current_date + 30,
     'purchase_receipt', v_receipt, null, v_key || ':payable', p_created_by);
  insert into financial_installments
    (tenant_id, title_id, number, due_date, principal_amount)
  values
    (v_tenant, v_title, 1, current_date + 30, v_total);

  return jsonb_build_object(
    'receipt_id', v_receipt,
    'title_id', v_title,
    'total', v_total,
    'duplicate', false
  );
end $$;

revoke execute on function purchase_receive(uuid, jsonb, text, text, uuid)
  from public, anon, authenticated;
grant execute on function purchase_receive(uuid, jsonb, text, text, uuid)
  to service_role;

commit;
