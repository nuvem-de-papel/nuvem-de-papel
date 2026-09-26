-- Rollback 0009 (destrutivo — laboratorio). Desfaz F6: compras, resolve_price,
-- PK/vigencia de item_prices e policies originais; restaura pdv_register_sale
-- da 0008 (corpo antigo com subquery de preco).
begin;

drop table if exists purchase_receipt_items;
drop table if exists purchase_receipts;
drop table if exists purchase_order_items;
drop table if exists purchase_orders;
drop table if exists suppliers;

drop function if exists purchase_receive(uuid, jsonb, text, text, uuid);
drop function if exists resolve_price(uuid, sales_channel, integer);

-- pdv_register_sale da 0008 (preco por subquery direta)
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
    select coalesce(
             (select ip.price from item_prices ip
               where ip.item_id = rec.item_id and ip.channel = p_channel),
             (select ip.price from item_prices ip
               where ip.item_id = rec.item_id and ip.channel = 'varejo')
           )
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

-- item_prices de volta: PK simples + policy publica original
alter table item_prices drop constraint if exists item_prices_vigencia;
alter table item_prices drop constraint if exists item_prices_pkey;
alter table item_prices drop column if exists valid_from;
alter table item_prices drop column if exists valid_until;
alter table item_prices add constraint item_prices_pkey primary key (item_id, channel);

drop policy if exists item_prices_public_read on item_prices;
create policy item_prices_public_read on item_prices
  for select using (true);

-- checks originais
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table profiles drop constraint %I', c.conname);
  end loop;
  for c in
    select conname from pg_constraint
     where conrelid = 'financial_titles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%source_type%'
  loop
    execute format('alter table financial_titles drop constraint %I', c.conname);
  end loop;
end $$;

alter table profiles
  add constraint profiles_status_check check (status in ('ativo', 'inativo'));
alter table financial_titles
  add constraint financial_titles_source_type_check
  check (source_type in ('pdv', 'web'));

commit;
