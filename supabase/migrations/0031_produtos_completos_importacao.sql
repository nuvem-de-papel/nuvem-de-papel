-- 0031_produtos_completos_importacao.sql - Bloco 2: cadastro de produto
-- completo + base para importacao por link de fornecedor (Reval).
--
-- Contexto (Bloco 2, regra 14/10/2026 - staging primeiro):
--   * o form de produto tinha varios campos FANTASMA (nao gravavam nada):
--     Fabricante, CST PIS/Cofins, Base de calculo, CST IBS/CBS, cClassTrib,
--     GTIN tributavel, Observacoes, Data ultimo reajuste, "nao imprimir na
--     tabela de precos";
--   * falta a tabela que liga item <-> fornecedor com dados de embalagem/
--     logistica (o supplier_item_map 0009 e so de-para sku->gtin, nao e o
--     fornecedor do produto);
--   * o fornecedor (Reval) confirmou que o SITE e a fonte oficial de dados
--     (nao tem feed/API) - por isso o importador por link e o caminho. A
--     pagina e server-rendered (ASP.NET WebForms), a tabela de
--     caracteristicas e fixa (<th class=label>/<td class=data>), entao o
--     parse e trivial e TODOS os campos vem preenchidos, menos preco.
--   * peso e dimensoes vem POR EMBALAGEM e por MASTER (1,39 kg / PCT.C/04
--     = 0,3475 kg/un) - colunas tipadas numeric, NUNCA jsonb, pra cubagem/
--     frete calcular direto (regra: nao achatado).
--
-- Regra 2: todo dado carrega tenant_id. begin/commit igual 0029.

begin;

-- ------------------------------------------- catalog_items (fantasmas) ---
-- campos que ja apareciam no form mas nao gravavam; agora tem coluna.
alter table catalog_items
  add column if not exists fabricante text,
  add column if not exists notes text,
  add column if not exists hide_price_table boolean not null default false,
  add column if not exists last_adjusted_at date;

-- ------------------------------------- item_fiscal_data (resto do form) --
-- campos fiscais que o form mostrava mas nao persistia. cst_pis/cst_cofins
-- sao texto de 2 DIGITOS (CST 01-99, ex. 01/49/99 - tabela A/B do PIS/Cofins
-- da NF-e; NAO e 3 digitos como o CST ICMS) - por isso text, nao integer.
-- icms_base_pct e a base de calculo do ICMS (ex. 100,00%).
-- cst_ibscbs (3 dig) e cclass_trib (6 dig) vem da reforma 2026 - xis do
-- XSD PL_010e_v1.02 ja fixado no sefaz.ts.
alter table item_fiscal_data
  add column if not exists cst_pis text,
  add column if not exists cst_cofins text,
  add column if not exists icms_base_pct numeric(7, 4),
  add column if not exists cst_ibscbs text,
  add column if not exists cclass_trib text,
  add column if not exists gtin_tributavel text;

alter table item_fiscal_data drop constraint if exists item_fiscal_data_cst_pis_check;
alter table item_fiscal_data add constraint item_fiscal_data_cst_pis_check
  check (cst_pis is null or cst_pis ~ '^[0-9]{2}$');

alter table item_fiscal_data drop constraint if exists item_fiscal_data_cst_cofins_check;
alter table item_fiscal_data add constraint item_fiscal_data_cst_cofins_check
  check (cst_cofins is null or cst_cofins ~ '^[0-9]{2}$');

alter table item_fiscal_data drop constraint if exists item_fiscal_data_icms_base_pct_check;
alter table item_fiscal_data add constraint item_fiscal_data_icms_base_pct_check
  check (icms_base_pct is null or (icms_base_pct >= 0 and icms_base_pct <= 100));

alter table item_fiscal_data drop constraint if exists item_fiscal_data_cst_ibscbs_check;
alter table item_fiscal_data add constraint item_fiscal_data_cst_ibscbs_check
  check (cst_ibscbs is null or cst_ibscbs ~ '^[0-9]{3}$');

alter table item_fiscal_data drop constraint if exists item_fiscal_data_cclass_trib_check;
alter table item_fiscal_data add constraint item_fiscal_data_cclass_trib_check
  check (cclass_trib is null or cclass_trib ~ '^[0-9]{6}$');

-- gtin_tributavel passa pela mesma regra GS1 do gtin (DV mod-10, 0013).
alter table item_fiscal_data drop constraint if exists item_fiscal_data_gtin_tributavel_check;
alter table item_fiscal_data add constraint item_fiscal_data_gtin_tributavel_check
  check (
    gtin_tributavel is null
    or (gtin_tributavel ~ '^[0-9]{8}$' or gtin_tributavel ~ '^[0-9]{13}$')
    and ean_dv_valido(gtin_tributavel)
  );

-- ------------------------------- item_supplier_data (NOVA - item<->forn) --
-- liga o produto ao fornecedor com tudo que o importador puxa do site.
-- uma linha por (item, fornecedor, sku do fornecedor). supplier_id pode ser
-- null enquanto o fornecedor nao estiver cadastrado (o nome do site fica em
-- supplier_name pra rastrear/identificar depois).
create table if not exists item_supplier_data (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  item_id uuid not null references catalog_items(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,

  -- identificacao do produto NA fonte (codigo do fornecedor + ref fabricante)
  supplier_sku text,
  manufacturer_ref text,
  supplier_name text,
  manufacturer text,
  source_type text not null default 'manual'
    check (source_type in ('reval', 'manual', 'outro')),
  source_url text,

  -- embalagem de comercializacao (ex. PCT.C/04 -> pack_qty=4)
  pack_qty integer check (pack_qty is null or pack_qty >= 1),
  master_qty integer check (master_qty is null or master_qty >= 1),

  -- codigos de barras por nivel (inner/embalagem e master/DUN-14)
  gtin_inner text,
  gtin_master text,

  -- dimensoes e peso da EMBALAGEM de comercializacao (cm / kg)
  emb_comprimento_cm numeric(8, 2) check (emb_comprimento_cm is null or emb_comprimento_cm >= 0),
  emb_altura_cm numeric(8, 2) check (emb_altura_cm is null or emb_altura_cm >= 0),
  emb_largura_cm numeric(8, 2) check (emb_largura_cm is null or emb_largura_cm >= 0),
  emb_peso_kg numeric(10, 3) check (emb_peso_kg is null or emb_peso_kg >= 0),

  -- dimensoes e peso do MASTER/caixa fechada (cm / kg)
  master_comprimento_cm numeric(8, 2) check (master_comprimento_cm is null or master_comprimento_cm >= 0),
  master_altura_cm numeric(8, 2) check (master_altura_cm is null or master_altura_cm >= 0),
  master_largura_cm numeric(8, 2) check (master_largura_cm is null or master_largura_cm >= 0),
  master_peso_kg numeric(10, 3) check (master_peso_kg is null or master_peso_kg >= 0),

  -- detalhes livres da fonte (capa dura, gramatura, folhas...) - aqui sim
  -- jsonb cabe, pois e texto descritivo, nao numero de cubagem
  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- DUN-14 (ITF-14) tem DV proprio calculado sobre 14 digitos - NAO e o mesmo
-- do GTIN-13 embutido (tirar o 1 da esquerda nao valida no ean_dv_valido).
-- Ex.: master 17891027354944 e DUN-14 valido; a raiz 7891027354944 NAO e
-- GTIN-13 valido (o GTIN-13 do item e 7891027354947). Por isso criamos um
-- validador dedicado de 14 digitos e o gtin_master aceita 13 (GTIN-13) OU
-- 14 (DUN-14) - o master e dado de LOGISTICA/cubagem, nao de emissao fiscal.
create or replace function dun14_dv_valido(p_code text)
returns boolean
language plpgsql
immutable
as $$
declare
  d text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  s integer := 0;
  w integer := 3;
  i integer;
begin
  if d !~ '^[0-9]{14}$' then
    return false;
  end if;
  -- soma os 13 primeiros, pesos 3/1 alternando da direita (pos 13) p/ esquerda
  i := length(d) - 1;
  while i >= 1 loop
    s := s + substring(d, i, 1)::integer * w;
    w := case when w = 3 then 1 else 3 end;
    i := i - 1;
  end loop;
  return ((10 - (s % 10)) % 10) = substring(d, length(d), 1)::integer;
end;
$$;

alter table item_supplier_data drop constraint if exists item_supplier_data_gtin_master_check;
alter table item_supplier_data add constraint item_supplier_data_gtin_master_check
  check (
    gtin_master is null
    or (
      (gtin_master ~ '^[0-9]{8}$' or gtin_master ~ '^[0-9]{13}$')
      and ean_dv_valido(gtin_master)
    )
    or (gtin_master ~ '^[0-9]{14}$' and dun14_dv_valido(gtin_master))
  );

-- gtin_inner e um EAN-13 de embalagem - mesma regra GS1.
alter table item_supplier_data drop constraint if exists item_supplier_data_gtin_inner_check;
alter table item_supplier_data add constraint item_supplier_data_gtin_inner_check
  check (
    gtin_inner is null
    or (gtin_inner ~ '^[0-9]{8}$' or gtin_inner ~ '^[0-9]{13}$')
    and ean_dv_valido(gtin_inner)
  );

-- um produto nao pode ter o mesmo codigo de fornecedor duas vezes.
-- (item_id + supplier_sku: o sku do fornecedor e unico por item.)
create unique index if not exists item_supplier_data_item_sku_key
  on item_supplier_data (item_id, supplier_sku)
  where supplier_sku is not null;

create index if not exists item_supplier_data_supplier_idx
  on item_supplier_data (supplier_id)
  where supplier_id is not null;

-- RLS: mesma formula das demais - leitura publica so de item ativo, escrita
-- so via service_role (server actions).
alter table item_supplier_data enable row level security;

drop policy if exists item_supplier_data_public_read on item_supplier_data;
create policy item_supplier_data_public_read on item_supplier_data
  for select using (
    exists (
      select 1 from catalog_items ci
      where ci.id = item_id and ci.active = true
    )
  );

commit;
