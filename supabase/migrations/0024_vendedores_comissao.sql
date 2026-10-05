-- 0024_vendedores_comissao.sql - Bloco 5 (Comercial), passo 1.
--
-- O que este arquivo cria (kernel generico por tenant, sem regra de segmento):
--
--   sellers        vendedores do tenant: quem atende e quem comissiona.
--                  Pessoa fisica que pode (ou nao) ter login no sistema -
--                  por isso a tabela e separada de profiles. profile_id e
--                  opcional e serve so para amarrar o vendedor ao usuario.
--   orders.seller_id  pedido vendido por quem. on delete set null para
--                  apagar um vendedor sem perder o historico de vendas.
--   v_comissao     comissao por vendedor e por MES: base = pedidos FATURADOS
--                  (mesma regra do 0023: status not in
--                  'aguardando_pagamento','cancelado'), percentual =
--                  sellers.commission_pct.
--
-- POLITICA PADRAO (decisao parametrizavel, nao regra de negocio fixa):
--   * base de calculo ..... total do pedido faturado (total_amount)
--   * competencia ......... mes de orders.created_at
--   * percentual .......... sellers.commission_pct, por vendedor
--   * quando paga ........ o sistema CALCULA; quem registra o pagamento e
--                          o financeiro (nada de dinheiro automatico aqui)
--   Se o cliente mudar qualquer um desses quatro, mexe-se so na view abaixo.
--
-- ESCOPO: sem as telas (vao no passo 2 do Bloco 5). Aqui e so o dado.
--
-- Idioma: comentarios em ASCII puro (evita problema de encoding na API de query).

-- ---------------------------------------------------------------------
-- 1. Vendedores
-- ---------------------------------------------------------------------
create table if not exists sellers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  name           text not null,
  email          text,
  documento      text,
  telefone       text,
  ativo          boolean not null default true,
  commission_pct numeric not null default 0,
  meta           numeric not null default 0,
  profile_id     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table sellers is
  'Vendedores por tenant (nome, contato, percentual de comissao e meta). Separado de profiles: vendedor pode nao ter login.';

alter table sellers drop constraint if exists sellers_commission_pct_check;
alter table sellers add constraint sellers_commission_pct_check
  check (commission_pct >= 0 and commission_pct <= 100);

alter table sellers drop constraint if exists sellers_meta_check;
alter table sellers add constraint sellers_meta_check
  check (meta >= 0);

-- mesmo formato de customers.documento (CPF ou CNPJ so com digitos)
alter table sellers drop constraint if exists sellers_documento_check;
alter table sellers add constraint sellers_documento_check
  check (documento is null or documento ~ '^[0-9]{11}$|^[0-9]{14}$');

create unique index if not exists sellers_tenant_id_name_key
  on sellers (tenant_id, name);

create index if not exists idx_sellers_tenant_ativo
  on sellers (tenant_id, ativo);

-- RLS ANTES de qualquer escrita (mesma ordem do 0021)
alter table sellers enable row level security;

-- ---------------------------------------------------------------------
-- 2. Vinculo pedido -> vendedor
-- ---------------------------------------------------------------------
alter table orders
  drop constraint if exists orders_seller_id_fkey;
alter table orders
  add column if not exists seller_id uuid;

-- add column if not exists nao reexecuta o FK se a coluna ja existir, entao o
-- add constraint fica idempotente por nome.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.orders'::regclass
       and conname = 'orders_seller_id_fkey'
  ) then
    alter table orders
      add constraint orders_seller_id_fkey
      foreign key (seller_id) references sellers(id) on delete set null;
  end if;
end $$;

create index if not exists idx_orders_seller
  on orders (tenant_id, seller_id, created_at desc);

comment on column orders.seller_id is
  'Vendedor responsavel pelo pedido (sellers.id). on delete set null: apagar o vendedor nao apaga o historico.';

-- ---------------------------------------------------------------------
-- 3. Comissao por vendedor e por mes
-- ---------------------------------------------------------------------
create or replace view v_comissao as
select o.tenant_id,
       o.seller_id,
       s.name                                                        as vendedor,
       (date_trunc('month', o.created_at))::date                     as periodo,
       count(*)::bigint                                              as pedidos,
       coalesce(sum(o.total_amount), 0)::numeric                     as base,
       s.commission_pct                                              as pct,
       round(coalesce(sum(o.total_amount), 0) * s.commission_pct / 100.0, 2)::numeric
                                                                     as comissao
  from orders o
  join sellers s
    on s.id = o.seller_id
   and s.tenant_id = o.tenant_id
 where o.status not in ('aguardando_pagamento', 'cancelado')
 group by o.tenant_id, o.seller_id, s.name, s.commission_pct,
          (date_trunc('month', o.created_at))::date;

comment on view v_comissao is
  'Comissao por vendedor e por mes. Base = pedidos faturados (regra 0023). Percentual vem de sellers.commission_pct.';

-- padrao do repo: a view e interna, o cliente le pela tela
revoke select on v_comissao from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS - padrao do repo: leitura so para gestao, escrita so service_role
-- ---------------------------------------------------------------------
create policy "le vendedores (gestao)" on sellers
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.id = auth.uid()
       and p.tenant_id = sellers.tenant_id
       and p.status = 'ativo'
       and p.role in ('master','gerente')
  ));
