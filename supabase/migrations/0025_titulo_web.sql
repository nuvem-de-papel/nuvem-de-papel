-- 0025_titulo_web.sql - Bloco 6: o checkout web gera titulo a receber.
--
-- Contexto:
--   * a constraint de financial_titles ja aceitava 'web'
--     (0009_f6_revenda_fornecedor.sql:308-309: ('pdv','web','purchase_receipt'));
--   * o PDV grava o proprio titulo dentro de pdv_register_sale
--     (0015_pdv_v6.sql:311, source_type='pdv');
--   * o webhook do Mercado Pago so trocava o status do pedido para 'pago'
--     (src/app/api/webhooks/mercadopago/route.ts:149) - o dinheiro da venda
--     online ficava FORA do financeiro, e e exatamente o que a auditoria CISA
--     apontou no Bloco 6 ("checkout web gerando titulo a receber").
--
-- Regra (uma linha por pedido, idempotente):
--   * so orders.origem = 'loja' (o checkout); origem 'pdv' ja tem titulo proprio
--     e origem 'erp' e o legado importado;
--   * status pos-pagamento (pago/processando/em_rota/entregue) => UM titulo
--     receivable 'aberto' + UMA parcela (number 1) pelo total do pedido;
--   * idempotency_key = 'web:' || order id - o retry do webhook ou um novo
--     update de status nao cria o segundo titulo;
--   * due_date = emissao + 1 dia: o Mercado Pago libera o valor em 1 dia util;
--     a baixa e manual em /financeiro ate a conciliacao bancaria (pendencia
--     aberta) automatizar a liquidacao;
--   * cancelamento do pedido cancela titulo e parcela SO se nada foi liquidado
--     (financial_settlements e imutavel - 0008_pdv_finance.sql:206-214): dinheiro
--     que ja entrou nao pode sumir da trilha, o estorno e outra escritura.
--
-- SECURITY DEFINER: o gatilho pode disparar para qualquer papel (inclusive
-- authenticated) e as financial_* tem RLS so de leitura para master/gerente
-- (0008:179-195); a funcao roda como o dono (postgres) e ignora RLS, como ja
-- fazem register_stock_movement (0007:128) e post_order_accounting (0022:186).

create or replace function garantir_titulo_web(
  p_tenant  uuid,
  p_order   uuid,
  p_origem  text,
  p_status  text,
  p_total   numeric,
  p_customer uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key     text := 'web:' || p_order::text;
  v_titulo  uuid;
  v_liquidado boolean;
begin
  -- so o checkout web; PDV e legado ficam de fora.
  if p_origem is distinct from 'loja' then
    return;
  end if;

  -- UM titulo por pedido, seja quem o tenha criado (semente de demonstracao,
  -- pdv_register_sale ou este proprio gatilho): a identidade e source_id, nao
  -- a nossa chave. Sem isto o backfill imprimia um SEGUNDO titulo para os
  -- pedidos pagos que ja vinham com titulo da semente - e o /financeiro contava
  -- o mesmo dinheiro duas vezes.
  select id
    into v_titulo
    from financial_titles
   where tenant_id = p_tenant
     and source_id = p_order
   limit 1;

  if p_status in ('pago', 'processando', 'em_rota', 'entregue') then
    if v_titulo is not null then
      return;
    end if;
    if p_total is null or p_total <= 0 then
      return;
    end if;

    v_titulo := gen_random_uuid();
    insert into financial_titles
      (id, tenant_id, code, direction, status, principal_amount, issue_date,
       due_date, source_type, source_id, customer_id, idempotency_key, notes)
    values
      (v_titulo, p_tenant, 'FIN-' || upper(substr(v_titulo::text, 1, 8)),
       'receivable', 'aberto', p_total, current_date, current_date + 1,
       'web', p_order, p_customer, v_key,
       'Venda da loja online (checkout web)');

    insert into financial_installments
      (tenant_id, title_id, number, due_date, principal_amount)
    values
      (p_tenant, v_titulo, 1, current_date + 1, p_total);
    return;
  end if;

  if p_status = 'cancelado' then
    -- v_titulo ja veio do source_id acima: cancelamos o titulo QUE EXISTE para
    -- este pedido, seja qual for a chave dele (semente, pdv ou nosso 'web:').
    if v_titulo is null then
      return;
    end if;

    select exists (
      select 1
        from financial_installments i
       where i.title_id = v_titulo
         and (i.paid_amount > 0 or i.status in ('liquidado', 'parcial'))
    ) into v_liquidado;
    if v_liquidado then
      return;
    end if;

    update financial_installments
       set status = 'cancelado'
     where title_id = v_titulo
       and status in ('aberto', 'vencido');

    update financial_titles
       set status = 'cancelado'
     where id = v_titulo
       and status in ('aberto', 'parcial');
  end if;
end $$;

create or replace function orders_titulo_web() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform garantir_titulo_web(
    new.tenant_id, new.id, new.origem, new.status,
    new.total_amount, new.customer_id
  );
  return null;
end $$;

drop trigger if exists trg_orders_titulo_web on orders;
create trigger trg_orders_titulo_web
  after insert or update of status on orders
  for each row
  when (new.origem = 'loja')
  execute function orders_titulo_web();

-- Backfill: os pedidos da loja ja pagados tambem precisam do titulo (em
-- producao eram 5 pedidos pagos por 3.110,90 - nenhum deles aparecia no
-- /financeiro). Idempotente: rodar de novo nao duplica nada, e pula o pedido
-- que ja tem titulo de qualquer outra origem (a semente de demonstracao tem 10
-- titulos 'web' com chave propria; 3 deles cobriam pedidos que este backfill
-- viria re-imprimir em dobro).
do $$
declare
  r record;
begin
  for r in
    select tenant_id, id, origem, status, total_amount, customer_id
      from orders
     where origem = 'loja'
       and status in ('pago', 'processando', 'em_rota', 'entregue')
       and total_amount > 0
  loop
    perform garantir_titulo_web(
      r.tenant_id, r.id, r.origem, r.status, r.total_amount, r.customer_id
    );
  end loop;
end $$;
