-- 0022_lancamentos_automaticos.sql - Bloco 2, passo 2.
--
-- A 0021 criou o plano de contas, o diario de dupla entrada, a competencia e a
-- view v_dre - mas nada fluia para dentro delas. Este arquivo liga o diario aos
-- tres eventos que JA existem na operacao, sem tocar em nenhuma regra de negocio:
--
--   orders.status = 'pago'      -> receita + CMV      (chave `venda:<pedido>`)
--   orders.status = 'cancelado' -> estorno da venda   (chave `venda-estorno:<pedido>`)
--   purchase_receipts           -> estoque x fornecedor (chave `compra:<recebimento>`)
--   financial_settlements       -> caixa x titulo      (chave `titulo-<tipo>:<liquidacao>`)
--
-- POR QUE O GATILHO E ADIADO (deferrable initially deferred):
--   `pdv_register_sale` insere o pedido com total_amount = 0 e so grava o valor
--   real em seguida (0015:293), e o titulo do credito so nasce em 0015:311.
--   Um trigger IMEDIATO veria total 0 e nao veria o titulo - e entraria caixa
--   errado (dobra de dinheiro quando a liquidacao vier). Adiado roda no COMMIT,
--   com a linha ja final. Por isso as funcoes RELEEM a linha da tabela em vez
--   de confiar no registro do gatilho.
--
-- REGRA ANTI-DOBRA (mapa do ciclo de vida real, com arquivo:linha):
--   * venda PDV dinheiro/debito/pix -> NAO gera titulo, so caixa_movements
--     (0015:296-303). O diario debita CAIXA e nunca toca em caixa_movements.
--   * venda PDV cartao              -> gera titulo receivable + parcelas
--     (0015:305-329). O diario debita CONTAS A RECEBER; a liquidacao posterior
--     e que leva o dinheiro ao caixa.
--   * venda loja (web)              -> nao gera titulo nem caixa_movements
--     (so orders/order_items); vira caixa quando o webhook do MP marca 'pago'.
--   * compra                        -> titulo payable dentro do purchase_receive
--     (0017:529) junto com a entrada de estoque (0017:419).
--   Ou seja: em nenhum evento os dois lados sao lancados.
--
-- CMV: custo medio corrente (`item_commercial_data.cost_price`, reescrito por
-- 0017:483-494) multiplicado pela quantidade. Item sem item_id ou sem custo nao
-- entra - mesmo criterio do card de margem do financeiro.
--
-- ESTORNO: quando o pedido vai para 'cancelado' E ja existir lancamento de venda,
-- cria-se o lancamento inverso com competencia NA DATA DO CANCELAMENTO (nao na
-- da venda): o periodo em que se tomou conhecimento e o periodo que muda.
--
-- DESPESAS FIXAS: a tabela `expenses` da 0021 continua sem gatilho de proposito
-- - nao existe tela de despesas ainda, e lancar o que ninguem cadastrou so
-- encheria o diario de vazio. O gatilho vem junto com a tela.
--
-- Idioma: comentarios em ASCII puro (mesmo motivo da 0021).

-- ---------------------------------------------------------------------
-- 1. Venda faturada / venda cancelada
-- ---------------------------------------------------------------------
create or replace function post_order_accounting(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o           record;
  v_receita   numeric;
  v_cmv       numeric := 0;
  v_dinheiro  text;
  v_lines     jsonb;
  v_desc      text;
begin
  select id, tenant_id, status, total_amount, origem,
         coalesce(venda_numero, pedido_numero, left(id::text, 8)) as numero,
         created_at::date as emitido
    into o
    from orders
   where id = p_order;

  if not found then return; end if;

  if o.status = 'pago' then
    if o.total_amount is null or o.total_amount <= 0 then return; end if;

    perform seed_chart_of_accounts(o.tenant_id);

    if exists (select 1 from journal_entries
                where tenant_id = o.tenant_id
                  and idempotency_key = 'venda:' || o.id) then
      return;
    end if;

    -- titulo receivable do pedido => a receita fica a receber; sem titulo
    -- (dinheiro, debito, pix ou loja) => entra direto no caixa.
    select case when exists (
             select 1 from financial_titles t
              where t.tenant_id = o.tenant_id
                and t.direction = 'receivable'
                and t.source_id = o.id
           ) then '1.1.2' else '1.1.1' end
      into v_dinheiro;

    select coalesce(sum(oi.quantity * icd.cost_price), 0)
      into v_cmv
      from order_items oi
      join item_commercial_data icd on icd.item_id = oi.item_id
     where oi.order_id = o.id
       and oi.tenant_id = o.tenant_id;

    v_lines := jsonb_build_array(
      jsonb_build_object('code', v_dinheiro,        'debit', o.total_amount, 'credit', 0),
      jsonb_build_object('code', '4.1.1',           'debit', 0,              'credit', o.total_amount)
    );
    if v_cmv > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('code', '5.1.1', 'debit', v_cmv, 'credit', 0),
        jsonb_build_object('code', '1.1.3', 'debit', 0,     'credit', v_cmv)
      );
    end if;

    v_desc := 'Venda ' || o.origem || ' ' || o.numero;

    perform journal_post(
      p_tenant       => o.tenant_id,
      p_competencia  => o.emitido,
      p_source_type  => 'venda',
      p_source_id    => o.id,
      p_description  => v_desc,
      p_document     => null,
      p_cost_center  => null,
      p_lines        => v_lines,
      p_idem         => 'venda:' || o.id
    );
    return;
  end if;

  if o.status = 'cancelado' then
    -- cancelamento de pedido que nunca faturou (aguardando_pagamento) nao tem
    -- nada a estornar.
    if not exists (select 1 from journal_entries
                    where tenant_id = o.tenant_id
                      and idempotency_key = 'venda:' || o.id) then
      return;
    end if;
    if exists (select 1 from journal_entries
                where tenant_id = o.tenant_id
                  and idempotency_key = 'venda-estorno:' || o.id) then
      return;
    end if;
    if o.total_amount is null or o.total_amount <= 0 then return; end if;

    perform seed_chart_of_accounts(o.tenant_id);

    select case when exists (
             select 1 from financial_titles t
              where t.tenant_id = o.tenant_id
                and t.direction = 'receivable'
                and t.source_id = o.id
           ) then '1.1.2' else '1.1.1' end
      into v_dinheiro;

    select coalesce(sum(oi.quantity * icd.cost_price), 0)
      into v_cmv
      from order_items oi
      join item_commercial_data icd on icd.item_id = oi.item_id
     where oi.order_id = o.id
       and oi.tenant_id = o.tenant_id;

    v_lines := jsonb_build_array(
      jsonb_build_object('code', v_dinheiro, 'debit', 0,                'credit', o.total_amount),
      jsonb_build_object('code', '4.1.1',    'debit', o.total_amount,   'credit', 0)
    );
    if v_cmv > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('code', '5.1.1', 'debit', 0,     'credit', v_cmv),
        jsonb_build_object('code', '1.1.3', 'debit', v_cmv, 'credit', 0)
      );
    end if;

    perform journal_post(
      p_tenant       => o.tenant_id,
      p_competencia  => current_date,
      p_source_type  => 'ajuste',
      p_source_id    => o.id,
      p_description  => 'Estorno da venda ' || o.origem || ' ' || o.numero,
      p_document     => null,
      p_cost_center  => null,
      p_lines        => v_lines,
      p_idem         => 'venda-estorno:' || o.id
    );
  end if;
end $$;

create or replace function trg_post_order() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform post_order_accounting(case when tg_op = 'DELETE' then old.id else new.id end);
  return null;
end $$;

-- NAO registrar `after delete`: a exclusao em cascata de um pedido (ou de um
-- tenant) precisaria passar pelo diario, que e imutavel, e derrubaria a operacao.
create constraint trigger trg_post_order_accounting
  after insert or update on orders
  deferrable initially deferred
  for each row execute function trg_post_order();

-- ---------------------------------------------------------------------
-- 2. Recebimento de compra -> estoque x fornecedor
-- ---------------------------------------------------------------------
create or replace function post_purchase_receipt_accounting(p_receipt uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_lines jsonb;
begin
  -- rele e o status/total FINAIS: o `update total` do purchase_receive
  -- (0017:428) acontece depois do insert.
  select id, tenant_id, status, total, code, received_at::date as recebido
    into r
    from purchase_receipts
   where id = p_receipt;

  if not found then return; end if;
  if r.status is distinct from 'postado' then return; end if;
  if r.total is null or r.total <= 0 then return; end if;

  perform seed_chart_of_accounts(r.tenant_id);

  if exists (select 1 from journal_entries
              where tenant_id = r.tenant_id
                and idempotency_key = 'compra:' || r.id) then
    return;
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('code', '1.1.3', 'debit', r.total, 'credit', 0),
    jsonb_build_object('code', '2.1.1', 'debit', 0,       'credit', r.total)
  );

  perform journal_post(
    p_tenant       => r.tenant_id,
    p_competencia  => r.recebido,
    p_source_type  => 'compra',
    p_source_id    => r.id,
    p_description  => 'Recebimento da compra ' || r.code,
    p_document     => r.code,
    p_cost_center  => null,
    p_lines        => v_lines,
    p_idem         => 'compra:' || r.id
  );
end $$;

create or replace function trg_post_receipt() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform post_purchase_receipt_accounting(case when tg_op = 'DELETE' then old.id else new.id end);
  return null;
end $$;

create constraint trigger trg_post_receipt_accounting
  after insert or update on purchase_receipts
  deferrable initially deferred
  for each row execute function trg_post_receipt();

-- ---------------------------------------------------------------------
-- 3. Liquidacao de titulo -> caixa x titulo (e o inverso no estorno)
-- ---------------------------------------------------------------------
create or replace function post_settlement_accounting(p_settlement uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s        record;
  v_dir    text;
  v_origem text;
  v_lines  jsonb;
begin
  select id, tenant_id, type, amount, installment_id, created_at::date as liquidado
    into s
    from financial_settlements
   where id = p_settlement;

  if not found then return; end if;
  if s.amount is null or s.amount <= 0 then return; end if;

  select t.direction
    into v_dir
    from financial_installments i
    join financial_titles t on t.id = i.title_id
   where i.id = s.installment_id;

  if v_dir is null then return; end if;

  perform seed_chart_of_accounts(s.tenant_id);

  if s.type = 'estorno' then
    v_origem := 'ajuste';
  elsif v_dir = 'receivable' then
    v_origem := 'recebimento';
  else
    v_origem := 'pagamento';
  end if;

  if exists (select 1 from journal_entries
              where tenant_id = s.tenant_id
                and idempotency_key = 'titulo-' || coalesce(s.type, 'liquidacao') || ':' || s.id) then
    return;
  end if;

  if v_dir = 'receivable' then
    if coalesce(s.type, 'liquidacao') = 'estorno' then
      v_lines := jsonb_build_array(
        jsonb_build_object('code', '1.1.2', 'debit', s.amount, 'credit', 0),
        jsonb_build_object('code', '1.1.1', 'debit', 0,        'credit', s.amount)
      );
    else
      v_lines := jsonb_build_array(
        jsonb_build_object('code', '1.1.1', 'debit', s.amount, 'credit', 0),
        jsonb_build_object('code', '1.1.2', 'debit', 0,        'credit', s.amount)
      );
    end if;
  else
    if coalesce(s.type, 'liquidacao') = 'estorno' then
      v_lines := jsonb_build_array(
        jsonb_build_object('code', '1.1.1', 'debit', s.amount, 'credit', 0),
        jsonb_build_object('code', '2.1.1', 'debit', 0,        'credit', s.amount)
      );
    else
      v_lines := jsonb_build_array(
        jsonb_build_object('code', '2.1.1', 'debit', s.amount, 'credit', 0),
        jsonb_build_object('code', '1.1.1', 'debit', 0,        'credit', s.amount)
      );
    end if;
  end if;

  perform journal_post(
    p_tenant       => s.tenant_id,
    p_competencia  => s.liquidado,
    p_source_type  => v_origem,
    p_source_id    => s.id,
    p_description  => 'Liquidacao da parcela do titulo',
    p_document     => null,
    p_cost_center  => null,
    p_lines        => v_lines,
    p_idem         => 'titulo-' || coalesce(s.type, 'liquidacao') || ':' || s.id
  );
end $$;

create or replace function trg_post_settlement() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform post_settlement_accounting(new.id);
  return null;
end $$;

create constraint trigger trg_post_settlement_accounting
  after insert on financial_settlements
  deferrable initially deferred
  for each row execute function trg_post_settlement();

-- ---------------------------------------------------------------------
-- 4. Toda conta usada em lancamento precisa ser FOLHA do plano.
--    journal_post() valida balanco, idempotencia e habilitacao do tenant, mas
--    nao impedia lancar numa conta de grupo (ex.: 4.1 "Receita Bruta" em vez de
--    4.1.1) - o que faria a DRE duplar a linha do grupo. Regra no banco, nao na
--    disciplina de quem chama.
-- ---------------------------------------------------------------------
create or replace function journal_line_leaf_check() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v boolean;
begin
  select aceita_lancamento into v
    from account_catalog
   where code = new.code;
  if v is distinct from true then
    raise exception 'DIARIO_CONTA_NAO_FOLHA: % nao aceita lancamento direto', new.code;
  end if;
  return new;
end $$;

create trigger trg_journal_line_leaf
  before insert on journal_entry_lines
  for each row execute function journal_line_leaf_check();

-- ---------------------------------------------------------------------
-- 5. Privilegios: as tres funcoes sao SECURITY DEFINER com um id como entrada.
--    Disparadas por trigger (a checagem de EXECUTE e na criacao do gatilho),
--    entao revogar de public/anon/authenticated nao quebra a operacao e impede
--    que um cliente poste lancamento por chamada direta.
-- ---------------------------------------------------------------------
revoke execute on function post_order_accounting(uuid) from public, anon, authenticated;
revoke execute on function post_purchase_receipt_accounting(uuid) from public, anon, authenticated;
revoke execute on function post_settlement_accounting(uuid) from public, anon, authenticated;
grant  execute on function post_order_accounting(uuid) to service_role;
grant  execute on function post_purchase_receipt_accounting(uuid) to service_role;
grant  execute on function post_settlement_accounting(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 6. Backfill (idempotente: as chaves de idempotencia ja existentes impedem
--    duplicidade, entao rodar de novo nao lanca nada a mais).
--    Em producao na data desta migration: 3 pedidos, 0 'pago', 0 recebimentos,
--    0 liquidacoes - ou seja, quase vazio, mas o codigo fica pronto para o
--    historico que vier depois.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select id from orders where status in ('pago', 'cancelado') loop
    perform post_order_accounting(r.id);
  end loop;
  for r in select id from purchase_receipts loop
    perform post_purchase_receipt_accounting(r.id);
  end loop;
  for r in select id from financial_settlements loop
    perform post_settlement_accounting(r.id);
  end loop;
end $$;
