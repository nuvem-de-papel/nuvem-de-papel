-- 0023_despesas_no_diario.sql - Bloco 2, passo 3 (completude do faturamento).
--
-- DUAS correcoes que a producao real expôs ao rodar o 0022 contra dados
-- existentes:
--
-- A) REGRAS DE FATURAMENTO ESTAVAM PELO CAMINHO INICIAL DEMASIADO ESTREITO.
--    O 0022 s� lancava quando status = 'pago'. Mas o caminho desenhado no
--    0007 (enforce_orders_transition) s� permite ir de 'aguardando_pagamento'
--    para 'pago'; logo todo pedido que ESTA em 'processando'/'em_rota'/
--    'entregue' ou faturou ou nasceu confirmado. E nasce confirmado: a coluna
--    orders.origem TEM DEFAULT 'erp' (informacao_schema), ou seja, qualquer
--    integracao/legado que insira sem setar origem entra direto em
--    'processando' sem nunca passar por 'pago' - e esses pedidos ficavam de
--    fora do diario para sempre. Em producao, 2 dos 3 pedidos eram exatamente
--    isso (origem=erp, status=processando, 89,90 + 49,90) e nenhum aparecia
--    no DRE.
--    A regra vira: FATURADO = tudo que nao e 'aguardando_pagamento' nem
--    'cancelado'. 'aguardando_pagamento' continua de fora (nao e receita) e
--    'cancelado' continua sendo estorno.
--    Nada muda no idempotencia: a chave continua sendo `venda:<pedido>`, entao
--    pagar depois de ja faturado nao duplica.
--
-- B) `expenses` NASCEU NA 0021 COM FORMA E SEM MOVIMENTO. Sem gatilho, a
--    tabela ficava muda e o DRE mostrava despesa zerada - o bloco 2 ja tinha
--    sido delegado com "DRE completo (receita -> deducoes -> CMV -> despesas ->
--    EBITDA -> LAIR -> IR)". Agora toda despesa gravada vira lancamento:
--        D conta da despesa (expenses.account_code)  C caixa ou a pagar
--    Competencia vem da propria linha (`expenses.competencia`), nao da data de
--    gravacao - e o que mantem o DRE honesto quando a despesa e lancada fora
--    de mes.
--    CREDITO: pago (paid_at preenchido) -> 1.1.1 Caixa; em aberto -> 2.1.1.
--    O grafico de contas nao tem "despesas a pagar" proprio (2.1.x sao
--    fornecedor/trabalhista/tributo), e adicionar conta mudaria o invariante
--    60 contas / 39 folhas que a 0021 testa - entao o credito em aberto vai
--    para o pagavel generico 2.1.1, com isso registrado. Quando o plano ganhar
--    a conta propria, troca-se uma linha aqui.
--
-- Idioma: comentarios em ASCII puro (mesmo motivo da 0021).

-- ---------------------------------------------------------------------
-- 1. Faturamento ampliado (mesma estrutura da 0022, so muda a condicao)
-- ---------------------------------------------------------------------
create or replace function post_order_accounting(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o           record;
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

  -- pedido que so espera pagamento nao e receita de nada
  if o.status = 'aguardando_pagamento' then
    return;
  end if;

  if o.status = 'cancelado' then
    -- cancelamento de pedido que nunca faturou nao tem nada a estornar.
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
      jsonb_build_object('code', v_dinheiro, 'debit', 0,              'credit', o.total_amount),
      jsonb_build_object('code', '4.1.1',    'debit', o.total_amount, 'credit', 0)
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
    return;
  end if;

  -- faturado: pago, processando, em_rota ou entregue
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
    jsonb_build_object('code', v_dinheiro, 'debit', o.total_amount, 'credit', 0),
    jsonb_build_object('code', '4.1.1',    'debit', 0,              'credit', o.total_amount)
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
end $$;

-- ---------------------------------------------------------------------
-- 2. Despesa fixa -> diario
-- ---------------------------------------------------------------------
create or replace function post_expense_accounting(p_expense uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_lines jsonb;
begin
  -- rele a linha atual: o gatilho e adiado e `amount`/`paid_at` podem ter
  -- mudado depois do insert.
  select id, tenant_id, competencia, description, account_code,
         cost_center_id, amount, paid_at
    into r
    from expenses
   where id = p_expense;

  if not found then return; end if;
  if r.amount is null or r.amount <= 0 then return; end if;

  -- conta folha, nao de grupo: mesma trava do diario, mas aqui para dar um
  -- erro claro em quem digita codigo errado em vez de estourar na escrita.
  if not exists (select 1 from account_catalog
                  where code = r.account_code and aceita_lancamento) then
    raise exception 'DESPESA_CONTA_NAO_FOLHA: % nao e conta folha do plano', r.account_code;
  end if;

  perform seed_chart_of_accounts(r.tenant_id);

  if exists (select 1 from journal_entries
              where tenant_id = r.tenant_id
                and idempotency_key = 'despesa:' || r.id) then
    return;
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('code', r.account_code,
                       'debit', r.amount, 'credit', 0),
    jsonb_build_object('code', case when r.paid_at is null then '2.1.1' else '1.1.1' end,
                       'debit', 0, 'credit', r.amount)
  );

  perform journal_post(
    p_tenant       => r.tenant_id,
    p_competencia  => r.competencia,
    p_source_type  => 'despesa',
    p_source_id    => r.id,
    p_description  => 'Despesa: ' || r.description,
    p_document     => null,
    p_cost_center  => r.cost_center_id,
    p_lines        => v_lines,
    p_idem         => 'despesa:' || r.id
  );
end $$;

create or replace function trg_post_expense() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform post_expense_accounting(case when tg_op = 'DELETE' then old.id else new.id end);
  return null;
end $$;

-- sem `after delete`: excluir despesa em cascata nao pode derrubar a operacao
-- no diario imutavel (mesma razao da 0022).
create constraint trigger trg_post_expense_accounting
  after insert or update on expenses
  deferrable initially deferred
  for each row execute function trg_post_expense();

-- ---------------------------------------------------------------------
-- 3. Privilegios (mesmo desenho da 0022: so o gatilho chama)
-- ---------------------------------------------------------------------
revoke execute on function post_expense_accounting(uuid) from public, anon, authenticated;
grant  execute on function post_expense_accounting(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 4. Backfill idempotente
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select id from orders
            where status not in ('aguardando_pagamento', 'cancelado') loop
    perform post_order_accounting(r.id);
  end loop;
  for r in select id from orders where status = 'cancelado' loop
    perform post_order_accounting(r.id);
  end loop;
  for r in select id from expenses loop
    perform post_expense_accounting(r.id);
  end loop;
end $$;
