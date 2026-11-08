-- 0040_venda_manual.sql - Venda manual (telefone/balcao): venda completa
-- SEM caixa aberto, com PF/PJ, todas as formas de pagamento e entrega ou
-- retirada.
--
-- Contexto (regra do cliente 20/10/2026):
--   * o cliente liga e faz o pedido direto: nao passa pelo site nem pelo PDV;
--   * o PDV exige caixa aberto (0015:203-210, CAIXA_FECHADO) - e ainda nao
--     existe loja fisica; a venda de telefone nao pode depender de gaveta;
--   * o cliente pode nao ter cadastro (e nao quer criar conta): criacao
--     rapida PF/PJ na hora do pedido resolve - nome + documento + telefone,
--     sem senha e sem e-mail obrigatorio (o e-mail placeholder e da coluna
--     NOT NULL da 0003, nao do cliente);
--   * formas de pagamento COMPLETAS: dinheiro/pix/debito (recebidos na hora),
--     cartao parcelado, boleto e fiado ("a prazo") - os tres ultimos geram
--     titulo + parcelas em aberto que entram sozinhos na regua de cobranca
--     (0035: lembrete D-3/D0/D+3/D+7/D+15 por e-mail);
--   * entrega ou retirada: `p_entrega` preenchido cria a linha em `entregas`
--     (aba Expedicao, mesmos status/eventos/avisos de sempre); nulo = o
--     cliente retira no balcao e a venda nao gera entrega.
--
-- Decisoes (regras que o PDV ja validou em producao, repetidas aqui):
--   * preco SEMPRE resolvido no servidor (resolve_price por canal com
--     fallback varejo) - o navegador manda item_id e quantidade apenas;
--   * baixa DIRETA de estoque ('venda', sem reserva): saldo insuficiente
--     derruba a venda inteira (tudo numa unica transacao);
--   * a venda nasce `etapa='venda'` com numero V- (e uma venda confirmada,
--     nao um pedido em aberto) e `status='pago'` (faturada - mesmo criterio
--     do cartao no PDV); dinheiro/pix/debito liquidam a parcela na hora,
--     cartao/boleto/fiado deixam parcelas em aberto para a regua cobrar;
--   * idempotencia: a mesma chave nunca cria duas vendas (trava parcial-
--     unica de orders.idempotency_key, 0008:126);
--   * SEM consulta a caixa_sessions: nao ha gaveta nesta tela;
--   * origem='manual' (novo valor do orders_origem_check) e source_type
--     'manual' nos titulos financeiros (mesmo padrao pdv/web/purchase_receipt).
--
-- DRE (sem anti-dobra, 0022:20-30): TODA venda manual gera titulo receivable,
-- entao o gatilho da 0022 credita a receita em 1.1.2 (a receber); quando o
-- dinheiro ja entrou (dinheiro/pix/debito) a liquidacao roda no mesmo commit
-- e o gatilho de settlements move de 1.1.2 para 1.1.1 (caixa). Efeito final:
-- caixa debitado, receita creditada - igual ao PDV, porem com trilha de
-- liquidacao no financeiro. Cartao/boleto/fiado ficam em aberto e a baixa
-- posterior (módulo Financeiro, 0025) e que leva o dinheiro ao caixa.
--
-- begin/commit igual ao 0009-0039.

begin;

-- ---------------------------------------------------------------- pedidos --
-- origem 'manual' + fiado como forma de pagamento (a prazo direto com o
-- cliente; parcelas viram titulo + regua de cobranca).
alter table orders drop constraint if exists orders_origem_check;
alter table orders add constraint orders_origem_check
  check (origem in ('erp', 'pdv', 'loja', 'manual'));

alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('pix', 'cartao', 'boleto', 'dinheiro', 'debito', 'fiado'));

-- condicao: a venda manual grava "2x"/"3x"... (N parcelas) - os valores
-- antigos da 0015 continuam validos; so acrescenta o rotulo Nx.
alter table orders drop constraint if exists orders_condicao_check;
alter table orders add constraint orders_condicao_check
  check (condicao in ('À vista', '30 dias', '30/60', '30/60/90')
         or condicao ~ '^[0-9]{1,2}x$');

-- titulos da venda manual (a regua e o financeiro nao distinguem a origem,
-- mas o livro de titulos sim - mesmos valores das 0008/0009).
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
  check (source_type in ('pdv', 'web', 'purchase_receipt', 'manual'));

-- --------------------------------------------------------------- a funcao --
-- drop da assinatura antiga (sem p_discount): um CREATE OR REPLACE com
-- assinatura diferente cria SOBRECARGA e deixaria duas funcoes no catalogo.
drop function if exists public.manual_register_sale(
  jsonb, text, sales_channel, integer, uuid, jsonb, jsonb, text);

create or replace function manual_register_sale(
  p_items jsonb,
  p_payment_method text,
  p_channel sales_channel default 'varejo',
  p_installments integer default 1,
  p_discount numeric default 0,
  p_customer_id uuid default null,
  p_customer jsonb default null,
  p_entrega jsonb default null,
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
  v_customer uuid;
  v_title uuid;
  v_inst uuid;
  v_entrega uuid;
  v_sub numeric(12,2) := 0;
  v_desc numeric(12,2) := coalesce(p_discount, 0);
  v_total numeric(12,2);
  v_base numeric(12,2);
  v_amount numeric(12,2);
  v_price numeric;
  v_doc text;
  v_dup jsonb;
  rec record;
begin
  if length(v_key) < 8 then
    raise exception 'CHAVE_IDEMPOTENCIA_INVALIDA';
  end if;
  if p_payment_method not in ('dinheiro', 'pix', 'debito', 'cartao', 'boleto', 'fiado') then
    raise exception 'FORMA_PAGAMENTO_INVALIDA: %', p_payment_method;
  end if;
  if p_installments is null or p_installments < 1 or p_installments > 12 then
    raise exception 'PARCELAS_INVALIDAS';
  end if;
  if p_payment_method in ('dinheiro', 'pix', 'debito') and p_installments <> 1 then
    raise exception 'PARCELAS_SO_NO_PRAZO';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'CARRINHO_VAZIO';
  end if;
  if v_desc < 0 then
    raise exception 'DESCONTO_INVALIDO';
  end if;

  -- idempotencia: a mesma chave nunca cria duas vendas.
  select jsonb_build_object('order_id', o.id, 'total', o.total_amount,
                            'duplicate', true)
    into v_dup
    from orders o
   where o.tenant_id = v_tenant and o.idempotency_key = v_key;
  if v_dup is not null then
    return v_dup;
  end if;

  -- cliente: existente (ativo) OU criacao rapida PF/PJ na hora do pedido.
  v_customer := p_customer_id;
  if v_customer is not null then
    select id into v_customer from customers
     where id = v_customer and tenant_id = v_tenant and ativo;
    if v_customer is null then
      raise exception 'CLIENTE_INEXISTENTE_OU_BLOQUEADO';
    end if;
  elsif p_customer is not null and jsonb_typeof(p_customer) = 'object' then
    v_doc := regexp_replace(coalesce(p_customer->>'documento', ''), '[^0-9]', '', 'g');
    if coalesce(nullif(trim(p_customer->>'nome'), ''), '') = '' then
      raise exception 'CLIENTE_NOME_OBRIGATORIO';
    end if;
    if v_doc !~ '^[0-9]{11}$|^[0-9]{14}$' then
      raise exception 'CLIENTE_DOCUMENTO_INVALIDO: %', v_doc;
    end if;
    if coalesce(nullif(trim(p_customer->>'telefone'), ''), '') !~ '^[0-9]{10,11}$' then
      raise exception 'CLIENTE_TELEFONE_INVALIDO';
    end if;
    -- mesmo documento = mesmo cliente (nao cadastra o rapaz duas vezes);
    -- documento bloqueado nao compra.
    select id into v_customer from customers
     where tenant_id = v_tenant and documento = v_doc;
    if v_customer is not null then
      select id into v_customer from customers
       where id = v_customer and tenant_id = v_tenant and ativo;
      if v_customer is null then
        raise exception 'CLIENTE_BLOQUEADO';
      end if;
    else
      insert into customers (tenant_id, name, email, documento, telefone,
                             whatsapp, cep, logradouro, numero, complemento,
                             bairro, cidade, uf)
      values (v_tenant,
              nullif(trim(p_customer->>'nome'), ''),
              'vendamanual-' || left(gen_random_uuid()::text, 8) || '@nuvemdepapel.com.br',
              v_doc,
              regexp_replace(coalesce(p_customer->>'telefone', ''), '[^0-9]', '', 'g'),
              nullif(regexp_replace(coalesce(p_customer->>'whatsapp', ''), '[^0-9]', '', 'g'), ''),
              nullif(regexp_replace(coalesce(p_customer->>'cep', ''), '[^0-9]', '', 'g'), ''),
              nullif(trim(coalesce(p_customer->>'logradouro', '')), ''),
              nullif(trim(coalesce(p_customer->>'numero', '')), ''),
              nullif(trim(coalesce(p_customer->>'complemento', '')), ''),
              nullif(trim(coalesce(p_customer->>'bairro', '')), ''),
              nullif(trim(coalesce(p_customer->>'cidade', '')), ''),
              nullif(upper(trim(coalesce(p_customer->>'uf', ''))), ''))
      returning id into v_customer;
    end if;
  else
    raise exception 'CLIENTE_OBRIGATORIO';
  end if;

  -- validacao + precificacao server-side (mesmo loop do PDV, 0015:230-243)
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

  -- entrega: preenchido cria a linha da Expedicao; nulo = retira no balcao.
  if p_entrega is not null then
    if jsonb_typeof(p_entrega) <> 'object'
       or coalesce(nullif(trim(p_entrega->>'logradouro'), ''), '') = '' then
      raise exception 'ENTREGA_ENDERECO_INVALIDO';
    end if;
    if coalesce(p_entrega->>'prazo', '') <> ''
       and coalesce(p_entrega->>'prazo', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'ENTREGA_PRAZO_INVALIDO';
    end if;
  end if;

  insert into orders
    (tenant_id, customer_id, channel, status, total_amount, payment_method,
     idempotency_key, origem, etapa, convertido_em, venda_numero, condicao,
     discount_amount)
  values
    (v_tenant, v_customer, p_channel, 'pago', 0, p_payment_method, v_key,
     'manual', 'venda', now(),
     'V-' || lpad(nextval('seq_venda_numero')::text, 4, '0'),
     case when p_installments > 1 then p_installments || 'x' else 'À vista' end,
     v_desc)
  returning id into v_order;

  for rec in
    select elem->>'item_id' as item_id_raw,
           (elem->>'item_id')::uuid as item_id,
           (elem->>'quantity')::integer as quantity
      from jsonb_array_elements(p_items) as elem
  loop
    -- preço do canal com fallback varejo; item inativo/inexistente nao passa
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
      rec.item_id, 'venda', rec.quantity, 'order', v_order, 'venda manual', null);
  end loop;

  if v_sub <= 0 then
    raise exception 'TOTAL_INVALIDO';
  end if;
  if v_desc >= v_sub then
    raise exception 'DESCONTO_EXCEDE_SUBTOTAL';
  end if;
  v_total := v_sub - v_desc;

  update orders set total_amount = v_total where id = v_order;

  -- financeiro: TODA venda manual gera titulo + parcelas (o recebido fica
  -- liquidado na hora com trilha de settlement; o a receber fica aberto para
  -- a regua de cobranca). Vencimentos: cartao igual ao PDV (+1..N meses);
  -- boleto +3 dias na 1a parcela e mensal depois; fiado +30 dias e mensal.
  v_title := gen_random_uuid();
  insert into financial_titles
    (id, tenant_id, code, direction, status, principal_amount, issue_date,
     due_date, source_type, source_id, customer_id, idempotency_key)
  values
    (v_title, v_tenant, 'FIN-' || upper(substr(v_title::text, 1, 8)),
     'receivable', 'aberto', v_total, current_date,
     case p_payment_method
       when 'cartao' then (current_date + make_interval(months => p_installments))::date
       when 'boleto' then (current_date + 3 + make_interval(months => p_installments - 1))::date
       else (current_date + 30 + make_interval(months => p_installments - 1))::date
     end,
     'manual', v_order, v_customer, v_key || ':titulo');

  v_base := trunc(v_total / p_installments, 2);
  if v_base = 0 then
    raise exception 'VALOR_PARCELA_INVALIDA';
  end if;
  for i in 1..p_installments loop
    v_amount := case
      when i = p_installments then v_total - v_base * (p_installments - 1)
      else v_base
    end;
    insert into financial_installments
      (tenant_id, title_id, number, due_date, principal_amount)
    values
      (v_tenant, v_title, i,
       case p_payment_method
         when 'cartao' then (current_date + make_interval(months => i))::date
         when 'boleto' then (current_date + 3 + make_interval(months => i - 1))::date
         else (current_date + 30 + make_interval(months => i - 1))::date
       end, v_amount)
    returning id into v_inst;
  end loop;

  -- recebido na hora (dinheiro/pix/debito): liquida a parcela 1 com trilha
  -- de liquidacao (o gatilho da 0022 leva o dinheiro ao caixa do diario).
  if p_payment_method in ('dinheiro', 'pix', 'debito') then
    perform financial_settle(
      v_inst, v_total, p_payment_method, v_key || ':baixa', 'venda manual');
  end if;

  -- expedicao: linha em entregas com endereco/transportadora/prazo/observacao
  if p_entrega is not null then
    insert into entregas
      (tenant_id, order_id, status, endereco, transportadora, prazo, observacao)
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
       nullif(trim(coalesce(p_entrega->>'transportadora', '')), ''),
       nullif(coalesce(p_entrega->>'prazo', ''), '')::date,
       nullif(trim(coalesce(p_entrega->>'observacao', '')), ''))
    returning id into v_entrega;
  end if;

  return jsonb_build_object(
    'order_id', v_order,
    'customer_id', v_customer,
    'title_id', v_title,
    'entrega_id', v_entrega,
    'total', v_total,
    'subtotal', v_sub,
    'desconto', v_desc,
    'duplicate', false
  );
end $$;

-- permissoes: mesmo ritual das 0007/0008/0015 - escrita so pelo service_role
-- (Server Action usa o admin client); anon/authenticated nao executam nada.
revoke execute on function manual_register_sale(jsonb, text, sales_channel, integer, numeric, uuid, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function manual_register_sale(jsonb, text, sales_channel, integer, numeric, uuid, jsonb, jsonb, text)
  to service_role;

commit;
