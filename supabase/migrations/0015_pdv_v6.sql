-- 0015_pdv_v6.sql - Módulo PDV v6 (modulo-pdv.md v1.0, 02/10/2026) + colunas
-- de documento em orders (compartilhadas com o módulo Vendas).
-- Contexto:
--   * PDV-10 desconto em R$ sobre o subtotal: validado no servidor por perfil
--     (operador/vendedor ate 10% do subtotal; gerente/master sem limite - a
--     checagem de papel fica no Server Action, que ja le o profiles) e
--     aplicado dentro de pdv_register_sale (p_discount, default 0);
--   * CX-05 sangria nao pode passar do dinheiro esperado da gaveta; erro
--     "A gaveta tem so R$ X em dinheiro." (dentro de pdv_cash_supply);
--   * FV-03 a venda de balcao nasce com origem='pdv', caixa_sessao_id,
--     etapa='venda' e numero V- (sequence seq_venda_numero); pedido P- usa
--     seq_pedido_numero (consumida pela 0016, módulo Vendas);
--   * pedidos da loja web tem origem='loja' (user_id so existe no checkout);
--     erp = venda direta do console /vendas; o checkout tambem passa a
--     gravar origem='loja' explicito (src/app/checkout/actions.ts);
--   * etapa nula = documento antigo / pedido da loja ainda nao importado
--     (a aba "Importar da loja" lista origem='loja' sem pedido_numero).
-- RLS: sem mudanca (orders segue deny-all + service_role nas RPCs).
-- begin/commit igual ao 0009-0014.

begin;

-- numeração P-/V- (tenant unico hoje; a sequence e global por desenho) ------
create sequence if not exists seq_pedido_numero start 1043;
create sequence if not exists seq_venda_numero start 2211;

-- colunas de documento em orders --------------------------------------------
alter table orders
  add column if not exists origem text not null default 'erp',
  add column if not exists caixa_sessao_id uuid references caixa_sessions(id) on delete set null,
  add column if not exists etapa text,
  add column if not exists pedido_numero text,
  add column if not exists venda_numero text,
  add column if not exists convertido_em timestamptz,
  add column if not exists cancelado_em timestamptz,
  add column if not exists frete numeric(12,2) not null default 0 check (frete >= 0),
  add column if not exists condicao text not null default 'À vista';

alter table orders drop constraint if exists orders_origem_check;
alter table orders add constraint orders_origem_check
  check (origem in ('erp', 'pdv', 'loja'));

alter table orders drop constraint if exists orders_etapa_check;
alter table orders add constraint orders_etapa_check
  check (etapa is null or etapa in ('pedido', 'venda'));

alter table orders drop constraint if exists orders_condicao_check;
alter table orders add constraint orders_condicao_check
  check (condicao in ('À vista', '30 dias', '30/60', '30/60/90'));

create unique index if not exists orders_pedido_numero_key
  on orders (tenant_id, pedido_numero) where pedido_numero is not null;
create unique index if not exists orders_venda_numero_key
  on orders (tenant_id, venda_numero) where venda_numero is not null;
create index if not exists idx_orders_etapa
  on orders (tenant_id, etapa, created_at desc);
create index if not exists idx_orders_loja_pendente
  on orders (tenant_id, created_at desc)
  where origem = 'loja' and pedido_numero is null;

-- backfill: pedido da loja = tem usuario autenticado no checkout ----------
update orders set origem = 'loja'
  where user_id is not null and origem = 'erp';

-- --------------------------------------------------- pdv_cash_supply (CX-05) --
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
  v_gaveta numeric(12,2);
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
  -- CX-04: sangria/suprimento exigem motivo descrito
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'MOTIVO_OBRIGATORIO';
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

  -- CX-05: sangria limitada ao dinheiro fisico da gaveta (abertura + entradas
  -- - saidas; a propria sangria ainda nao foi lancada)
  if p_type = 'sangria' then
    select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
      into v_gaveta
      from caixa_movements
     where session_id = v_session;
    if p_amount > v_gaveta then
      raise exception 'GAVETA_INSUFICIENTE: A gaveta tem só R$ % em dinheiro.',
        replace(to_char(v_gaveta, 'FM999999990.00'), '.', ',');
    end if;
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

-- ------------------------------------------------ pdv_register_sale (PDV-10) --
-- Mesma base da 0009 (resolve_price); acrescenta p_discount (PDV-10), a
-- origem FV-03 e a numeração V-. O desconto entrou como parametro NOVO com
-- default: PostgREST aceita a chamada antiga (E2E f5) sem alteracao.
drop function if exists pdv_register_sale(jsonb, text, sales_channel, integer, uuid, text);
drop function if exists pdv_register_sale(jsonb, text, sales_channel, integer, uuid, text, numeric);

create function pdv_register_sale(
  p_items jsonb,
  p_payment_method text,
  p_channel sales_channel default 'varejo',
  p_installments integer default 1,
  p_customer_id uuid default null,
  p_idempotency_key text default null,
  p_discount numeric default 0
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
  v_sub numeric(12,2) := 0;
  v_desc numeric(12,2) := coalesce(p_discount, 0);
  v_total numeric(12,2);
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
  if v_desc < 0 then
    raise exception 'DESCONTO_INVALIDO';
  end if;

  -- idempotência: a mesma chave nunca cria duas vendas.
  select jsonb_build_object('order_id', o.id, 'total', o.total_amount,
                            'duplicate', true)
    into v_dup
    from orders o
   where o.tenant_id = v_tenant and o.idempotency_key = v_key;
  if v_dup is not null then
    return v_dup;
  end if;

  -- PDV exige gaveta aberta; o lock serializa venda x fechamento.
  select id into v_session
    from caixa_sessions
   where tenant_id = v_tenant and status = 'aberto'
     for update;
  if v_session is null then
    raise exception 'CAIXA_FECHADO';
  end if;

  -- cliente de balcão quando não informado
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

  -- validação + precificação server-side
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
     idempotency_key, origem, caixa_sessao_id, etapa, venda_numero, discount_amount)
  values
    (v_tenant, v_customer, p_channel, 'pago', 0, p_payment_method, v_key,
     'pdv', v_session, 'venda',
     'V-' || lpad(nextval('seq_venda_numero')::text, 4, '0'), v_desc)
  returning id into v_order;

  for rec in
    select elem->>'item_id' as item_id_raw,
           (elem->>'item_id')::uuid as item_id,
           (elem->>'quantity')::integer as quantity
      from jsonb_array_elements(p_items) as elem
  loop
    -- preço do canal com fallback varejo; item inativo/inexistente não passa
    select resolve_price(rec.item_id, p_channel, rec.quantity)
      into v_price
      from catalog_items ci
     where ci.id = rec.item_id
       and ci.tenant_id = v_tenant
       and ci.active;
    if v_price is null then
      raise exception 'SEM_PRECO_OU_INATIVO: %', rec.item_id;
    end if;

    v_sub := v_sub + v_price * rec.quantity;

    insert into order_items
      (tenant_id, order_id, item_id, sku, name, unit_price, quantity, total)
    select v_tenant, v_order, ci.id, ci.sku, ci.name, v_price, rec.quantity,
           v_price * rec.quantity
      from catalog_items ci
     where ci.id = rec.item_id and ci.tenant_id = v_tenant;

    -- baixa direta (sem reserva); saldo insuficiente derruba a venda inteira
    perform register_stock_movement(
      rec.item_id, 'venda', rec.quantity, 'order', v_order, 'pdv', null);
  end loop;

  if v_sub <= 0 then
    raise exception 'TOTAL_INVALIDO';
  end if;
  if v_desc >= v_sub then
    raise exception 'DESCONTO_EXCEDE_SUBTOTAL';
  end if;
  v_total := v_sub - v_desc;

  update orders set total_amount = v_total where id = v_order;

  -- dinheiro/débito/pix entram na gaveta; crédito fica a receber (título)
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
    'subtotal', v_sub,
    'desconto', v_desc,
    'title_id', v_title,
    'duplicate', false
  );
end $$;

-- permissões: assinatura nova (7 args); a antiga foi dropada ---------------
revoke execute on function pdv_register_sale(jsonb, text, sales_channel, integer, uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function pdv_register_sale(jsonb, text, sales_channel, integer, uuid, text, numeric)
  to service_role;

commit;
