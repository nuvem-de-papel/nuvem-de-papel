-- 0007_stock_core.sql — F4: livro de estoque imutável + reserva no checkout +
-- baixa no pagamento (webhook) + liberação em cancelamento.
--
-- Modelo:
--   * `stock_movements` é a fonte da verdade (ledger, imutável: deny-all RLS +
--     trigger que bloqueia UPDATE/DELETE — nem service_role reescreve histórico);
--   * `item_stock.stock_available/stock_on_hand` são agregados mantidos pela
--     função SECURITY DEFINER `register_stock_movement` com lock de linha:
--     dois compradores disputando a última unidade → o segundo recebe
--     ESTOQUE_INSUFICIENTE, nunca saldo negativo;
--   * item SEM linha em item_stock = sem controle de estoque (ilimitado) até a
--     primeira entrada manual; a partir daí vale a trava;
--   * reservas (checkout → aguardando_pagamento) baixam só o disponível;
--     settle (pago) emite venda+liberacao (físico -q, reserva encerrada);
--     release (cancelado) emite liberacao (antes do pago) ou devolucao (depois);
--   * transições de status de pedido passam a ser validadas por trigger.
--
-- Sinais: entrada/devolucao/ajuste gravam delta positivo (ajuste aceita sinal),
-- reserva negativa, liberação positiva, venda negativa. Físico = delta exceto
-- reserva/liberação (não alteram o que está na prateleira).

create table if not exists item_stock (
  item_id uuid primary key references catalog_items(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  stock_available integer not null default 0 check (stock_available >= 0),
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  item_id uuid not null references catalog_items(id) on delete cascade,
  movement_type text not null check (
    movement_type in ('entrada','ajuste','devolucao','reserva','liberacao','venda')
  ),
  quantity integer not null check (quantity <> 0),
  reference_type text check (reference_type in ('order','manual','compra')),
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_item on stock_movements(item_id, created_at desc);
create index if not exists idx_stock_movements_ref on stock_movements(reference_id, movement_type);

alter table item_stock enable row level security;
alter table stock_movements enable row level security;

-- deny-all implícito (nenhuma policy de escrita) + leitura para perfis
-- operacionais ativos (mesmo padrão da auditoria, sem campo sensível).
create policy "le estoque (operacional)"
  on item_stock for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente','operador','vendedor')
      and p.status = 'ativo'
  ));

create policy "le movimentos de estoque (operacional)"
  on stock_movements for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente','operador','vendedor')
      and p.status = 'ativo'
  ));

-- Vitrine pública: espelho só do disponível (a RLS de item_stock é restrita a
-- perfis operacionais e não pode vazar para o catálogo anônimo). Mantido pela
-- mesma função que escreve o agregado — nunca diverge.
create table if not exists item_stock_public (
  item_id uuid primary key references catalog_items(id) on delete cascade,
  stock_available integer not null default 0 check (stock_available >= 0)
);
alter table item_stock_public enable row level security;
create policy "estoque publico (vitrine)"
  on item_stock_public for select using (true);
grant select on item_stock_public to anon, authenticated;

-- Imutabilidade do ledger: bloqueia UPDATE/DELETE mesmo para service_role
-- (RLS deny-all não protege contra quem tem bypassrls).
create or replace function stock_movements_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'STOCK_MOVEMENTS_IMUTAVEL: % nao permitido em stock_movements', tg_op;
end $$;

create trigger trg_stock_movements_immutable
  before update or delete on stock_movements
  for each row execute function stock_movements_immutable();

-- Ciclo de vida do pedido: aguardando_pagamento -> pago -> processando ->
-- em_rota -> entregue; cancelado só a partir de estados não entregues.
create or replace function enforce_orders_transition() returns trigger
language plpgsql as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if (old.status = 'aguardando_pagamento' and new.status in ('pago','cancelado'))
    or (old.status = 'pago' and new.status in ('processando','cancelado'))
    or (old.status = 'processando' and new.status in ('em_rota','cancelado'))
    or (old.status = 'em_rota' and new.status in ('entregue','cancelado'))
  then
    return new;
  end if;
  raise exception 'TRANSICAO_INVALIDA: % -> %', old.status, new.status;
end $$;

create trigger trg_orders_transition
  before update of status on orders
  for each row execute function enforce_orders_transition();

-- Registro de movimento (ponto único de escrita do estoque) --------------
create or replace function register_stock_movement(
  p_item_id uuid,
  p_type text,
  p_quantity integer,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_notes text default null,
  p_created_by uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_delta integer;
  v_phys integer;
  v_avail integer;
  v_onhand integer;
begin
  if p_quantity is null or p_quantity = 0 then
    raise exception 'QUANTIDADE_INVALIDA';
  end if;

  case p_type
    when 'entrada' then
      if p_quantity < 0 then raise exception 'QUANTIDADE_INVALIDA'; end if;
      v_delta := p_quantity; v_phys := p_quantity;
    when 'devolucao' then
      if p_quantity < 0 then raise exception 'QUANTIDADE_INVALIDA'; end if;
      v_delta := p_quantity; v_phys := p_quantity;
    when 'ajuste' then
      v_delta := p_quantity; v_phys := p_quantity;
    when 'reserva' then
      if p_quantity < 0 then raise exception 'QUANTIDADE_INVALIDA'; end if;
      v_delta := -p_quantity; v_phys := 0;
    when 'liberacao' then
      if p_quantity < 0 then raise exception 'QUANTIDADE_INVALIDA'; end if;
      v_delta := p_quantity; v_phys := 0;
    when 'venda' then
      if p_quantity < 0 then raise exception 'QUANTIDADE_INVALIDA'; end if;
      v_delta := -p_quantity; v_phys := -p_quantity;
    else
      raise exception 'TIPO_MOVIMENTO_INVALIDO: %', p_type;
  end case;

  select ci.tenant_id into v_tenant
    from catalog_items ci where ci.id = p_item_id;
  if v_tenant is null then
    raise exception 'ITEM_INEXISTENTE: %', p_item_id;
  end if;

  if not exists (select 1 from item_stock where item_id = p_item_id) then
    -- sem linha = sem controle: reservar/vender/liberar de item sem controle
    -- é no-op (controlled=false); entrada/ajuste/devolucao criam a linha.
    if p_type in ('reserva','liberacao','venda') then
      return jsonb_build_object('controlled', false);
    end if;
    insert into item_stock (item_id, tenant_id, stock_available, stock_on_hand)
    values (p_item_id, v_tenant, 0, 0)
    on conflict (item_id) do nothing;
  end if;

  -- lock de linha + guarda de saldo: serializa a corrida do último item
  -- (READ COMMITTED reavalia a condição depois do lock).
  update item_stock
     set stock_available = stock_available + v_delta,
         stock_on_hand = stock_on_hand + v_phys,
         updated_at = now()
   where item_id = p_item_id
     and stock_available + v_delta >= 0
     and stock_on_hand + v_phys >= 0
  returning stock_available, stock_on_hand
     into v_avail, v_onhand;

  if not found then
    if not exists (select 1 from item_stock where item_id = p_item_id) then
      return jsonb_build_object('controlled', false);
    end if;
    select stock_available into v_avail from item_stock where item_id = p_item_id;
    raise exception 'ESTOQUE_INSUFICIENTE: % (%) — disponível %', p_type, p_item_id, v_avail;
  end if;

  insert into stock_movements
    (tenant_id, item_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
  values
    (v_tenant, p_item_id, p_type, v_delta, p_reference_type, p_reference_id, p_notes, p_created_by);

  -- espelho público (vitrine) sempre reflete o agregado
  insert into item_stock_public (item_id, stock_available)
  values (p_item_id, v_avail)
  on conflict (item_id) do update set stock_available = excluded.stock_available;

  return jsonb_build_object('controlled', true, 'available', v_avail, 'on_hand', v_onhand);
end $$;

-- Reserva do pedido inteiro (atômica: qualquer item sem saldo derruba tudo) --
create or replace function reserve_order_stock(p_order_id uuid) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'PEDIDO_INEXISTENTE: %', p_order_id;
  end if;
  for r in
    select item_id, quantity from order_items
    where order_id = p_order_id and item_id is not null
  loop
    perform register_stock_movement(
      r.item_id, 'reserva', r.quantity, 'order', p_order_id, null, null);
  end loop;
end $$;

-- Baixa efetiva (pagou): venda + liberação da reserva. Idempotente por item
-- (marcador movement_type='venda' com reference do pedido) — webhook pode
-- rodar mais de uma vez sem descontar em dobro.
create or replace function settle_order_stock(p_order_id uuid) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  -- lock no pedido serializa webhook x estorno x expedição
  perform 1 from orders where id = p_order_id for update;
  if not found then
    raise exception 'PEDIDO_INEXISTENTE: %', p_order_id;
  end if;
  for r in
    select item_id, quantity from order_items
    where order_id = p_order_id and item_id is not null
  loop
    if not exists (
      select 1 from stock_movements
      where reference_id = p_order_id and item_id = r.item_id
        and movement_type = 'venda'
    ) then
      perform register_stock_movement(
        r.item_id, 'venda', r.quantity, 'order', p_order_id, null, null);
      perform register_stock_movement(
        r.item_id, 'liberacao', r.quantity, 'order', p_order_id, 'consumo da reserva', null);
    end if;
  end loop;
end $$;

-- Cancelamento: devolve reserva (antes do pagamento) ou o físico (estorno
-- depois de pago). Idempotente pelos marcadores liberacao/devolucao.
create or replace function release_order_stock(p_order_id uuid) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  perform 1 from orders where id = p_order_id for update;
  if not found then
    raise exception 'PEDIDO_INEXISTENTE: %', p_order_id;
  end if;
  for r in
    select item_id, quantity from order_items
    where order_id = p_order_id and item_id is not null
  loop
    if exists (
      select 1 from stock_movements
      where reference_id = p_order_id and item_id = r.item_id
        and movement_type = 'venda'
    ) then
      if not exists (
        select 1 from stock_movements
        where reference_id = p_order_id and item_id = r.item_id
          and movement_type = 'devolucao'
      ) then
        perform register_stock_movement(
          r.item_id, 'devolucao', r.quantity, 'order', p_order_id,
          'cancelamento com pagamento estornado', null);
      end if;
    elsif exists (
      select 1 from stock_movements
      where reference_id = p_order_id and item_id = r.item_id
        and movement_type = 'reserva'
    ) then
      if not exists (
        select 1 from stock_movements
        where reference_id = p_order_id and item_id = r.item_id
          and movement_type = 'liberacao'
      ) then
        perform register_stock_movement(
          r.item_id, 'liberacao', r.quantity, 'order', p_order_id,
          'cancelamento antes do pagamento', null);
      end if;
    end if;
    -- item sem controle de estoque: nenhum movimento, nada a devolver
  end loop;
end $$;

-- Execução só do service_role (o app inteiro usa a service key nas rotas de
-- escrita); anon/authenticated ficam sem permissão de mexer em estoque.
revoke execute on function register_stock_movement(uuid, text, integer, text, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function reserve_order_stock(uuid) from public, anon, authenticated;
revoke execute on function settle_order_stock(uuid) from public, anon, authenticated;
revoke execute on function release_order_stock(uuid) from public, anon, authenticated;
grant execute on function register_stock_movement(uuid, text, integer, text, uuid, text, uuid)
  to service_role;
grant execute on function reserve_order_stock(uuid) to service_role;
grant execute on function settle_order_stock(uuid) to service_role;
grant execute on function release_order_stock(uuid) to service_role;
