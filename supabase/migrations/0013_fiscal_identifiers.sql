-- 0013_fiscal_identifiers.sql - identificadores fiscais (padrao M20) e
-- cadastro real da empresa emitente (base da F8 fiscal).
-- Contexto (roadmap F8):
--   * item_fiscal_data ganha GTIN/EAN-8/EAN-13 com digito verificador
--     validado NO BANCO (funcao ean_dv_valido, regra GS1 mod-10), CEST,
--     origem, unidade comercial e peso bruto - o canal do marketplace
--     exige GTIN confiavel (M20);
--   * tenant_company guarda a emitente real (CNPJ/IE/regime/endereco):
--     a tela de cadastro da empresa era formulario de exemplo hardcoded;
--   * sefaz_config guarda ambiente/series/CFOP da emissao (base do ciclo
--     SEFAZ da F8.2; CSC e certificado entram la, negados no RLS);
--   * RLS: tenant_company leitura restrita a gestao ativa (master|gerente)
--     e escrita deny-all (server actions usam service_role) - mesma formula
--     das 0005/0010/0011; sefaz_config e negado ate para a gestao (fica
--     so para service_role - um dia carrega CSC/token la dentro).
-- Regra 2: todo dado carrega tenant_id. begin/commit igual ao 0009-0012.

begin;

-- ------------------------------------------------------- ean_dv_valido ----
-- validador GS1: 8 ou 13 digitos, pesos 3/1 da direita para esquerda
-- (antes do DV), DV = (10 - soma mod 10) mod 10. Aceita mascara
-- (remove tudo que nao e digito antes de validar).
create or replace function ean_dv_valido(p_code text)
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
  if d !~ '^[0-9]{8}$' and d !~ '^[0-9]{13}$' then
    return false;
  end if;
  i := length(d) - 1;
  while i >= 1 loop
    s := s + substring(d, i, 1)::integer * w;
    w := case when w = 3 then 1 else 3 end;
    i := i - 1;
  end loop;
  return ((10 - (s % 10)) % 10) = substring(d, length(d), 1)::integer;
end;
$$;

-- ------------------------------------------- item_fiscal_data (M20) ------
alter table item_fiscal_data
  add column if not exists gtin text,
  add column if not exists cest text,
  add column if not exists origem text not null default '0',
  add column if not exists unit text not null default 'UN',
  add column if not exists weight_gross_kg numeric(10, 3);

alter table item_fiscal_data drop constraint if exists item_fiscal_data_gtin_check;
alter table item_fiscal_data add constraint item_fiscal_data_gtin_check
  check (
    gtin is null
    or (gtin ~ '^[0-9]{8}$' or gtin ~ '^[0-9]{13}$')
    and ean_dv_valido(gtin)
  );

alter table item_fiscal_data drop constraint if exists item_fiscal_data_origem_check;
alter table item_fiscal_data add constraint item_fiscal_data_origem_check
  check (origem ~ '^[0-7]$');

alter table item_fiscal_data drop constraint if exists item_fiscal_data_unit_check;
alter table item_fiscal_data add constraint item_fiscal_data_unit_check
  check (char_length(unit) between 1 and 6);

-- GTIN e identificador unico no mundo: mesmo codigo nao pode em 2 produtos.
create unique index if not exists item_fiscal_data_gtin_key
  on item_fiscal_data (gtin) where gtin is not null;

-- --------------------------------------------------- tenant_company -------
create table if not exists tenant_company (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  razao_social text not null check (char_length(razao_social) >= 2),
  fantasia text not null default '',
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  ie text not null default '',
  im text not null default '',
  regime text not null default 'simples'
    check (regime in ('simples', 'normal', 'mei')),
  email text not null default '',
  telefone text not null default '',
  endereco jsonb not null default '{}'::jsonb,
  site text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table tenant_company enable row level security;

drop policy if exists "leitura tenant_company (gestao)" on tenant_company;
create policy "leitura tenant_company (gestao)"
  on tenant_company for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.tenant_id = tenant_company.tenant_id
        and p.status = 'ativo'
        and p.role in ('master', 'gerente')
    )
  );

-- escrita deny-all: nao existe policy de escrita (server actions usam
-- service_role, que faz bypass no RLS).

-- --------------------------------------------------- sefaz_config --------
create table if not exists sefaz_config (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  ambiente text not null default 'homologacao'
    check (ambiente in ('homologacao', 'producao')),
  serie_nfe integer not null default 1 check (serie_nfe >= 1),
  serie_nfce integer not null default 1 check (serie_nfce >= 1),
  cfop_padrao text not null default '5102' check (cfop_padrao ~ '^[0-9]{4}$'),
  pedir_documento boolean not null default true,
  csc_id text not null default '',
  csc_token text not null default '',
  updated_at timestamptz not null default now()
);

alter table sefaz_config enable row level security;

-- negado ate para a gestao: guarda segredo do CSC (leitura/escrita so
-- via service_role nas server actions).
drop policy if exists "sefaz_config negado" on sefaz_config;
create policy "sefaz_config negado"
  on sefaz_config for all
  to authenticated
  using (false)
  with check (false);

commit;
