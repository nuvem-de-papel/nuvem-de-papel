-- 0054_cancelar_venda.sql - Cancelar venda manual (17/11/2026).
--
-- Contexto: a venda manual (0040) grava estoque, titulo + parcelas,
-- liquidacao (dinheiro/pix/debito) e, pelos gatilhos da 0022/0023, o diario.
-- Nao existia caminho de volta: "editar" a venda reescreveria um diario
-- imutavel. O jeito certo e CANCELAR (desfazer tudo com lancamentos de
-- estorno) e, se for o caso, registrar uma venda nova.
--
-- Achado em producao (V-4268, cancelada em 14/11 fora do app): a receita foi
-- estornada pelo gatilho da 0023, mas o DINHEIRO nao - o caixa (1.1.1) ficou
-- com +2,60 e o "a receber" (1.1.2) com -2,60; o titulo seguiu 'liquidado'.
-- Faltava a peca que cria a liquidacao do tipo 'estorno' (o tipo existe
-- desde a 0008 e o gatilho da 0022 ja lanca D 1.1.2 / C 1.1.1, mas nenhuma
-- funcao gravava um estorno).
--
-- sale_cancel(order, motivo, actor) faz, numa transacao so:
--   1. trava o pedido; exige etapa 'venda' e origem 'manual' (PDV mexe na
--      gaveta - caixa_movements - e fica para depois);
--   2. recusa venda entregue, entrega em transito e NF-e ativa (pendente,
--      transmitida ou autorizada: cancele a nota antes);
--   3. para cada liquidacao sem estorno: grava o estorno (mesmo valor e
--      forma; chave 'cancelamento:<id da liquidacao>') -> o gatilho da 0022
--      tira o dinheiro do caixa;
--   4. parcelas e titulo -> 'cancelado' (paid_amount volta a 0: o dinheiro
--      saiu pelo estorno) -> a regua de cobranca para sozinha;
--   5. release_order_stock (0007): devolve o que a venda baixou;
--   6. entrega aguardando/separado/falhou -> 'devolvido' com evento;
--   7. pedido -> 'cancelado' + cancelado_em/motivo/por -> o gatilho da 0023
--      estorna receita e CMV (chave 'venda-estorno:<id>');
--   8. audit_log 'venda.cancelar'.
-- Reexecutar e seguro: venda ja cancelada so recebe o que faltar (e assim
-- que a V-4268 sera corrigida), sem duplicar estorno nem movimento.
--
-- begin/commit igual ao 0009-0053.

begin;

alter table orders
  add column if not exists cancelado_motivo text,
  add column if not exists cancelado_por uuid references auth.users(id) on delete set null;

alter table orders drop constraint if exists orders_cancelado_motivo_check;
alter table orders add constraint orders_cancelado_motivo_check
  check (cancelado_motivo is null or char_length(cancelado_motivo) between 5 and 500);

create or replace function sale_cancel(
  p_order_id uuid,
  p_motivo text,
  p_actor uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order        orders%rowtype;
  v_motivo       text := btrim(coalesce(p_motivo, ''));
  v_ja_cancelada boolean;
  v_nf           text;
  v_entrega_id   uuid;
  v_entrega_de   text;
  v_entrega_st   text := null;
  v_liq          record;
  v_estornos     integer := 0;
  v_estornado    numeric(12,2) := 0;
  v_parcelas     integer := 0;
  v_dev_antes    integer;
  v_dev_depois   integer;
begin
  if char_length(v_motivo) < 5 or char_length(v_motivo) > 500 then
    raise exception 'MOTIVO_INVALIDO';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'VENDA_NAO_ENCONTRADA';
  end if;
  if v_order.etapa is distinct from 'venda' then
    raise exception 'NAO_E_VENDA';
  end if;
  if v_order.origem is distinct from 'manual' then
    raise exception 'ORIGEM_NAO_SUPORTADA: %', v_order.origem;
  end if;

  v_ja_cancelada := v_order.status = 'cancelado';

  select id, status into v_entrega_id, v_entrega_de
    from entregas
   where order_id = p_order_id
     and tenant_id = v_order.tenant_id
   for update;

  if not v_ja_cancelada then
    if v_order.status not in ('pago', 'processando', 'em_rota') then
      raise exception 'VENDA_ENTREGUE';
    end if;

    select n.numero::text into v_nf
      from nfe_emissoes n
     where n.order_id = p_order_id
       and n.tenant_id = v_order.tenant_id
       and n.status in ('pendente', 'transmitida', 'autorizada')
     limit 1;
    if v_nf is not null then
      raise exception 'NOTA_FISCAL_ATIVA: %', v_nf;
    end if;

    if v_entrega_de = 'em_transito' then
      raise exception 'ENTREGA_EM_TRANSITO';
    end if;
    if v_entrega_de = 'entregue' then
      raise exception 'VENDA_ENTREGUE';
    end if;
  end if;

  -- 3. estorno de cada liquidacao ainda sem estorno
  for v_liq in
    select s.id, s.installment_id, s.amount, s.method
      from financial_settlements s
      join financial_installments i on i.id = s.installment_id
      join financial_titles t on t.id = i.title_id
     where t.tenant_id = v_order.tenant_id
       and t.source_id = p_order_id
       and t.direction = 'receivable'
       and s.type = 'liquidacao'
       and not exists (
         select 1 from financial_settlements e
          where e.tenant_id = v_order.tenant_id
            and e.idempotency_key = 'cancelamento:' || s.id
       )
     order by s.created_at
  loop
    insert into financial_settlements
      (tenant_id, installment_id, type, amount, method, notes,
       idempotency_key, created_by)
    values
      (v_order.tenant_id, v_liq.installment_id, 'estorno', v_liq.amount,
       v_liq.method, left('cancelamento da venda: ' || v_motivo, 500),
       'cancelamento:' || v_liq.id, p_actor);
    v_estornos := v_estornos + 1;
    v_estornado := v_estornado + v_liq.amount;
  end loop;

  -- 4. parcelas e titulo
  update financial_installments i
     set status = 'cancelado',
         paid_amount = 0
    from financial_titles t
   where t.id = i.title_id
     and t.tenant_id = v_order.tenant_id
     and t.source_id = p_order_id
     and t.direction = 'receivable'
     and (i.status <> 'cancelado' or i.paid_amount <> 0);
  get diagnostics v_parcelas = row_count;

  update financial_titles
     set status = 'cancelado'
   where tenant_id = v_order.tenant_id
     and source_id = p_order_id
     and direction = 'receivable'
     and status <> 'cancelado';

  -- 5. estoque (idempotente pelos marcadores venda/devolucao da 0007)
  select count(*) into v_dev_antes
    from stock_movements
   where reference_id = p_order_id and movement_type = 'devolucao';
  perform release_order_stock(p_order_id);
  select count(*) into v_dev_depois
    from stock_movements
   where reference_id = p_order_id and movement_type = 'devolucao';

  -- 6. entrega que nao saiu vira 'devolvido' (com trilha)
  if v_entrega_de in ('aguardando', 'separado', 'falhou') then
    update entregas
       set status = 'devolvido', updated_at = now()
     where id = v_entrega_id;
    insert into entrega_eventos
      (tenant_id, entrega_id, de_status, para_status, nota, created_by)
    values
      (v_order.tenant_id, v_entrega_id, v_entrega_de, 'devolvido',
       left('Venda cancelada: ' || v_motivo, 500), p_actor);
    v_entrega_st := 'devolvido';
  end if;

  -- 7. pedido (o gatilho da 0023 estorna receita e CMV no COMMIT)
  if v_ja_cancelada then
    update orders
       set cancelado_em = coalesce(cancelado_em, now()),
           cancelado_motivo = coalesce(cancelado_motivo, v_motivo),
           cancelado_por = coalesce(cancelado_por, p_actor)
     where id = p_order_id;
  else
    update orders
       set status = 'cancelado',
           cancelado_em = now(),
           cancelado_motivo = v_motivo,
           cancelado_por = p_actor
     where id = p_order_id;
  end if;

  -- 8. trilha
  insert into audit_log (tenant_id, actor_user_id, action, entity, entity_id, before, after)
  values (
    v_order.tenant_id, p_actor, 'venda.cancelar', 'orders', p_order_id,
    jsonb_build_object('status', v_order.status, 'cancelado_em', v_order.cancelado_em),
    jsonb_build_object(
      'venda_numero', v_order.venda_numero,
      'motivo', v_motivo,
      'ja_cancelada', v_ja_cancelada,
      'estornos', v_estornos,
      'valor_estornado', v_estornado,
      'parcelas_canceladas', v_parcelas,
      'estoque_devolvido', v_dev_depois - v_dev_antes,
      'entrega', v_entrega_st));

  return jsonb_build_object(
    'order_id', p_order_id,
    'venda_numero', v_order.venda_numero,
    'ja_cancelada', v_ja_cancelada,
    'estornos', v_estornos,
    'valor_estornado', v_estornado,
    'parcelas_canceladas', v_parcelas,
    'estoque_devolvido', v_dev_depois - v_dev_antes,
    'entrega', v_entrega_st);
end $$;

-- escrita so pelo service_role (Server Action usa o admin client)
revoke execute on function sale_cancel(uuid, text, uuid) from public, anon, authenticated;
grant execute on function sale_cancel(uuid, text, uuid) to service_role;

commit;
