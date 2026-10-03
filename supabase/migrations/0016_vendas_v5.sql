-- 0016_vendas_v5.sql - Modulo Vendas v5 (modulo-vendas.md v1.0, 02/10/2026).
-- Contexto (roadmap F5/Vendas):
--   * customers ganha dados fiscais para emitir nota de pedido/venda
--     (documento CPF/CNPJ so digitos, IE e UF - default SP na tela);
--   * funil de documentos em orders (0015): etapa 'pedido' nasce da criacao
--     direta/importacao da loja, vira 'venda' na conversao com numero V-;
--     backfill: todo documento erp/pdvo ja era uma venda (etapa='venda',
--     convertido_em=created_at); origem 'loja' fica null ate a aba
--     "Importar da loja" gerar o numero P-;
--   * entregas + entrega_eventos: agenda de expedicao da aba Expedicao
--     (status manual com historico); 1 entrega por pedido; aviso ao cliente
--     e e-mail existente (email_messages.related_entity='entregas'), sem
--     tabela nova;
--   * numeracao P- segue seq_pedido_numero (0015, start 1043).
-- RLS: deny-all de escrita + leitura de gestao/operacao (mesma formula das
-- 0008/0011); escrita so via service_role nas server actions.
-- begin/commit igual ao 0009-0015.

begin;

-- dados fiscais do cliente ---------------------------------------------------
alter table customers
  add column if not exists documento text,
  add column if not exists ie text,
  add column if not exists uf text;

alter table customers drop constraint if exists customers_documento_check;
alter table customers add constraint customers_documento_check
  check (documento is null or documento ~ '^[0-9]{11}$|^[0-9]{14}$');

alter table customers drop constraint if exists customers_uf_check;
alter table customers add constraint customers_uf_check
  check (uf is null or uf ~ '^[A-Z]{2}$');

-- backfill do funil: erp/pdvo ja era venda; loja espera importacao ----------
update orders
   set etapa = 'venda',
       convertido_em = coalesce(convertido_em, created_at)
 where etapa is null
   and origem in ('erp', 'pdv');

-- ------------------------------------------------------------- entregas -----
create table if not exists entregas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  status text not null default 'aguardando'
    check (status in ('aguardando', 'separado', 'em_transito', 'entregue',
                      'falhou', 'devolvido')),
  transportadora text,
  rastreio text,
  prazo date,
  endereco jsonb not null default '{}'::jsonb,
  observacao text,
  enviado_em timestamptz,
  entregue_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_id)
);

create table if not exists entrega_eventos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  entrega_id uuid not null references entregas(id) on delete cascade,
  de_status text,
  para_status text not null,
  nota text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_entregas_status
  on entregas (tenant_id, status, prazo);
create index if not exists idx_entrega_eventos_entrega
  on entrega_eventos (entrega_id, created_at);

alter table entregas enable row level security;
alter table entrega_eventos enable row level security;

drop policy if exists "le entregas (operacao)" on entregas;
create policy "le entregas (operacao)"
  on entregas for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = entregas.tenant_id
      and p.status = 'ativo'
      and p.role in ('master', 'gerente', 'operador')
  ));

drop policy if exists "le eventos de entrega (operacao)" on entrega_eventos;
create policy "le eventos de entrega (operacao)"
  on entrega_eventos for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.tenant_id = entrega_eventos.tenant_id
      and p.status = 'ativo'
      and p.role in ('master', 'gerente', 'operador')
  ));

commit;
