-- 0017_compras_v1.sql - Modulo Compras v1 (modulo-compras.md v1.0, 02/10/2026).
-- Contexto (roadmap F6/Compras):
--   * fornecedor ganha dados fiscais (IE/UF/pais): PC-02 nacional exige CNPJ
--     e a nota se vincula por ele; importacao aceita CNPJ null;
--   * purchase_orders ganha origem/tipo/condicao/frete/desconto e as
--     marcadoras de ciclo (conferido_em/concluida_em/cancelada_em) das etapas
--     5.7; entrada direta entra como tipo='entrada_direta' (codigo EN-8hex);
--     codigo PC-8hex continua intocado (E2E f6);
--   * itens ganham qtd_recebida (conferencia RC-04) e custo_final (rateio da
--     5.2); PC-05 (mesmo produto soma na linha) vira indice unico;
--   * item_commercial_data ganha fob_price (PC-04 preco_fob) e cost_price
--     sobe para numeric(12,4) (custo medio com precisao de moeda);
--   * tabelas novas: compra_importacao (1:1, PTAX editavel + aliquotas),
--     nfe_recebidas (DF-e contra o CNPJ da loja, NE-01/NE-02),
--     notas_entrada (vinculo NE-03..NE-05 + NI-04 com CFOP 1102/2102/3102),
--     compra_transporte(+eventos) (5.5, sequencias nacional/importacao),
--     compra_envios (PC-07 PDF ao fornecedor), supplier_item_map (NE-09
--     de-para codigo do fornecedor);
--   * titulos a pagar continuam em financial_titles/financial_installments
--     (fonte unica do /financeiro): purchase_receive passa a gerar N parcelas
--     pela condicao do PO (default '28 dias' = 1x, mantem o I5 do f6);
--   * purchase_receive: rateio de custo_final (nacional e importacao - formula
--     da 5.2 com TODO de contabilidade), qtd_recebida, custo_medio ponderado,
--     concluida_em e p_conferido (RC-05: exige nota ok quando a conferencia
--     do console conclui; portal do fornecedor nao muda - default false);
--   * RLS: deny-all de escrita + leitura de gestao (master|gerente), mesma
--     formula da 0009 (console de compras e /portal sao os leitores).
-- Regra 2: todo dado carrega tenant_id. begin/commit igual ao 0009-0016.

begin;

-- ---------------------------------------------------------- fornecedor -----
alter table suppliers
  add column if not exists ie text,
  add column if not exists uf char(2),
  add column if not exists pais text not null default 'Brasil';

alter table suppliers drop constraint if exists suppliers_uf_check;
alter table suppliers add constraint suppliers_uf_check
  check (uf is null or uf ~ '^[A-Z]{2}$');

-- ------------------------------------------------------------- pedido ------
alter table purchase_orders
  add column if not exists origem text not null default 'nacional',
  add column if not exists tipo text not null default 'pedido',
  add column if not exists frete numeric(12,2) not null default 0
    check (frete >= 0),
  add column if not exists desconto numeric(12,2) not null default 0
    check (desconto >= 0),
  add column if not exists condicao text not null default '28 dias',
  add column if not exists conferido_em timestamptz,
  add column if not exists concluida_em timestamptz,
  add column if not exists cancelada_em timestamptz;

alter table purchase_orders drop constraint if exists purchase_orders_origem_check;
alter table purchase_orders add constraint purchase_orders_origem_check
  check (origem in ('nacional', 'importacao'));

alter table purchase_orders drop constraint if exists purchase_orders_tipo_check;
alter table purchase_orders add constraint purchase_orders_tipo_check
  check (tipo in ('pedido', 'entrada_direta'));

alter table purchase_orders drop constraint if exists purchase_orders_condicao_check;
alter table purchase_orders add constraint purchase_orders_condicao_check
  check (condicao in ('À vista', '28 dias', '30/60', '30/60/90'));

-- -------------------------------------------------------------- itens ------
alter table purchase_order_items
  add column if not exists qtd_recebida integer not null default 0
    check (qtd_recebida >= 0),
  add column if not exists custo_final numeric(12,4);

create unique index if not exists purchase_order_items_po_item_key
  on purchase_order_items (purchase_order_id, item_id);

-- custo medio (RC-06) e preco fob do fornecedor estrangeiro (PC-04)
alter table item_commercial_data
  alter column cost_price type numeric(12,4),
  add column if not exists fob_price numeric(12,4);

-- -------------------------------------------------------- compra_importacao -
create table if not exists compra_importacao (
  purchase_order_id uuid primary key references purchase_orders(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  moeda text not null default 'USD'
    check (moeda in ('USD', 'EUR', 'JPY', 'CNY')),
  cambio numeric(12,4) not null check (cambio > 0),
  di text,
  frete_int numeric(12,2) not null default 0 check (frete_int >= 0),
  seguro numeric(12,2) not null default 0 check (seguro >= 0),
  aliq_ii numeric(5,2) not null default 0
    check (aliq_ii >= 0 and aliq_ii <= 100),
  aliq_ipi numeric(5,2) not null default 0
    check (aliq_ipi >= 0 and aliq_ipi <= 100),
  aliq_pis numeric(5,2) not null default 2.10
    check (aliq_pis >= 0 and aliq_pis <= 100),
  aliq_cofins numeric(5,2) not null default 9.65
    check (aliq_cofins >= 0 and aliq_cofins <= 100),
  aliq_icms numeric(5,2) not null default 0
    check (aliq_icms >= 0 and aliq_icms < 100),
  despesas numeric(12,2) not null default 0 check (despesas >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------- nfe_recebidas ---
create table if not exists nfe_recebidas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  chave char(44) not null,
  numero text not null,
  serie text not null,
  emitente_cnpj text not null,
  emitente_nome text not null,
  emitente_uf char(2),
  emitida_em timestamptz not null,
  valor_total numeric(12,2) not null check (valor_total >= 0),
  xml_url text,
  itens jsonb,
  manifestacao text not null default 'pendente'
    check (manifestacao in ('pendente', 'ciencia', 'confirmada',
                            'desconhecida', 'nao_realizada')),
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  baixada_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, chave)
);

create index if not exists idx_nfe_recebidas_pendentes
  on nfe_recebidas (tenant_id, manifestacao, emitida_em desc);

-- ---------------------------------------------------------- notas_entrada --
create table if not exists notas_entrada (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  purchase_order_id uuid not null unique references purchase_orders(id) on delete cascade,
  tipo text not null check (tipo in ('fornecedor', 'propria')),
  nfe_recebida_id uuid references nfe_recebidas(id) on delete set null,
  numero text not null,
  serie text not null,
  chave char(44),
  cfop text not null check (cfop in ('1102', '2102', '3102')),
  status text not null check (status in ('ok', 'divergente', 'transmitida', 'rejeitada')),
  divergencias text[] not null default '{}',
  aceita_com text[],
  emitida_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notas_entrada_status
  on notas_entrada (tenant_id, status);

-- ------------------------------------------------------------- transporte ---
create table if not exists compra_transporte (
  purchase_order_id uuid primary key references purchase_orders(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  transportadora text,
  codigo text,
  previsao date,
  status text not null default 'aguardando'
    check (status in ('aguardando', 'transito', 'saiu', 'chegou',
                      'producao', 'embarcado', 'transito_int', 'porto',
                      'desembaraco', 'liberado')),
  updated_at timestamptz not null default now()
);

create table if not exists compra_transporte_eventos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  status text not null,
  texto text not null,
  local text,
  ocorrido_em timestamptz not null default now()
);

create index if not exists idx_transporte_eventos_po
  on compra_transporte_eventos (purchase_order_id, ocorrido_em);

-- -------------------------------------------------------------- envios -----
create table if not exists compra_envios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  para text not null,
  enviado_em timestamptz not null default now()
);

create index if not exists idx_compra_envios_po
  on compra_envios (purchase_order_id, enviado_em desc);

-- ------------------------------------------------------- de-para fornecedor -
create table if not exists supplier_item_map (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  fornecedor_codigo text not null,
  item_id uuid not null references catalog_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, supplier_id, fornecedor_codigo)
);

-- ----------------------------------------------------------------- RLS ------
alter table compra_importacao enable row level security;
alter table nfe_recebidas enable row level security;
alter table notas_entrada enable row level security;
alter table compra_transporte enable row level security;
alter table compra_transporte_eventos enable row level security;
alter table compra_envios enable row level security;
alter table supplier_item_map enable row level security;

drop policy if exists "le compra_importacao (gestao)" on compra_importacao;
create policy "le compra_importacao (gestao)"
  on compra_importacao for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = compra_importacao.tenant_id
      and p.status = 'ativo'
      and p.role in ('master', 'gerente')
  ));

drop policy if exists "le nfe_recebidas (gestao)" on nfe_recebidas;
create policy "le nfe_recebidas (gestao)"
  on nfe_recebidas for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = nfe_recebidas.tenant_id
      and p.status = 'ativo'
      and p.role in ('master', 'gerente')
  ));

drop policy if exists "le notas_entrada (gestao)" on notas_entrada;
create policy "le notas_entrada (gestao)"
  on notas_entrada for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = notas_entrada.tenant_id
      and p.status = 'ativo'
      and p.role in ('master', 'gerente')
  ));

drop policy if exists "le compra_transporte (gestao)" on compra_transporte;
create policy "le compra_transporte (gestao)"
  on compra_transporte for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = compra_transporte.tenant_id
      and p.status = 'ativo'
      and p.role in ('master', 'gerente')
  ));

drop policy if exists "le compra_transporte_eventos (gestao)" on compra_transporte_eventos;
create policy "le compra_transporte_eventos (gestao)"
  on compra_transporte_eventos for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = compra_transporte_eventos.tenant_id
      and p.status = 'ativo'
      and p.role in ('master', 'gerente')
  ));

drop policy if exists "le compra_envios (gestao)" on compra_envios;
create policy "le compra_envios (gestao)"
  on compra_envios for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = compra_envios.tenant_id
      and p.status = 'ativo'
      and p.role in ('master', 'gerente')
  ));

drop policy if exists "le supplier_item_map (gestao)" on supplier_item_map;
create policy "le supplier_item_map (gestao)"
  on supplier_item_map for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = supplier_item_map.tenant_id
      and p.status = 'ativo'
      and p.role in ('master', 'gerente')
  ));

-- ----------------------------------------------- purchase_receive (v2) ------
-- Assinatura inalterada nos 5 args originais (portal do fornecedor e E2E f6
-- continuam iguais); p_conferido default false preserva o caminho legado.
-- Mudancas: rateio de custo_final (nacional e importacao), qtd_recebida,
-- custo_medio ponderado, N parcelas pela condicao do PO, total do PO passa a
-- ser mercadorias+frete-desconto e p_conferido exige nota de entrada ok.
drop function if exists purchase_receive(uuid, jsonb, text, text, uuid);
drop function if exists purchase_receive(uuid, jsonb, text, text, uuid, boolean);

create function purchase_receive(
  p_purchase_order_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_notes text default null,
  p_created_by uuid default null,
  p_conferido boolean default false
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
  v_mercadorias numeric(12,4) := 0;
  v_total_po numeric(12,2) := 0;
  v_receipt_value numeric(12,2) := 0;
  v_import record;
  v_fob numeric(12,2);
  v_cif numeric(12,2);
  v_ii numeric(12,2);
  v_ipi numeric(12,2);
  v_pis numeric(12,2);
  v_cofins numeric(12,2);
  v_icms numeric(12,2);
  v_saldo numeric(12,4);
  v_offsets integer[];
  v_base numeric(12,2);
  v_amount numeric(12,2);
  rec record;
begin
  if length(v_key) < 8 then
    raise exception 'CHAVE_IDEMPOTENCIA_INVALIDA';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'RECEBIMENTO_VAZIO';
  end if;

  -- idempotencia: a mesma chave nunca gera duas notas.
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

  -- RC-05: so a conferencia do console exige a nota de entrada vinculada
  -- (nacional: fornecedor; importacao: propria). O portal nao passa por aqui.
  if p_conferido and not exists (
    select 1 from notas_entrada ne
     where ne.purchase_order_id = v_po.id and ne.status = 'ok'
  ) then
    raise exception 'NOTA_OBRIGATORIA';
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

    update purchase_order_items
       set qtd_recebida = v_poi.ja_recebido + v_qty
     where id = v_poi.id;

    perform register_stock_movement(
      v_poi.item_id, 'entrada', v_qty, 'compra', v_receipt,
      'recebimento ' || v_code, p_created_by);
  end loop;

  if v_total <= 0 then
    raise exception 'TOTAL_INVALIDO';
  end if;

  update purchase_receipts set total = v_total where id = v_receipt;

  -- custos da 5.2: rateio de custo_final por item antes de fechar valores ---
  select coalesce(sum(quantity * unit_cost), 0)
    into v_mercadorias
    from purchase_order_items
   where purchase_order_id = v_po.id;

  if v_po.origem = 'nacional' then
    v_total_po := greatest(0, v_mercadorias + v_po.frete - v_po.desconto);
    update purchase_order_items
       set custo_final = round(unit_cost * (v_total_po / v_mercadorias), 4)
     where purchase_order_id = v_po.id;
  else
    -- nacionalizacao da importacao (5.2)
    -- TODO validar com contabilidade
    select * into v_import from compra_importacao
     where purchase_order_id = v_po.id;
    if not found then
      raise exception 'IMPORTACAO_SEM_DADOS';
    end if;
    v_fob := v_mercadorias * v_import.cambio;
    v_cif := v_fob + (v_import.frete_int + v_import.seguro) * v_import.cambio;
    v_ii := v_cif * v_import.aliq_ii / 100;
    v_ipi := (v_cif + v_ii) * v_import.aliq_ipi / 100;
    v_pis := v_cif * v_import.aliq_pis / 100;
    v_cofins := v_cif * v_import.aliq_cofins / 100;
    v_icms := ((v_cif + v_ii + v_ipi + v_pis + v_cofins + v_import.despesas)
               / (1 - v_import.aliq_icms / 100)) * v_import.aliq_icms / 100;
    v_total_po := v_cif + v_ii + v_ipi + v_pis + v_cofins
                  + v_import.despesas + v_icms;
    update purchase_order_items
       set custo_final = round(unit_cost * v_total_po / v_mercadorias, 4)
     where purchase_order_id = v_po.id;
  end if;

  -- valor deste recebimento ja nacionalizado (base do titulo a pagar)
  select coalesce(sum(ri.quantity * poi.custo_final), 0)
    into v_receipt_value
    from purchase_receipt_items ri
    join purchase_order_items poi on poi.id = ri.purchase_order_item_id
   where ri.receipt_id = v_receipt;

  -- custo medio ponderado (RC-06): saldo atual ja inclui esta entrada
  for rec in
    select ri.quantity, poi.item_id, poi.custo_final
      from purchase_receipt_items ri
      join purchase_order_items poi on poi.id = ri.purchase_order_item_id
     where ri.receipt_id = v_receipt
  loop
    select coalesce(s.stock_available, 0)
      into v_saldo
      from item_stock s
     where s.item_id = rec.item_id and s.tenant_id = v_tenant;
    if coalesce(v_saldo, 0) <= 0 then
      insert into item_commercial_data (item_id, cost_price)
      values (rec.item_id, rec.custo_final)
      on conflict (item_id) do update set cost_price = excluded.cost_price;
    else
      insert into item_commercial_data (item_id, cost_price)
      values (rec.item_id, rec.custo_final)
      on conflict (item_id) do update
        set cost_price = round(
          ((v_saldo - rec.quantity)
             * coalesce(item_commercial_data.cost_price, rec.custo_final)
           + rec.quantity * rec.custo_final) / v_saldo, 4);
    end if;
  end loop;

  -- PO: status, total cheio (mercadorias+frete-desconto) e marcadoras -------
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
     total = v_total_po,
     conferido_em = case when p_conferido then now() else conferido_em end,
     concluida_em = case
       when p_conferido or not exists (
         select 1 from purchase_order_items i
          where i.purchase_order_id = po.id
            and coalesce((select sum(ri.quantity)
                            from purchase_receipt_items ri
                           where ri.purchase_order_item_id = i.id), 0)
                < i.quantity
       ) then coalesce(po.concluida_em, now())
       else po.concluida_em
     end,
     updated_at = now()
   where id = v_po.id;

  -- titulo a pagar com N parcelas pela condicao (5.6); a ultima absorve
  -- o arredondamento. '28 dias' (default) = 1x, igual ao comportamento antigo.
  v_title := gen_random_uuid();
  insert into financial_titles
    (id, tenant_id, code, direction, status, principal_amount, issue_date,
     due_date, source_type, source_id, customer_id, idempotency_key, created_by)
  values
    (v_title, v_tenant, 'FIN-' || upper(substr(v_title::text, 1, 8)),
     'payable', 'aberto', v_receipt_value, current_date,
     current_date + case v_po.condicao
       when 'À vista' then 0
       when '30/60' then 30
       when '30/60/90' then 30
       else 28
     end,
     'purchase_receipt', v_receipt, null, v_key || ':payable', p_created_by);

  v_offsets := case v_po.condicao
    when 'À vista' then array[0]
    when '30/60' then array[30, 60]
    when '30/60/90' then array[30, 60, 90]
    else array[28]
  end;
  v_base := trunc(v_receipt_value / array_length(v_offsets, 1), 2);
  if v_base = 0 then
    raise exception 'VALOR_PARCELA_INVALIDA';
  end if;
  for i in 1..array_length(v_offsets, 1) loop
    v_amount := case
      when i = array_length(v_offsets, 1)
        then v_receipt_value - v_base * (array_length(v_offsets, 1) - 1)
      else v_base
    end;
    insert into financial_installments
      (tenant_id, title_id, number, due_date, principal_amount)
    values
      (v_tenant, v_title, i, current_date + v_offsets[i], v_amount);
  end loop;

  return jsonb_build_object(
    'receipt_id', v_receipt,
    'title_id', v_title,
    'total', v_receipt_value,
    'duplicate', false
  );
end $$;

revoke execute on function purchase_receive(uuid, jsonb, text, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function purchase_receive(uuid, jsonb, text, text, uuid, boolean)
  to service_role;

commit;
