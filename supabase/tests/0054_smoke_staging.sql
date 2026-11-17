-- 0054_smoke_staging.sql - COMPORTAMENTO do sale_cancel. SO NO STAGING.
--
-- Tudo roda numa subtransacao que termina com um raise de proposito
-- (SMOKE_0054_ROLLBACK): nenhuma linha fica gravada. Unico residuo: os
-- numeros V- consumidos da seq_venda_numero (sequencia nao volta) - por isso
-- NAO rodar em producao (abriria buraco na numeracao de venda).
--
-- Os gatilhos do diario (0022/0023) sao deferred: `set constraints all
-- immediate` faz eles rodarem na hora, simulando o COMMIT da venda antes do
-- cancelamento (e assim que acontece de verdade: venda num dia, cancela depois).
--
-- Cenarios:
--   A  pix -> cancela: estorno do dinheiro, estoque volta, titulo/parcela
--      cancelados, diario zerado por conta, audit
--   A2 cancelar de novo: nao duplica nada
--   B  fiado 2x com entrega aguardando -> entrega 'devolvido' + evento
--   C  entrega em transito -> recusa (ENTREGA_EM_TRANSITO)
--   D  NF-e pendente -> recusa (NOTA_FISCAL_ATIVA)
--   E  reparo (formato da V-4268: status mudado direto, sem estorno) -> o
--      sale_cancel completa o que faltou e o caixa zera
-- Gate: a ultima linha FALHAS tem que ser true.

drop table if exists _out_0054;
create temp table _out_0054 (n serial, teste text, ok boolean, detalhe text);

do $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_res    jsonb := '[]'::jsonb;
  v_item   uuid;
  v_cli    uuid;
  v_sale   jsonb;
  v_order  uuid;
  v_ret    jsonb;
  v_n      numeric;
  v_m      numeric;
  v_txt    text;
  v_ent    uuid;
  v_end    jsonb := jsonb_build_object('logradouro', 'Rua Smoke', 'numero', '1',
                                       'cidade', 'Piracicaba', 'uf', 'SP',
                                       'cep', '13405404');
begin
  begin
    -- fixtures: item com preco 5,00, custo 2,00 e 10 em estoque; cliente
    insert into catalog_items (tenant_id, sku, name)
    values (v_tenant, 'SMOKE-0054-' || left(gen_random_uuid()::text, 8), 'Smoke 0054')
    returning id into v_item;
    insert into item_prices (item_id, channel, price) values (v_item, 'varejo', 5.00);
    insert into item_commercial_data (item_id, cost_price) values (v_item, 2.00)
      on conflict (item_id) do update set cost_price = 2.00;
    insert into item_stock (item_id, tenant_id, stock_on_hand, stock_available)
    values (v_item, v_tenant, 10, 10)
      on conflict (item_id) do update set stock_on_hand = 10, stock_available = 10;
    insert into customers (tenant_id, name, email)
    values (v_tenant, 'Smoke 0054',
            'smoke-0054-' || left(gen_random_uuid()::text, 8) || '@example.invalid')
    returning id into v_cli;

    -- ================= A: pix 2 x 5,00 = 10,00 =================
    v_sale := manual_register_sale(
      jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 2)),
      'pix', 'varejo', 1, 0, v_cli, null, null, 'smoke-0054-a-' || gen_random_uuid());
    v_order := (v_sale->>'order_id')::uuid;
    set constraints all immediate; set constraints all deferred;   -- "commit" da venda: diario lancado

    select stock_on_hand into v_n from item_stock where item_id = v_item;
    v_res := v_res || jsonb_build_object('t', 'A venda baixou estoque 10->8', 'ok', v_n = 8, 'd', v_n);

    begin
      perform sale_cancel(v_order, 'abc', null);
      v_res := v_res || jsonb_build_object('t', 'A motivo curto recusado', 'ok', false, 'd', 'passou');
    exception when others then
      v_res := v_res || jsonb_build_object('t', 'A motivo curto recusado',
        'ok', sqlerrm like 'MOTIVO_INVALIDO%', 'd', sqlerrm);
    end;

    v_ret := sale_cancel(v_order, 'cliente desistiu (smoke)', null);
    set constraints all immediate; set constraints all deferred;   -- "commit" do cancelamento
    v_res := v_res || jsonb_build_object('t', 'A retorno 1 estorno de 10,00',
      'ok', (v_ret->>'estornos')::int = 1 and (v_ret->>'valor_estornado')::numeric = 10,
      'd', v_ret);

    select stock_on_hand into v_n from item_stock where item_id = v_item;
    v_res := v_res || jsonb_build_object('t', 'A estoque voltou a 10', 'ok', v_n = 10, 'd', v_n);

    select status || '|' || (cancelado_em is not null) || '|' || coalesce(cancelado_motivo, '-')
      into v_txt from orders where id = v_order;
    v_res := v_res || jsonb_build_object('t', 'A pedido cancelado com data e motivo',
      'ok', v_txt = 'cancelado|true|cliente desistiu (smoke)', 'd', v_txt);

    select count(*) filter (where t.status <> 'cancelado') into v_n
      from financial_titles t where t.source_id = v_order;
    select count(*) filter (where i.status <> 'cancelado' or i.paid_amount <> 0) into v_m
      from financial_installments i join financial_titles t on t.id = i.title_id
     where t.source_id = v_order;
    v_res := v_res || jsonb_build_object('t', 'A titulo e parcela cancelados (pago 0)',
      'ok', v_n = 0 and v_m = 0, 'd', v_n || '/' || v_m);

    select count(*) into v_n
      from journal_entries e
     where e.tenant_id = v_tenant
       and (e.idempotency_key in ('venda:' || v_order, 'venda-estorno:' || v_order)
            or e.idempotency_key in (
              select 'titulo-' || s.type || ':' || s.id
                from financial_settlements s
                join financial_installments i on i.id = s.installment_id
                join financial_titles t on t.id = i.title_id
               where t.source_id = v_order));
    select coalesce(sum(abs(x)), 0) into v_m from (
      select l.code, sum(l.debit - l.credit) as x
        from journal_entry_lines l
        join journal_entries e on e.id = l.entry_id
       where e.tenant_id = v_tenant
         and (e.idempotency_key in ('venda:' || v_order, 'venda-estorno:' || v_order)
              or e.idempotency_key in (
                select 'titulo-' || s.type || ':' || s.id
                  from financial_settlements s
                  join financial_installments i on i.id = s.installment_id
                  join financial_titles t on t.id = i.title_id
                 where t.source_id = v_order))
       group by l.code) z;
    v_res := v_res || jsonb_build_object('t', 'A diario: 4 lancamentos e saldo 0 por conta',
      'ok', v_n = 4 and v_m = 0, 'd', v_n || ' lanc / residuo ' || v_m);

    select count(*) into v_n from audit_log
     where entity = 'orders' and entity_id = v_order and action = 'venda.cancelar';
    v_res := v_res || jsonb_build_object('t', 'A audit venda.cancelar', 'ok', v_n = 1, 'd', v_n);

    -- ================= A2: cancelar de novo =================
    v_ret := sale_cancel(v_order, 'segunda vez (smoke)', null);
    select stock_on_hand into v_n from item_stock where item_id = v_item;
    select count(*) into v_m
      from financial_settlements s
      join financial_installments i on i.id = s.installment_id
      join financial_titles t on t.id = i.title_id
     where t.source_id = v_order and s.type = 'estorno';
    v_res := v_res || jsonb_build_object('t', 'A2 repetir nao duplica (estorno 1, estoque 10)',
      'ok', (v_ret->>'ja_cancelada')::boolean and (v_ret->>'estornos')::int = 0
            and (v_ret->>'estoque_devolvido')::int = 0 and v_n = 10 and v_m = 1,
      'd', v_ret);

    -- ================= B: fiado 2x com entrega =================
    v_sale := manual_register_sale(
      jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 1)),
      'fiado', 'varejo', 2, 0, v_cli, null, v_end, 'smoke-0054-b-' || gen_random_uuid());
    v_order := (v_sale->>'order_id')::uuid;
    v_ent := (v_sale->>'entrega_id')::uuid;
    set constraints all immediate; set constraints all deferred;

    v_ret := sale_cancel(v_order, 'endereco errado (smoke)', null);
    set constraints all immediate; set constraints all deferred;   -- "commit" do cancelamento
    select status into v_txt from entregas where id = v_ent;
    select count(*) into v_n from entrega_eventos
     where entrega_id = v_ent and para_status = 'devolvido';
    v_res := v_res || jsonb_build_object('t', 'B entrega devolvida com evento',
      'ok', v_txt = 'devolvido' and v_n = 1 and v_ret->>'entrega' = 'devolvido',
      'd', v_txt || '/' || v_n);
    v_res := v_res || jsonb_build_object('t', 'B 2 parcelas canceladas, sem estorno',
      'ok', (v_ret->>'parcelas_canceladas')::int = 2 and (v_ret->>'estornos')::int = 0,
      'd', v_ret);

    select coalesce(sum(abs(x)), 0) into v_m from (
      select l.code, sum(l.debit - l.credit) as x
        from journal_entry_lines l
        join journal_entries e on e.id = l.entry_id
       where e.tenant_id = v_tenant
         and e.idempotency_key in ('venda:' || v_order, 'venda-estorno:' || v_order)
       group by l.code) z;
    v_res := v_res || jsonb_build_object('t', 'B diario saldo 0 por conta', 'ok', v_m = 0, 'd', v_m);

    -- ================= C: entrega em transito =================
    v_sale := manual_register_sale(
      jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 1)),
      'fiado', 'varejo', 1, 0, v_cli, null, v_end, 'smoke-0054-c-' || gen_random_uuid());
    v_order := (v_sale->>'order_id')::uuid;
    update entregas set status = 'em_transito' where id = (v_sale->>'entrega_id')::uuid;
    begin
      perform sale_cancel(v_order, 'tarde demais (smoke)', null);
      v_res := v_res || jsonb_build_object('t', 'C em transito recusa', 'ok', false, 'd', 'passou');
    exception when others then
      v_res := v_res || jsonb_build_object('t', 'C em transito recusa',
        'ok', sqlerrm like 'ENTREGA_EM_TRANSITO%', 'd', sqlerrm);
    end;
    select status into v_txt from orders where id = v_order;
    v_res := v_res || jsonb_build_object('t', 'C pedido segue pago', 'ok', v_txt = 'pago', 'd', v_txt);

    -- ================= D: NF-e pendente =================
    v_sale := manual_register_sale(
      jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 1)),
      'pix', 'varejo', 1, 0, v_cli, null, null, 'smoke-0054-d-' || gen_random_uuid());
    v_order := (v_sale->>'order_id')::uuid;
    insert into nfe_emissoes (tenant_id, order_id, numero, serie, status)
    values (v_tenant, v_order, 900000000 + floor(random() * 99999999)::bigint, 9, 'pendente');
    begin
      perform sale_cancel(v_order, 'tem nota (smoke)', null);
      v_res := v_res || jsonb_build_object('t', 'D NF-e ativa recusa', 'ok', false, 'd', 'passou');
    exception when others then
      v_res := v_res || jsonb_build_object('t', 'D NF-e ativa recusa',
        'ok', sqlerrm like 'NOTA_FISCAL_ATIVA%', 'd', sqlerrm);
    end;

    -- ================= E: reparo (formato da V-4268) =================
    v_sale := manual_register_sale(
      jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 1)),
      'pix', 'varejo', 1, 0, v_cli, null, null, 'smoke-0054-e-' || gen_random_uuid());
    v_order := (v_sale->>'order_id')::uuid;
    set constraints all immediate; set constraints all deferred;
    update orders set status = 'cancelado' where id = v_order;   -- como foi feito na V-4268
    set constraints all immediate; set constraints all deferred;

    select coalesce(sum(l.debit - l.credit), 0) into v_n
      from journal_entry_lines l
      join journal_entries e on e.id = l.entry_id
     where e.tenant_id = v_tenant and l.code = '1.1.1'
       and e.idempotency_key in (
         select 'titulo-' || s.type || ':' || s.id
           from financial_settlements s
           join financial_installments i on i.id = s.installment_id
           join financial_titles t on t.id = i.title_id
          where t.source_id = v_order);
    v_res := v_res || jsonb_build_object('t', 'E antes do reparo: caixa +5,00 (o bug)',
      'ok', v_n = 5, 'd', v_n);

    v_ret := sale_cancel(v_order, 'reparo do cancelamento sem estorno (smoke)', null);
    set constraints all immediate; set constraints all deferred;   -- "commit" do cancelamento
    select coalesce(sum(l.debit - l.credit), 0) into v_n
      from journal_entry_lines l
      join journal_entries e on e.id = l.entry_id
     where e.tenant_id = v_tenant and l.code = '1.1.1'
       and e.idempotency_key in (
         select 'titulo-' || s.type || ':' || s.id
           from financial_settlements s
           join financial_installments i on i.id = s.installment_id
           join financial_titles t on t.id = i.title_id
          where t.source_id = v_order);
    select stock_on_hand into v_m from item_stock where item_id = v_item;
    select (cancelado_em is not null)::text into v_txt from orders where id = v_order;
    v_res := v_res || jsonb_build_object('t', 'E depois do reparo: caixa 0, estoque de volta, data',
      'ok', (v_ret->>'ja_cancelada')::boolean and (v_ret->>'estornos')::int = 1
            and v_n = 0 and v_txt = 'true',
      'd', 'caixa ' || v_n || ' / estoque ' || v_m || ' / ' || v_ret);

    -- estoque final: 10 - 2(A) + 2 - 1(B) + 1 - 1(C) - 1(D) - 1(E) + 1 = 8
    v_res := v_res || jsonb_build_object('t', 'estoque final 8 (C e D seguem vendidas)',
      'ok', v_m = 8, 'd', v_m);

    raise exception 'SMOKE_0054_ROLLBACK';
  exception when others then
    if sqlerrm <> 'SMOKE_0054_ROLLBACK' then
      v_res := v_res || jsonb_build_object('t', 'ERRO INESPERADO', 'ok', false, 'd', sqlerrm);
    end if;
  end;

  insert into _out_0054 (teste, ok, detalhe)
  select e->>'t', (e->>'ok')::boolean, e->>'d'
    from jsonb_array_elements(v_res) as e;
end $$;

select teste, ok, detalhe from _out_0054
union all
select 'FALHAS', count(*) = 0 and (select count(*) from _out_0054) >= 18, null
  from _out_0054 where not ok;
