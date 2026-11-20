-- 0060 - Pedido corporativo no atacado com checagem de credito
-- (etapa 3 de "Contas do Cliente", 20/11/2026)
--
-- O comprador de uma empresa ATIVA (0059) faz o pedido em /corporativo:
--   * preco do canal ATACADO, sempre no servidor (resolve_price, cai no varejo
--     quando o item nao tem preco de atacado);
--   * credito: disponivel = limite_credito - parcelas em aberto dos pedidos
--     corporativos da empresa. Pedido maior que o disponivel e recusado
--     (LIMITE_INSUFICIENTE) e parcela VENCIDA trava pedido novo
--     (TITULO_VENCIDO). A linha da empresa e travada (FOR UPDATE): dois
--     pedidos simultaneos nunca estouram o limite juntos;
--   * a venda nasce faturada igual a venda manual (0040): etapa 'venda',
--     status 'pago', numero V-, baixa de estoque, titulo a receber com 1
--     parcela vencendo em hoje + prazo_dias (o gatilho da 0022 lanca em
--     1.1.2 Contas a receber; a regua de cobranca 0035 cobra);
--   * entrega opcional (linha em entregas, aba Expedicao); nula = retira.
-- Quem pode comprar: papel 'comprador' ou 'admin' (o 'financeiro' so ve).
-- Escrita so pela service_role (server action + audit_log).
begin;

-- condicao "N dias" (prazo da empresa, 1..120)
alter table public.orders drop constraint if exists orders_condicao_check;
alter table public.orders add constraint orders_condicao_check
  check (condicao in ('À vista', '30 dias', '30/60', '30/60/90')
         or condicao ~ '^[0-9]{1,2}x$'
         or condicao ~ '^[0-9]{1,3} dias$');

-- titulo da venda corporativa
alter table public.financial_titles drop constraint if exists financial_titles_source_type_check;
alter table public.financial_titles add constraint financial_titles_source_type_check
  check (source_type in ('pdv', 'web', 'purchase_receipt', 'manual', 'corporativo'));

-- ------------------------------------------------------------ credito --
-- Fonte unica do saldo de credito (a tela e o pedido leem daqui).
create or replace function public.corporate_credit(p_account uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with abertas as (
    select fi.principal_amount - fi.paid_amount as saldo, fi.due_date
      from financial_installments fi
      join financial_titles ft on ft.id = fi.title_id
      join orders o on o.id = ft.source_id
     where o.corporate_account_id = p_account
       and ft.direction = 'receivable'
       and ft.source_type = 'corporativo'
       and fi.status in ('aberto', 'parcial', 'vencido')
  )
  select jsonb_build_object(
    'limite', ca.limite_credito,
    'em_aberto', coalesce((select sum(saldo) from abertas), 0),
    'disponivel', greatest(ca.limite_credito - coalesce((select sum(saldo) from abertas), 0), 0),
    'vencido', coalesce((select sum(saldo) from abertas where due_date < current_date), 0),
    'prazo_dias', ca.prazo_dias,
    'status', ca.status)
    from corporate_accounts ca
   where ca.id = p_account;
$$;

revoke execute on function public.corporate_credit(uuid) from public, anon, authenticated;
grant execute on function public.corporate_credit(uuid) to service_role;

-- ------------------------------------------------------------- pedido --
create or replace function public.corporate_place_order(
  p_user uuid,
  p_items jsonb,
  p_entrega jsonb default null,
  p_observacao text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_key text := coalesce(nullif(trim(coalesce(p_idempotency_key, '')), ''), '');
  v_buyer record;
  v_conta record;
  v_credito jsonb;
  v_disponivel numeric(12,2);
  v_order uuid;
  v_title uuid;
  v_entrega uuid;
  v_total numeric(12,2) := 0;
  v_price numeric;
  v_due date;
  v_dup jsonb;
  rec record;
begin
  if length(v_key) < 8 then
    raise exception 'CHAVE_IDEMPOTENCIA_INVALIDA';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'CARRINHO_VAZIO';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'ITENS_DEMAIS';
  end if;
  if p_observacao is not null and char_length(p_observacao) > 500 then
    raise exception 'OBSERVACAO_LONGA';
  end if;

  select b.account_id, b.papel into v_buyer
    from corporate_buyers b
   where b.auth_user_id = p_user and b.ativo and b.tenant_id = v_tenant;
  if v_buyer is null then
    raise exception 'COMPRADOR_INEXISTENTE';
  end if;
  if v_buyer.papel not in ('comprador', 'admin') then
    raise exception 'COMPRADOR_SEM_PERMISSAO';
  end if;

  -- trava a empresa: pedidos simultaneos esperam um pelo outro
  select ca.id, ca.customer_id, ca.status, ca.prazo_dias into v_conta
    from corporate_accounts ca
   where ca.id = v_buyer.account_id
     for update;
  if v_conta.status <> 'ativa' then
    raise exception 'CONTA_NAO_ATIVA: %', v_conta.status;
  end if;
  if not exists (select 1 from customers c where c.id = v_conta.customer_id and c.ativo) then
    raise exception 'CLIENTE_BLOQUEADO';
  end if;

  -- idempotencia: a mesma chave nunca cria dois pedidos
  select jsonb_build_object('order_id', o.id, 'total', o.total_amount, 'duplicate', true)
    into v_dup
    from orders o
   where o.tenant_id = v_tenant and o.idempotency_key = v_key;
  if v_dup is not null then
    return v_dup;
  end if;

  -- precifica tudo ANTES de gravar (o credito e conferido sobre o total real)
  for rec in
    select elem->>'item_id' as item_id_raw, (elem->>'quantity') as qty_raw
      from jsonb_array_elements(p_items) as elem
  loop
    if rec.item_id_raw is null
       or rec.item_id_raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'ITEM_INVALIDO: %', rec.item_id_raw;
    end if;
    if rec.qty_raw is null or rec.qty_raw !~ '^[0-9]{1,5}$' or rec.qty_raw::integer < 1 then
      raise exception 'QUANTIDADE_INVALIDA';
    end if;
    select resolve_price(ci.id, 'atacado', rec.qty_raw::integer) into v_price
      from catalog_items ci
     where ci.id = rec.item_id_raw::uuid and ci.tenant_id = v_tenant and ci.active;
    if v_price is null then
      raise exception 'SEM_PRECO_OU_INATIVO: %', rec.item_id_raw;
    end if;
    v_total := v_total + round(v_price * rec.qty_raw::integer, 2);
  end loop;
  if v_total <= 0 then
    raise exception 'TOTAL_INVALIDO';
  end if;

  v_credito := corporate_credit(v_conta.id);
  if (v_credito->>'vencido')::numeric > 0 then
    raise exception 'TITULO_VENCIDO: %', v_credito->>'vencido';
  end if;
  v_disponivel := (v_credito->>'disponivel')::numeric;
  if v_total > v_disponivel then
    raise exception 'LIMITE_INSUFICIENTE: disponivel % total %', v_disponivel, v_total;
  end if;

  if p_entrega is not null then
    if jsonb_typeof(p_entrega) <> 'object'
       or coalesce(nullif(trim(p_entrega->>'logradouro'), ''), '') = '' then
      raise exception 'ENTREGA_ENDERECO_INVALIDO';
    end if;
  end if;

  v_due := current_date + v_conta.prazo_dias;

  insert into orders
    (tenant_id, customer_id, channel, status, total_amount, payment_method,
     idempotency_key, origem, etapa, convertido_em, venda_numero, condicao,
     discount_amount, corporate_account_id, user_id)
  values
    (v_tenant, v_conta.customer_id, 'atacado', 'pago', v_total, 'boleto', v_key,
     'corporativo', 'venda', now(),
     'V-' || lpad(nextval('seq_venda_numero')::text, 4, '0'),
     case when v_conta.prazo_dias = 0 then 'À vista' else v_conta.prazo_dias || ' dias' end,
     0, v_conta.id, p_user)
  returning id into v_order;

  for rec in
    select (elem->>'item_id')::uuid as item_id, (elem->>'quantity')::integer as quantity
      from jsonb_array_elements(p_items) as elem
  loop
    v_price := resolve_price(rec.item_id, 'atacado', rec.quantity);
    insert into order_items
      (tenant_id, order_id, item_id, sku, name, unit_price, quantity, total)
    select v_tenant, v_order, ci.id, ci.sku, ci.name, v_price, rec.quantity,
           round(v_price * rec.quantity, 2)
      from catalog_items ci
     where ci.id = rec.item_id and ci.tenant_id = v_tenant;

    -- baixa direta; saldo insuficiente derruba o pedido inteiro
    perform register_stock_movement(
      rec.item_id, 'venda', rec.quantity, 'order', v_order, 'pedido corporativo', null);
  end loop;

  v_title := gen_random_uuid();
  insert into financial_titles
    (id, tenant_id, code, direction, status, principal_amount, issue_date,
     due_date, source_type, source_id, customer_id, idempotency_key)
  values
    (v_title, v_tenant, 'FIN-' || upper(substr(v_title::text, 1, 8)),
     'receivable', 'aberto', v_total, current_date, v_due,
     'corporativo', v_order, v_conta.customer_id, v_key || ':titulo');

  insert into financial_installments
    (tenant_id, title_id, number, due_date, principal_amount)
  values (v_tenant, v_title, 1, v_due, v_total);

  if p_entrega is not null then
    insert into entregas
      (tenant_id, order_id, status, endereco, observacao)
    values
      (v_tenant, v_order, 'aguardando',
       jsonb_build_object(
         'cep', nullif(regexp_replace(coalesce(p_entrega->>'cep', ''), '[^0-9]', '', 'g'), ''),
         'logradouro', nullif(trim(coalesce(p_entrega->>'logradouro', '')), ''),
         'numero', nullif(trim(coalesce(p_entrega->>'numero', '')), ''),
         'complemento', nullif(trim(coalesce(p_entrega->>'complemento', '')), ''),
         'bairro', nullif(trim(coalesce(p_entrega->>'bairro', '')), ''),
         'cidade', nullif(trim(coalesce(p_entrega->>'cidade', '')), ''),
         'uf', nullif(upper(trim(coalesce(p_entrega->>'uf', ''))), '')),
       nullif(trim(coalesce(p_observacao, '')), ''))
    returning id into v_entrega;
  end if;

  return jsonb_build_object(
    'order_id', v_order,
    'account_id', v_conta.id,
    'title_id', v_title,
    'entrega_id', v_entrega,
    'total', v_total,
    'vencimento', v_due,
    'disponivel_antes', v_disponivel,
    'duplicate', false);
end $$;

revoke execute on function public.corporate_place_order(uuid, jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.corporate_place_order(uuid, jsonb, jsonb, text, text)
  to service_role;

commit;
