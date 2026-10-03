-- Rollback 0015 (destrutivo - laboratorio). Remove as colunas de documento de
-- orders (numeros P-/V-, etapa, origem, frete, condicao), as sequences de
-- numeracao e as validacoes novas do PDV (desconto e CX-04/CX-05). Vendas e
-- pedidos criados pelo PDV v6 perdem numero/etapa/origem e voltam para o
-- default 'erp' antes de dropar a coluna.
begin;

drop function if exists pdv_register_sale(jsonb, text, sales_channel, integer, uuid, text, numeric);

-- restaura a versao da 0009 (6 args, sem desconto) ---------------------------
create or replace function pdv_register_sale(
  p_items jsonb,
  p_payment_method text,
  p_channel sales_channel default 'varejo',
  p_installments integer default 1,
  p_customer_id uuid default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_key text := coalesce(nullif(trim(coalesce(p_idempotency_key, '')), ''), '');
  v_order uuid;
  v_session uuid;
  v_customer uuid;
  v_title uuid;
  v_total numeric(12,2) := 0;
  v_base numeric(12,2);
  v_amount numeric(12,2);
  v_price numeric(12,2);
  v_dup jsonb;
  rec record;
begin
  if length(v_key) < 8 then
    raise exception 'CHAVE_IDEMPOTENCIA_INVALIDA';
  end if;
  if p_payment_method not in ('dinheiro', 'pix', 'debito', 'cartao') then
    raise exception 'FORMA_PAGAMENTO_INVALIDA: %', p_payment_method;
  end if;
  if p_installments is null or p_installments < 1 or p_installments > 12 then
    raise exception 'PARCELAS_INVALIDAS';
  end if;
  if p_payment_method <> 'cartao' and p_installments <> 1 then
    raise exception 'PARCELAS_SO_NO_CREDITO';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'CARRINHO_VAZIO';
  end if;

  select jsonb_build_object('order_id', o.id, 'total', o.total_amount,
                            'duplicate', true)
    into v_dup
    from orders o
   where o.tenant_id = v_tenant and o.idempotency_key = v_key;
  if v_dup is not null then
    return v_dup;
  end if;

  select id into v_session
    from caixa_sessions
   where tenant_id = v_tenant and status = 'aberto'
     for update;
  if v_session is null then
    raise exception 'CAIXA_FECHADO';
  end if;

  v_customer := p_customer_id;
  if v_customer is null then
    select id into v_customer from customers
     where tenant_id = v_tenant and email = 'balcao@nuvemdepapel.com.br';
    if v_customer is null then
      insert into customers (tenant_id, name, email)
      values (v_tenant, 'Cliente Balcão', 'balcao@nuvemdepapel.com.br')
      on conflict (tenant_id, email) do nothing;
      select id into v_customer from customers
       where tenant_id = v_tenant and email = 'balcao@nuvemdepapel.com.br';
    end if;
  elsif not exists (
    select 1 from customers where id = v_customer and tenant_id = v_tenant
  ) then
    raise exception 'CLIENTE_INEXISTENTE';
  end if;

  for rec in
    select elem->>'item_id' as item_id,
           (elem->>'quantity')::integer as quantity
      from jsonb_array_elements(p_items) as elem
  loop
    if rec.item_id is null
       or rec.item_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'ITEM_INVALIDO: %', rec.item_id;
    end if;
    if rec.quantity is null or rec.quantity < 1 or rec.quantity > 99999 then
      raise exception 'QUANTIDADE_INVALIDA';
    end if;
  end loop;

  insert into orders
    (tenant_id, customer_id, channel, status, total_amount, payment_method,
     idempotency_key)
  values
    (v_tenant, v_customer, p_channel, 'pago', 0, p_payment_method, v_key)
  returning id into v_order;

  for rec in
    select elem->>'item_id' as item_id_raw,
           (elem->>'item_id')::uuid as item_id,
           (elem->>'quantity')::integer as quantity
      from jsonb_array_elements(p_items) as elem
  loop
    select resolve_price(rec.item_id, p_channel, rec.quantity)
      into v_price
      from catalog_items ci
     where ci.id = rec.item_id
       and ci.tenant_id = v_tenant
       and ci.active;
    if v_price is null then
      raise exception 'SEM_PRECO_OU_INATIVO: %', rec.item_id;
    end if;

    v_total := v_total + v_price * rec.quantity;

    insert into order_items
      (tenant_id, order_id, item_id, sku, name, unit_price, quantity, total)
    select v_tenant, v_order, ci.id, ci.sku, ci.name, v_price, rec.quantity,
           v_price * rec.quantity
      from catalog_items ci
     where ci.id = rec.item_id and ci.tenant_id = v_tenant;

    perform register_stock_movement(
      rec.item_id, 'venda', rec.quantity, 'order', v_order, 'pdv', null);
  end loop;

  if v_total <= 0 then
    raise exception 'TOTAL_INVALIDO';
  end if;

  update orders set total_amount = v_total where id = v_order;

  if p_payment_method in ('dinheiro', 'debito', 'pix') then
    insert into caixa_movements
      (tenant_id, session_id, movement_type, direction, amount, order_id,
       idempotency_key)
    values
      (v_tenant, v_session, 'venda', 'in', v_total, v_order,
       v_key || ':caixa');
  end if;

  if p_payment_method = 'cartao' then
    v_base := trunc(v_total / p_installments, 2);
    if v_base = 0 then
      raise exception 'VALOR_PARCELA_INVALIDA';
    end if;
    v_title := gen_random_uuid();
    insert into financial_titles
      (id, tenant_id, code, direction, status, principal_amount, issue_date,
       due_date, source_type, source_id, customer_id, idempotency_key)
    values
      (v_title, v_tenant, 'FIN-' || upper(substr(v_title::text, 1, 8)),
       'receivable', 'aberto', v_total, current_date,
       (current_date + make_interval(months => p_installments))::date,
       'pdv', v_order, v_customer, v_key || ':titulo');
    for i in 1..p_installments loop
      v_amount := case
        when i = p_installments then v_total - v_base * (p_installments - 1)
        else v_base
      end;
      insert into financial_installments
        (tenant_id, title_id, number, due_date, principal_amount)
      values
        (v_tenant, v_title, i,
         (current_date + make_interval(months => i))::date, v_amount);
    end loop;
  end if;

  return jsonb_build_object(
    'order_id', v_order,
    'total', v_total,
    'title_id', v_title,
    'duplicate', false
  );
end $$;

revoke execute on function pdv_register_sale(jsonb, text, sales_channel, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function pdv_register_sale(jsonb, text, sales_channel, integer, uuid, text)
  to service_role;

-- restaura pdv_cash_supply da 0008 (sem CX-04 motivo e sem CX-05 gaveta) -----
create or replace function pdv_cash_supply(
  p_type text,
  p_amount numeric,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_id uuid;
  v_session uuid;
  v_key text := coalesce(nullif(trim(p_idempotency_key), ''), '');
  v_dir text;
begin
  if p_type not in ('suprimento', 'sangria') then
    raise exception 'TIPO_MOVIMENTO_INVALIDO: %', p_type;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'VALOR_INVALIDO';
  end if;
  if length(v_key) < 8 then
    raise exception 'CHAVE_IDEMPOTENCIA_INVALIDA';
  end if;

  select id into v_id from caixa_movements
   where tenant_id = v_tenant and idempotency_key = v_key;
  if v_id is not null then
    return jsonb_build_object('movement_id', v_id, 'duplicate', true);
  end if;

  select id into v_session
    from caixa_sessions
   where tenant_id = v_tenant and status = 'aberto'
     for update;
  if v_session is null then
    raise exception 'CAIXA_FECHADO';
  end if;

  v_dir := case when p_type = 'suprimento' then 'in' else 'out' end;
  insert into caixa_movements
    (tenant_id, session_id, movement_type, direction, amount, reason,
     idempotency_key)
  values
    (v_tenant, v_session, p_type, v_dir, p_amount,
     nullif(trim(p_reason), ''), v_key)
  returning id into v_id;

  return jsonb_build_object('movement_id', v_id, 'duplicate', false);
end $$;

-- remove colunas de documento ------------------------------------------------
update orders set origem = 'erp' where origem <> 'erp';
alter table orders drop constraint if exists orders_origem_check;
alter table orders drop constraint if exists orders_etapa_check;
drop index if exists orders_pedido_numero_key;
drop index if exists orders_venda_numero_key;
drop index if exists idx_orders_etapa;
drop index if exists idx_orders_loja_pendente;
alter table orders
  drop column if exists origem,
  drop column if exists caixa_sessao_id,
  drop column if exists etapa,
  drop column if exists pedido_numero,
  drop column if exists venda_numero,
  drop column if exists convertido_em,
  drop column if exists cancelado_em,
  drop column if exists frete,
  drop column if exists condicao;

drop sequence if exists seq_pedido_numero;
drop sequence if exists seq_venda_numero;
commit;
