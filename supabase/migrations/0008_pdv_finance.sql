-- 0008_pdv_finance.sql — F5: PDV (caixa/sessão/movimentos) + financeiro
-- (títulos → parcelas → liquidações). Aditiva; blueprints M07/M08 adaptados
-- ao schema Nuvem de Papel.
--
-- Modelo:
--   * `caixa_movements` é o livro do caixa (imutável: deny-all RLS + trigger);
--     saldo esperado = abertura + Σ(in) − Σ(out), calculado no fechamento;
--   * uma única sessão aberta por tenant (índice parcial) — bate-vale;
--   * venda PDV = orders(status 'pago' na inserção; o trigger de transição só
--     valida UPDATE) + baixa direta de estoque ('venda', sem reserva) + movimento
--     de caixa (dinheiro/pix/debito) + título/parcelas (cartão, não liquidado
--     à vista);
--   * preço SEMPRE resolvido no servidor (item_prices por canal, fallback
--     varejo) — o navegador manda item_id e quantidade apenas;
--   * idempotência: orders.idempotency_key parcial-único por tenant; a mesma
--     chave nunca cria duas vendas/títulos/movimentos;
--   * `financial_settlements` é o livro de liquidações (imutável); parcela e
--     título têm agregados (paid_amount/status) mantidos só pela RPC.

-- ---------------------------------------------------------------- orders --
alter table orders
  add column if not exists idempotency_key text;

create unique index if not exists orders_tenant_idempotency
  on orders(tenant_id, idempotency_key)
  where idempotency_key is not null;

-- PDV: dinheiro e débito somam às formas já aceitas (pix/cartao/boleto).
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('pix', 'cartao', 'boleto', 'dinheiro', 'debito'));

-- ----------------------------------------------------------------- caixa --
create table if not exists caixa_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  operator_id uuid,
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_amount numeric(12,2) not null default 0 check (opening_amount >= 0),
  expected_amount numeric(12,2),
  counted_amount numeric(12,2),
  difference_amount numeric(12,2),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  check (
    (status = 'fechado' and closed_at is not null and counted_amount is not null)
    or status <> 'fechado'
  )
);

-- uma única sessão aberta por tenant (bate-vale de uma gaveta só).
create unique index if not exists caixa_sessions_one_open
  on caixa_sessions(tenant_id)
  where status = 'aberto';

create table if not exists caixa_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  session_id uuid not null references caixa_sessions(id) on delete restrict,
  movement_type text not null check (
    movement_type in ('abertura', 'venda', 'suprimento', 'sangria', 'estorno')
  ),
  direction text not null check (direction in ('in', 'out')),
  amount numeric(12,2) not null check (amount > 0),
  order_id uuid,                      -- sem FK de propósito: o ledger é
  reason text,                        -- imutável e o pedido pode ser removido
  idempotency_key text not null,      -- em limpeza de homologação
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists idx_caixa_movements_session
  on caixa_movements(session_id);

alter table caixa_sessions enable row level security;
alter table caixa_movements enable row level security;

create policy "le sessoes de caixa (operacional)"
  on caixa_sessions for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente','operador','vendedor')
      and p.status = 'ativo'
  ));

create policy "le movimentos de caixa (operacional)"
  on caixa_movements for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente','operador','vendedor')
      and p.status = 'ativo'
  ));

create or replace function caixa_movements_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'CAIXA_MOVEMENTS_IMUTAVEL: % nao permitido em caixa_movements', tg_op;
end $$;

create trigger trg_caixa_movements_immutable
  before update or delete on caixa_movements
  for each row execute function caixa_movements_immutable();

-- ------------------------------------------------------------- financeiro --
create table if not exists financial_titles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  code text not null,
  direction text not null default 'receivable'
    check (direction in ('receivable', 'payable')),
  status text not null default 'aberto'
    check (status in ('aberto', 'parcial', 'liquidado', 'cancelado')),
  principal_amount numeric(12,2) not null check (principal_amount > 0),
  issue_date date not null default current_date,
  due_date date not null,
  source_type text not null check (source_type in ('pdv', 'web')),
  source_id uuid,                      -- id do pedido (sem FK: limpeza de
  customer_id uuid,                    -- homologação; audit via idempotency)
  notes text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, idempotency_key)
);

create index if not exists idx_financial_titles_status
  on financial_titles(status, due_date);

create table if not exists financial_installments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  title_id uuid not null references financial_titles(id) on delete restrict,
  number integer not null check (number > 0),
  status text not null default 'aberto'
    check (status in ('aberto', 'parcial', 'liquidado', 'vencido', 'cancelado')),
  due_date date not null,
  principal_amount numeric(12,2) not null check (principal_amount > 0),
  paid_amount numeric(12,2) not null default 0
    check (paid_amount >= 0 and paid_amount <= principal_amount),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, title_id, number)
);

create index if not exists idx_financial_installments_due
  on financial_installments(status, due_date);

create table if not exists financial_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  installment_id uuid not null references financial_installments(id) on delete restrict,
  type text not null default 'liquidacao'
    check (type in ('liquidacao', 'estorno')),
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (
    method in ('pix', 'cartao', 'debito', 'dinheiro', 'boleto', 'transferencia')
  ),
  notes text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists idx_financial_settlements_inst
  on financial_settlements(installment_id);

alter table financial_titles enable row level security;
alter table financial_installments enable row level security;
alter table financial_settlements enable row level security;

create policy "le titulos (gestao)"
  on financial_titles for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente')
      and p.status = 'ativo'
  ));

create policy "le parcelas (gestao)"
  on financial_installments for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente')
      and p.status = 'ativo'
  ));

create policy "le liquidacoes (gestao)"
  on financial_settlements for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente')
      and p.status = 'ativo'
  ));

create or replace function financial_settlements_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'FINANCIAL_SETTLEMENTS_IMUTAVEL: % nao permitido', tg_op;
end $$;

create trigger trg_financial_settlements_immutable
  before update or delete on financial_settlements
  for each row execute function financial_settlements_immutable();

-- --------------------------------------------------------------- RPCs PDV --
-- Padrão 0007: SECURITY DEFINER executável só por service_role (o servidor);
-- RBAC de tela fica no middleware + Server Actions, auditoria no audit_log.

create or replace function pdv_open_cash(
  p_opening_amount numeric,
  p_operator_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_id uuid;
  v_key text := coalesce(nullif(trim(p_idempotency_key), ''), '');
begin
  if length(v_key) < 8 then
    raise exception 'CHAVE_IDEMPOTENCIA_INVALIDA';
  end if;
  if p_opening_amount is null or p_opening_amount < 0 then
    raise exception 'ABERTURA_INVALIDA';
  end if;

  select id into v_id from caixa_sessions
   where tenant_id = v_tenant and idempotency_key = v_key;
  if v_id is not null then
    return jsonb_build_object('session_id', v_id, 'duplicate', true);
  end if;

  begin
    insert into caixa_sessions (tenant_id, operator_id, opening_amount, idempotency_key)
    values (v_tenant, p_operator_id, p_opening_amount, v_key)
    returning id into v_id;
  exception when unique_violation then
    -- corrida com outra abertura: devolve a sessão vencedora
    select id into v_id from caixa_sessions
     where tenant_id = v_tenant and status = 'aberto';
    if v_id is null then raise; end if;
    return jsonb_build_object('session_id', v_id, 'duplicate', true);
  end;

  if p_opening_amount > 0 then
    insert into caixa_movements
      (tenant_id, session_id, movement_type, direction, amount, reason,
       idempotency_key, created_by)
    values
      (v_tenant, v_id, 'abertura', 'in', p_opening_amount, 'Abertura de caixa',
       v_key || ':abertura', p_operator_id);
  end if;

  return jsonb_build_object('session_id', v_id, 'duplicate', false);
end $$;

create or replace function pdv_close_cash(p_counted_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_id uuid;
  v_mov numeric(12,2);
  v_expected numeric(12,2);
begin
  if p_counted_amount is null or p_counted_amount < 0 then
    raise exception 'CONTAGEM_INVALIDA';
  end if;

  select id into v_id
    from caixa_sessions
   where tenant_id = v_tenant and status = 'aberto'
     for update;
  if v_id is null then
    raise exception 'CAIXA_FECHADO';
  end if;

  -- a abertura também é movimento ('abertura' in): esperado = Σ(in) − Σ(out)
  select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
    into v_mov
    from caixa_movements
   where session_id = v_id;
  v_expected := v_mov;

  update caixa_sessions
     set status = 'fechado',
         closed_at = now(),
         expected_amount = v_expected,
         counted_amount = p_counted_amount,
         difference_amount = p_counted_amount - v_expected
   where id = v_id;

  return jsonb_build_object(
    'session_id', v_id,
    'expected', v_expected,
    'counted', p_counted_amount,
    'difference', p_counted_amount - v_expected
  );
end $$;

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

-- Venda PDV atômica: pedido pago + estoque + caixa + título (crédito).
-- O cliente manda APENAS item_id/quantidade; preço, total e totais derivados
-- são resolvidos aqui (regra: preço nunca vem do navegador).
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
    -- preço do canal com fallback varejo; item inativo/inexistente não passa
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

-- ---------------------------------------------------------- RPC financeiro --
create or replace function financial_settle(
  p_installment_id uuid,
  p_amount numeric,
  p_method text,
  p_idempotency_key text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_key text := coalesce(nullif(trim(p_idempotency_key), ''), '');
  v_settle uuid;
  v_inst record;
  v_paid numeric(12,2);
  v_status text;
  v_title uuid;
begin
  if length(v_key) < 8 then
    raise exception 'CHAVE_IDEMPOTENCIA_INVALIDA';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'VALOR_INVALIDO';
  end if;
  if p_method not in ('pix', 'cartao', 'debito', 'dinheiro', 'boleto', 'transferencia') then
    raise exception 'METODO_INVALIDO: %', p_method;
  end if;

  select id into v_settle from financial_settlements
   where tenant_id = v_tenant and idempotency_key = v_key;
  if v_settle is not null then
    return jsonb_build_object('settlement_id', v_settle, 'duplicate', true);
  end if;

  select * into v_inst
    from financial_installments
   where id = p_installment_id and tenant_id = v_tenant
     for update;
  if not found then
    raise exception 'PARCELA_INEXISTENTE';
  end if;
  if v_inst.status in ('liquidado', 'cancelado') then
    raise exception 'PARCELA_ENCERRADA: %', v_inst.status;
  end if;
  if v_inst.paid_amount + p_amount > v_inst.principal_amount then
    raise exception 'SOBRELIQUIDACAO: parcela %, recebido %, pedido %',
      v_inst.principal_amount, v_inst.paid_amount, p_amount;
  end if;

  insert into financial_settlements
    (tenant_id, installment_id, type, amount, method, notes, idempotency_key)
  values
    (v_tenant, p_installment_id, 'liquidacao', p_amount, p_method,
     nullif(trim(coalesce(p_notes, '')), ''), v_key)
  returning id into v_settle;

  v_paid := v_inst.paid_amount + p_amount;
  v_status := case
    when v_paid >= v_inst.principal_amount then 'liquidado'
    else 'parcial'
  end;

  update financial_installments
     set paid_amount = v_paid,
         status = v_status,
         settled_at = case when v_status = 'liquidado' then now() else settled_at end
   where id = p_installment_id;
  v_title := v_inst.title_id;

  update financial_titles t
     set status = case
       when not exists (
         select 1 from financial_installments i
          where i.title_id = t.id and i.status <> 'liquidado'
       ) then 'liquidado'
       when exists (
         select 1 from financial_installments i
          where i.title_id = t.id and i.paid_amount > 0
       ) then 'parcial'
       else 'aberto'
     end
   where id = v_title and tenant_id = v_tenant;

  return jsonb_build_object(
    'settlement_id', v_settle,
    'installment_status', v_status,
    'duplicate', false
  );
end $$;

-- ------------------------------------------------------------ permissões ---
-- Mesmo padrão da 0007: escrita só pelo service_role (Server Actions usam o
-- admin client); anon/authenticated não executam nada de PDV/financeiro.
revoke execute on function pdv_open_cash(numeric, uuid, text)
  from public, anon, authenticated;
revoke execute on function pdv_close_cash(numeric)
  from public, anon, authenticated;
revoke execute on function pdv_cash_supply(text, numeric, text, text)
  from public, anon, authenticated;
revoke execute on function pdv_register_sale(jsonb, text, sales_channel, integer, uuid, text)
  from public, anon, authenticated;
revoke execute on function financial_settle(uuid, numeric, text, text, text)
  from public, anon, authenticated;

grant execute on function pdv_open_cash(numeric, uuid, text) to service_role;
grant execute on function pdv_close_cash(numeric) to service_role;
grant execute on function pdv_cash_supply(text, numeric, text, text) to service_role;
grant execute on function pdv_register_sale(jsonb, text, sales_channel, integer, uuid, text)
  to service_role;
grant execute on function financial_settle(uuid, numeric, text, text, text)
  to service_role;
