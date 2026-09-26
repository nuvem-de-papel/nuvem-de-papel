-- 0009_f6_revenda_fornecedor.sql — F6: revenda/atacado + portal do fornecedor.
-- Escopo (roadmap F6, padrão M06 adaptado ao Nuvem de Papel):
--   * item_prices ganha faixas por quantidade + vigência (PK nova) e leitura
--     segmentada: anon/vistor só 'varejo'; revenda e equipe operacional leem
--     'atacado' (aceite: revenda vê preço B no mesmo SKU);
--   * resolve_price(): resolução única de preço (canal → faixa vigente →
--     fallback varejo → menor faixa), usada pelo PDV (subquery antiga quebraria
--     com >1 linha por canal) e disponível ao servidor;
--   * profiles.status aceita 'pendente' (pedido de conta de revenda aguardando
--     aprovação do master no console de usuários);
--   * compras do fornecedor: suppliers, purchase_orders (+itens com snapshot),
--     purchase_receipts (+itens) com RPC purchase_receive atômica: idempotência,
--     trava de linha no PO, validação de quantidade, entrada no livro de estoque
--     (0007, reference_type='compra') e título a pagar (direction='payable');
--   * financial_titles.source_type aceita 'purchase_receipt'.
-- Padrões: RLS deny-all de escrita + select restrito; RPCs SECURITY DEFINER
-- executáveis só por service_role (0007/0008); regra 2 (tenant_id) sempre.

begin;

-- ------------------------------------------------- A) item_prices / preços --
alter table item_prices drop constraint if exists item_prices_pkey;

alter table item_prices
  add column if not exists valid_from timestamptz not null default '1970-01-01T00:00:00Z',
  add column if not exists valid_until timestamptz;

alter table item_prices
  add constraint item_prices_pkey primary key (item_id, channel, min_quantity, valid_from);

alter table item_prices
  add constraint item_prices_vigencia check (valid_until is null or valid_until > valid_from);

drop policy if exists item_prices_public_read on item_prices;
create policy item_prices_public_read on item_prices
  for select
  using (
    channel = 'varejo'
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.status = 'ativo'
        and p.role in ('master', 'gerente', 'operador', 'vendedor', 'revenda')
    )
  );

-- ------------------------------------------------------- B) resolve_price ---
-- STABLE/SQL: leitura com RLS do invocador (server usa service_role; a
-- vitrine/logado usa authenticated). Ordem: faixa do canal ≤ qty, faixa
-- varejo ≤ qty, menor faixa do canal, menor faixa varejo.
create or replace function resolve_price(
  p_item_id uuid,
  p_channel sales_channel,
  p_qty integer
) returns numeric
language sql
stable
as $$
  select coalesce(
    (select ip.price from item_prices ip
      where ip.item_id = p_item_id
        and ip.channel = p_channel
        and ip.min_quantity <= p_qty
        and ip.valid_from <= now()
        and (ip.valid_until is null or ip.valid_until > now())
      order by ip.min_quantity desc limit 1),
    (select ip.price from item_prices ip
      where ip.item_id = p_item_id
        and ip.channel = 'varejo'
        and ip.min_quantity <= p_qty
        and ip.valid_from <= now()
        and (ip.valid_until is null or ip.valid_until > now())
      order by ip.min_quantity desc limit 1),
    (select ip.price from item_prices ip
      where ip.item_id = p_item_id
        and ip.channel = p_channel
        and ip.valid_from <= now()
        and (ip.valid_until is null or ip.valid_until > now())
      order by ip.min_quantity asc limit 1),
    (select ip.price from item_prices ip
      where ip.item_id = p_item_id
        and ip.channel = 'varejo'
        and ip.valid_from <= now()
        and (ip.valid_until is null or ip.valid_until > now())
      order by ip.min_quantity asc limit 1)
  );
$$;

-- pdv_register_sale: mesma assinatura da 0008; só o bloco de preço muda
-- (resolve_price no lugar das subqueries que agora retornariam >1 linha).
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
    -- preço resolvido no servidor (faixa vigente do canal + fallback varejo);
    -- item inativo/inexistente não passa
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

    -- baixa direta (sem reserva); saldo insuficiente derruba a venda inteira
    perform register_stock_movement(
      rec.item_id, 'venda', rec.quantity, 'order', v_order, 'pdv', null);
  end loop;

  if v_total <= 0 then
    raise exception 'TOTAL_INVALIDO';
  end if;

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
    'title_id', v_title,
    'duplicate', false
  );
end $$;

-- ------------------------------------------------ C) status 'pendente' ------
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
end $$;

alter table profiles
  add constraint profiles_status_check check (status in ('ativo', 'inativo', 'pendente'));

-- ------------------------------- D) source_type aceita recebimento de compra --
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'financial_titles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%source_type%'
  loop
    execute format('alter table financial_titles drop constraint %I', c.conname);
  end loop;
end $$;

alter table financial_titles
  add constraint financial_titles_source_type_check
  check (source_type in ('pdv', 'web', 'purchase_receipt'));

-- ---------------------------------------------------- E) compras/fornecedor --
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  contact_email text,
  cnpj text,
  user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name),
  unique (tenant_id, id)
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  supplier_id uuid not null references suppliers(id),
  code text not null,
  status text not null default 'aberto'
    check (status in ('aberto', 'parcial', 'recebido', 'cancelado')),
  total numeric(12,2) not null default 0 check (total >= 0),
  notes text,
  expected_at date,
  created_by uuid references auth.users(id),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, idempotency_key)
);

create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid not null references catalog_items(id),
  sku_snapshot text not null,
  name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,4) not null check (unit_cost >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id),
  code text not null,
  status text not null default 'postado'
    check (status in ('postado', 'cancelado')),
  received_at timestamptz not null default now(),
  total numeric(12,2) not null default 0 check (total >= 0),
  notes text,
  idempotency_key text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, idempotency_key)
);

create table if not exists purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  receipt_id uuid not null references purchase_receipts(id) on delete cascade,
  purchase_order_item_id uuid not null references purchase_order_items(id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_orders_supplier
  on purchase_orders(tenant_id, supplier_id, created_at desc);
create index if not exists idx_purchase_receipts_po
  on purchase_receipts(tenant_id, purchase_order_id);

-- RLS: deny-all de escrita + select restrito a gestão (portal do fornecedor e
-- console de compras leem via service_role, como o financeiro).
alter table suppliers enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
alter table purchase_receipts enable row level security;
alter table purchase_receipt_items enable row level security;

create policy "le fornecedores (gestao)"
  on suppliers for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master', 'gerente')
      and p.status = 'ativo'
  ));

create policy "le pedidos de compra (gestao)"
  on purchase_orders for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master', 'gerente')
      and p.status = 'ativo'
  ));

create policy "le itens de compra (gestao)"
  on purchase_order_items for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master', 'gerente')
      and p.status = 'ativo'
  ));

create policy "le notas de recebimento (gestao)"
  on purchase_receipts for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master', 'gerente')
      and p.status = 'ativo'
  ));

create policy "le itens de recebimento (gestao)"
  on purchase_receipt_items for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master', 'gerente')
      and p.status = 'ativo'
  ));

-- ------------------------------------------- F) RPC purchase_receive ---------
-- Atômica: valida o PO com lock de linha, registra a nota idempotente, dá a
-- entrada no livro de estoque (0007, reference_type='compra'), marca o PO
-- parcial/recebido e gera o título a pagar (1x, 30 dias).
create or replace function purchase_receive(
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

-- ------------------------------------------------------ G) permissões -------
revoke execute on function purchase_receive(uuid, jsonb, text, text, uuid)
  from public, anon, authenticated;
grant execute on function purchase_receive(uuid, jsonb, text, text, uuid)
  to service_role;

commit;
