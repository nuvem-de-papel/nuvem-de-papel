-- 0011_nfe.sql - modulo de notas fiscais do painel Vendas (emissao propria).
-- Contexto (pedido do cliente: modulo "Vendas" com PDV + Vendas Detalhada,
-- layout simples e "opcao de emissao de nota fiscal"; as telas classicas de
-- NF-e serviram apenas de referencia ilustrativa — este e o nosso modelo):
--   * nfe_emissoes guarda o documento emitido pelo sistema (numero/serie,
--     natureza da operacao, CFOP, destinatario, frete, itens com impostos e
--     totais em JSONB — o layout e livre, sem amarracao com schema antigo);
--   * tipo saida vincula a orders (venda) e tipo entrada a purchase_orders
--     (compra); um dos dois e obrigatorio (check);
--   * sequencia unica por (tenant_id, serie, numero) — a server action pega
--     max(numero)+1 e o constraint impede corrida duplicada;
--   * NAO ha transmissao a SEFAZ nesta fase (exige certificado digital e
--     regime de ambiente) — e a emissao interna/documento da empresa;
--   * RLS: leitura restrita a gestao ativa (master|gerente) — mesma formula
--     das 0005/0010; escrita deny-all (server actions usam service_role).
-- Regra 2: todo dado carrega tenant_id. begin/commit igual ao 0009/0010.

begin;

-- ------------------------------------------------------- nfe_emissoes -----
create table if not exists nfe_emissoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tipo text not null default 'saida'
    check (tipo in ('saida', 'entrada')),
  order_id uuid references orders(id) on delete set null,
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  numero bigint not null check (numero > 0),
  serie integer not null default 1 check (serie >= 1),
  natureza_operacao text not null default 'Venda de mercadoria',
  cfop text not null default '5102',
  destinatario jsonb not null default '{}'::jsonb,
  frete jsonb not null default '{}'::jsonb,
  itens jsonb not null default '[]'::jsonb,
  totais jsonb not null default '{}'::jsonb,
  dados_adicionais text,
  status text not null default 'emitida'
    check (status in ('emitida', 'cancelada')),
  cancelada_em timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- saida precisa de pedido de venda; entrada, de pedido de compra.
  check (order_id is not null or purchase_order_id is not null),
  unique (tenant_id, serie, numero)
);

create index if not exists idx_nfe_emissoes_tenant_created
  on nfe_emissoes (tenant_id, created_at desc);

create index if not exists idx_nfe_emissoes_order
  on nfe_emissoes (order_id) where order_id is not null;

alter table nfe_emissoes enable row level security;

drop policy if exists "leitura nfe (gestao)" on nfe_emissoes;
create policy "leitura nfe (gestao)"
  on nfe_emissoes for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.tenant_id = nfe_emissoes.tenant_id
        and p.status = 'ativo'
        and p.role in ('master', 'gerente')
    )
  );

commit;
