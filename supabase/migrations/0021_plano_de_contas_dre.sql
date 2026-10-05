-- 0021_plano_de_contas_dre.sql - Bloco 2 (contabilidade), passo 1.
--
-- O que este arquivo cria (kernel generico por tenant, sem regra de segmento):
--
--   account_catalog   plano padrao GLOBAL (classe 1-6, 3 niveis, natureza D/C,
--                     folha que aceita lancamento, e onde entra no DRE).
--                     Mesmo padrao do module_catalog/tenant_modules do
--                     ConnectionCyber: o plano entra uma vez, cada tenant o
--                     habilita sem duplicar schema.
--   tenant_accounts   habilitacao do plano por tenant (PK composta).
--   cost_centers      centros de custo por tenant (ciclo administrativo).
--   journal_entries   cabecalho do diario (dupla entrada) com COMPETENCIA -
--                     o que faltava para separar caixa de competencia.
--   journal_entry_lines  lancamento: uma linha e de uma conta so, com debito
--                     OU credito (nunca os dois), e o TOTAL do lancamento tem
--                     de fechar (trigger adiada para o fim da transacao).
--   expenses          despesas fixas por competencia + centro de custo.
--   v_dre             DRE por competencia, ja com os grupos da demonstracao.
--
-- IMUTABILIDADE (mesma filosofia de caixa_movements e financial_settlements):
--   * linhas do diario: NUNCA update nem delete - erro se tentar;
--   * cabecalho: delete bloqueado (usa-se estorno), update liberado porque o
--     valor mora na linha, que e imutavel.
--
-- ESTE ARQUIVO NAO COLOCA TRIGGER DE ESCRITA EM NENHUMA TABELA DE NEGOCIO.
-- As regras de lancamento automatico (venda, recebimento, liquidacao, compra)
-- vem no proximo passo, depois de mapear o ciclo de vida real do PDV - aqui
-- so existe a base, e ela e testavel sozinha.
--
-- Idioma: comentarios em ASCII puro (evita problema de encoding na API de query).

-- ---------------------------------------------------------------------
-- 1. Plano padrao (global)
-- ---------------------------------------------------------------------
create table if not exists account_catalog (
  code        text primary key,
  name        text not null,
  classe      smallint not null check (classe between 1 and 6),
  tipo        text not null check (tipo in ('ativo','passivo','patrimonio','receita','custo','despesa')),
  natureza    text not null check (natureza in ('debito','credito')),
  parent_code text references account_catalog(code) deferrable initially deferred,
  nivel       smallint not null default 1 check (nivel between 1 and 3),
  ordem       integer not null,
  aceita_lancamento boolean not null default false,
  dre_grupo   text check (dre_grupo is null or dre_grupo in (
                'receita_bruta',
                'deducoes_receita',
                'custo_vendidos',
                'despesa_operacional',
                'outras_receitas',
                'despesa_financeira',
                'ir_csf'
              )),
  ativo       boolean not null default true
);

comment on table account_catalog is
  'Plano de contas padrao da plataforma (NBC TG 1000, classes 1-6). Global: entra uma vez, cada tenant habilita em tenant_accounts.';

-- Sempre que uma folha aceita lancamento ela precisa estar num grupo do DRE
-- (ou ser conta de balanco, classe 1-3, que nao entra no DRE).
alter table account_catalog
  drop constraint if exists chk_catalog_leaf_grupo;
alter table account_catalog
  add constraint chk_catalog_leaf_grupo
  check (classe <= 3 or aceita_lancamento = false or dre_grupo is not null);

-- RLS ligada ANTES de semear: o parent_code e um self-FK deferravel, entao o
-- INSERT da semente deixa trigger events pendentes na tabela e qualquer
-- ALTER TABLE posterior falharia com "pending trigger events".
alter table account_catalog enable row level security;

-- ---------------------------------------------------------------------
-- 2. Semente do plano padrao
--    Classe 1 Ativo | 2 Passivo | 3 PL | 4 Receitas | 5 Custo | 6 Despesas
--    nivel 1 = classe, nivel 2 = subgrupo, nivel 3 = conta (folha)
-- ---------------------------------------------------------------------
insert into account_catalog
  (code, name, classe, tipo, natureza, parent_code, nivel, ordem, aceita_lancamento, dre_grupo)
values
  -- classe 1
  ('1',   'Ativo',                                   1, 'ativo',   'debito',  null, 1,   10, false, null),
  ('1.1', 'Ativo Circulante',                        1, 'ativo',   'debito',  '1',   2,   20, false, null),
  ('1.1.1','Caixa e equivalentes de caixa',          1, 'ativo',   'debito',  '1.1', 3,   30, true,  null),
  ('1.1.2','Contas a receber de clientes',           1, 'ativo',   'debito',  '1.1', 3,   40, true,  null),
  ('1.1.3','Mercadorias em estoque',                 1, 'ativo',   'debito',  '1.1', 3,   50, true,  null),
  ('1.1.4','Tributos a recuperar',                   1, 'ativo',   'debito',  '1.1', 3,   60, true,  null),
  ('1.1.5','Aplicacoes de liquidez',                 1, 'ativo',   'debito',  '1.1', 3,   70, true,  null),
  ('1.2', 'Ativo Nao Circulante',                    1, 'ativo',   'debito',  '1',   2,   80, false, null),
  ('1.2.1','Imovel, maquinas e equipamentos',        1, 'ativo',   'debito',  '1.2', 3,   90, true,  null),
  ('1.2.2','Depreciacao acumulada',                  1, 'ativo',   'credito', '1.2', 3,  100, true,  null),
  ('1.2.3','Permanencias e aplicacoes',              1, 'ativo',   'debito',  '1.2', 3,  110, true,  null),
  -- classe 2
  ('2',   'Passivo',                                 2, 'passivo', 'credito', null, 1,  200, false, null),
  ('2.1', 'Passivo Circulante',                      2, 'passivo', 'credito', '2',  2,  210, false, null),
  ('2.1.1','Fornecedores',                           2, 'passivo', 'credito', '2.1',3,  220, true,  null),
  ('2.1.2','Obrigacoes trabalhistas',                2, 'passivo', 'credito', '2.1',3,  230, true,  null),
  ('2.1.3','Tributos a pagar',                       2, 'passivo', 'credito', '2.1',3,  240, true,  null),
  ('2.1.4','Emprestimos e financiamentos',           2, 'passivo', 'credito', '2.1',3,  250, true,  null),
  ('2.1.5','Dividendos a pagar',                     2, 'passivo', 'credito', '2.1',3,  260, true,  null),
  ('2.2', 'Passivo Nao Circulante',                  2, 'passivo', 'credito', '2',  2,  270, false, null),
  ('2.2.1','Emprestimos longo prazo',                2, 'passivo', 'credito', '2.2',3,  280, true,  null),
  -- classe 3
  ('3',   'Patrimonio Liquido',                      3, 'patrimonio','credito', null,1,  300, false, null),
  ('3.1', 'Capital Social',                          3, 'patrimonio','credito', '3', 2,  310, false, null),
  ('3.1.1','Capital integralizado',                  3, 'patrimonio','credito', '3.1',3, 320, true,  null),
  ('3.2', 'Resultados acumulados',                   3, 'patrimonio','credito', '3', 2,  330, false, null),
  ('3.2.1','Lucros ou prejuizos acumulados',         3, 'patrimonio','credito', '3.2',3, 340, true,  null),
  -- classe 4
  ('4',   'Receitas',                                4, 'receita', 'credito', null, 1,  400, false, null),
  ('4.1', 'Receita Bruta',                           4, 'receita', 'credito', '4',  2,  410, false, 'receita_bruta'),
  ('4.1.1','Vendas de mercadorias',                  4, 'receita', 'credito', '4.1',3,  420, true,  'receita_bruta'),
  ('4.1.2','Prestacao de servicos',                  4, 'receita', 'credito', '4.1',3,  430, true,  'receita_bruta'),
  ('4.2', 'Deducoes da Receita Bruta',               4, 'receita', 'debito',  '4',  2,  440, false, 'deducoes_receita'),
  ('4.2.1','Tributos sobre vendas',                  4, 'receita', 'debito',  '4.2',3,  450, true,  'deducoes_receita'),
  ('4.2.2','Devolucoes de vendas',                   4, 'receita', 'debito',  '4.2',3,  460, true,  'deducoes_receita'),
  ('4.2.3','Descontos concedidos',                   4, 'receita', 'debito',  '4.2',3,  470, true,  'deducoes_receita'),
  ('4.3', 'Outras Receitas',                         4, 'receita', 'credito', '4',  2,  480, false, 'outras_receitas'),
  ('4.3.1','Receitas financeiras',                   4, 'receita', 'credito', '4.3',3,  490, true,  'outras_receitas'),
  ('4.3.2','Venda de ativos',                        4, 'receita', 'credito', '4.3',3,  500, true,  'outras_receitas'),
  -- classe 5
  ('5',   'Custo dos Produtos Vendidos',             5, 'custo',   'debito',  null, 1,  600, false, null),
  ('5.1', 'Custo de aquisicao',                      5, 'custo',   'debito',  '5',  2,  610, false, 'custo_vendidos'),
  ('5.1.1','Custo das mercadorias vendidas (CMV)',   5, 'custo',   'debito',  '5.1',3,  620, true,  'custo_vendidos'),
  ('5.1.2','Frete sobre compras',                    5, 'custo',   'debito',  '5.1',3,  630, true,  'custo_vendidos'),
  ('5.1.3','Custo de servicos prestados',            5, 'custo',   'debito',  '5.1',3,  640, true,  'custo_vendidos'),
  -- classe 6
  ('6',   'Despesas',                                6, 'despesa', 'debito',  null, 1,  700, false, null),
  ('6.1', 'Despesas Administrativas',                6, 'despesa', 'debito',  '6',  2,  710, false, 'despesa_operacional'),
  ('6.1.1','Pessoal e encargos',                     6, 'despesa', 'debito',  '6.1',3,  720, true,  'despesa_operacional'),
  ('6.1.2','Aluguel e condominio',                   6, 'despesa', 'debito',  '6.1',3,  730, true,  'despesa_operacional'),
  ('6.1.3','Energia, agua e telefone',               6, 'despesa', 'debito',  '6.1',3,  740, true,  'despesa_operacional'),
  ('6.1.4','Softwares e sistemas',                   6, 'despesa', 'debito',  '6.1',3,  750, true,  'despesa_operacional'),
  ('6.1.5','Depreciacao e amortizacao',              6, 'despesa', 'debito',  '6.1',3,  760, true,  'despesa_operacional'),
  ('6.2', 'Despesas Comerciais',                     6, 'despesa', 'debito',  '6',  2,  770, false, 'despesa_operacional'),
  ('6.2.1','Comissoes de vendedores',                6, 'despesa', 'debito',  '6.2',3,  780, true,  'despesa_operacional'),
  ('6.2.2','Marketing e propaganda',                 6, 'despesa', 'debito',  '6.2',3,  790, true,  'despesa_operacional'),
  ('6.2.3','Frete de vendas',                        6, 'despesa', 'debito',  '6.2',3,  800, true,  'despesa_operacional'),
  ('6.3', 'Despesas Financeiras',                    6, 'despesa', 'debito',  '6',  2,  810, false, 'despesa_financeira'),
  ('6.3.1','Juros e multas',                         6, 'despesa', 'debito',  '6.3',3,  820, true,  'despesa_financeira'),
  ('6.3.2','Taxas de cartao e maquininha',           6, 'despesa', 'debito',  '6.3',3,  830, true,  'despesa_financeira'),
  ('6.4', 'Outras Despesas',                         6, 'despesa', 'debito',  '6',  2,  840, false, 'despesa_operacional'),
  ('6.4.1','Tributos e multas',                      6, 'despesa', 'debito',  '6.4',3,  850, true,  'despesa_operacional'),
  ('6.4.2','Despesas diversas',                      6, 'despesa', 'debito',  '6.4',3,  860, true,  'despesa_operacional'),
  ('6.5', 'Despesas Tributarias',                    6, 'despesa', 'debito',  '6',  2,  870, false, 'ir_csf'),
  ('6.5.1','IRPJ, CSLL e contribuicoes',             6, 'despesa', 'debito',  '6.5',3,  880, true,  'ir_csf')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 3. Habilitacao por tenant
-- ---------------------------------------------------------------------
create table if not exists tenant_accounts (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  code       text not null references account_catalog(code) on delete restrict,
  name_override text,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, code)
);

create index if not exists idx_tenant_accounts_tenant on tenant_accounts(tenant_id, ativo);

comment on table tenant_accounts is
  'Plano de contas habilitado por tenant. Trocar `ativo` e o equivalente a uma feature flag de conta - nao exige migration.';

-- Semeia o plano inteiro para um tenant (idempotente).
create or replace function seed_chart_of_accounts(p_tenant uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  if p_tenant is null then
    raise exception 'SEED_PLANO_TENANT_NULO';
  end if;
  insert into tenant_accounts (tenant_id, code)
  select p_tenant, c.code
    from account_catalog c
   on conflict (tenant_id, code) do nothing;
  get diagnostics v = row_count;
  return v;
end $$;

comment on function seed_chart_of_accounts(uuid) is
  'Habilita o plano de contas padrao em um tenant. Idempotente: conta ja habilitada nao gera linha nova.';

-- ---------------------------------------------------------------------
-- 4. Centros de custo (ciclo administrativo)
-- ---------------------------------------------------------------------
create table if not exists cost_centers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  code       text not null,
  name       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create or replace function seed_cost_centers(p_tenant uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into cost_centers (tenant_id, code, name)
  values (p_tenant, 'ADM', 'Administrativo'),
         (p_tenant, 'COM', 'Comercial'),
         (p_tenant, 'LOG', 'Logistica'),
         (p_tenant, 'FIN', 'Financeiro')
  on conflict (tenant_id, code) do nothing;
  get diagnostics v = row_count;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 5. Diario de dupla entrada
-- ---------------------------------------------------------------------
create table if not exists journal_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  competencia date not null,
  entry_date  date not null default current_date,
  source_type text not null check (source_type in
                ('venda','recebimento','compra','pagamento','despesa','manual','ajuste')),
  source_id   uuid,
  document    text,
  description text not null check (char_length(description) >= 3),
  cost_center_id uuid references cost_centers(id) on delete set null,
  status      text not null default 'aberto' check (status in ('aberto','estornado')),
  reverses_entry_id uuid references journal_entries(id) on delete set null,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  idempotency_key text not null,
  unique (tenant_id, idempotency_key)
);

create index if not exists idx_journal_entries_mes
  on journal_entries(tenant_id, competencia);

create table if not exists journal_entry_lines (
  id       uuid primary key default gen_random_uuid(),
  entry_id uuid not null references journal_entries(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  code     text not null references account_catalog(code) on delete restrict,
  debit    numeric(14,2) not null default 0 check (debit >= 0),
  credit   numeric(14,2) not null default 0 check (credit >= 0),
  check (not (debit > 0 and credit > 0)),
  check (debit > 0 or credit > 0)
);

create index if not exists idx_journal_lines_entry on journal_entry_lines(entry_id);
create index if not exists idx_journal_lines_conta  on journal_entry_lines(code, tenant_id);

alter table tenant_accounts    enable row level security;
alter table cost_centers       enable row level security;
alter table journal_entries    enable row level security;
alter table journal_entry_lines enable row level security;

-- ---------------------------------------------------------------------
-- 6. Balanco do lancamento (adiada: roda no fim da transacao)
-- ---------------------------------------------------------------------
create or replace function journal_check_balance() returns trigger
language plpgsql as $$
declare v_entry uuid; v_d numeric; v_c numeric;
begin
  if TG_OP = 'DELETE' then
    v_entry := old.entry_id;
  else
    v_entry := new.entry_id;
  end if;
  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_d, v_c
    from journal_entry_lines
   where entry_id = v_entry;
  if v_d <> v_c then
    raise exception 'DIARIO_DESVIO: lancamento % com debito % <> credito %', v_entry, v_d, v_c;
  end if;
  return null;
end $$;

create constraint trigger trg_journal_balance
  after insert or delete on journal_entry_lines
  deferrable initially deferred
  for each row execute function journal_check_balance();

-- ---------------------------------------------------------------------
-- 7. Imutabilidade
-- ---------------------------------------------------------------------
create or replace function journal_lines_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'DIARIO_LINHA_IMUTAVEL: % nao permitido (crie um estorno)', tg_op;
end $$;

create trigger trg_journal_lines_immutable
  before update or delete on journal_entry_lines
  for each row execute function journal_lines_immutable();

create or replace function journal_entries_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'DIARIO_CABECALHO_IMUTAVEL: delete nao permitido (crie um estorno)';
  end if;
  return new;
end $$;

create trigger trg_journal_entries_immutable
  before delete on journal_entries
  for each row execute function journal_entries_immutable();

-- ---------------------------------------------------------------------
-- 8. Escrita do diario (unica porta de entrada)
-- ---------------------------------------------------------------------
create or replace function journal_post(
  p_tenant         uuid,
  p_competencia    date,
  p_source_type    text,
  p_source_id      uuid,
  p_description    text,
  p_document       text,
  p_cost_center    uuid,
  p_lines          jsonb,
  p_idem           text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_entry uuid; v_d numeric := 0; v_c numeric := 0; l jsonb; v_ok boolean;
begin
  if p_tenant is null then raise exception 'DIARIO_TENANT_NULO'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'DIARIO_LANCAMENTO_INVALIDO: precisao de pelo menos 2 linhas';
  end if;
  if p_idem is null then raise exception 'DIARIO_IDEMPOTENCIA_NULA'; end if;

  -- idempotencia: replay nao duplica lancamento
  select id into v_entry
    from journal_entries
   where tenant_id = p_tenant and idempotency_key = p_idem;
  if v_entry is not null then return v_entry; end if;

  -- garante o plano habilitado
  perform seed_chart_of_accounts(p_tenant);

  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce(l->>'code','') = '' then
      raise exception 'DIARIO_LINHA_SEM_CONTA';
    end if;
    if coalesce((l->>'debit')::numeric, 0) < 0
       or coalesce((l->>'credit')::numeric, 0) < 0 then
      raise exception 'DIARIO_VALOR_NEGATIVO';
    end if;
    v_d := v_d + coalesce((l->>'debit')::numeric, 0);
    v_c := v_c + coalesce((l->>'credit')::numeric, 0);
  end loop;

  if v_d <> v_c then
    raise exception 'DIARIO_DESVIO: debito % <> credito %', v_d, v_c;
  end if;
  if v_d = 0 then
    raise exception 'DIARIO_LANCAMENTO_ZERADO';
  end if;

  -- toda conta usada precisa estar habilitada neste tenant
  select bool_and(exists (
    select 1 from tenant_accounts ta
     where ta.tenant_id = p_tenant and ta.code = (x->>'code') and ta.ativo
  )) into v_ok
  from jsonb_array_elements(p_lines) x;
  if v_ok is distinct from true then
    raise exception 'DIARIO_CONTA_NAO_HABILITADA';
  end if;

  insert into journal_entries
    (tenant_id, competencia, entry_date, source_type, source_id,
     description, document, cost_center_id, idempotency_key, created_by)
  values
    (p_tenant, p_competencia, current_date, p_source_type, p_source_id,
     p_description, p_document, p_cost_center, p_idem, auth.uid())
  returning id into v_entry;

  insert into journal_entry_lines (entry_id, tenant_id, code, debit, credit)
  select v_entry, p_tenant,
         x->>'code',
         coalesce((x->>'debit')::numeric, 0),
         coalesce((x->>'credit')::numeric, 0)
    from jsonb_array_elements(p_lines) x;

  return v_entry;
end $$;

revoke execute on function journal_post(uuid, date, text, uuid, text, text, uuid, jsonb, text) from public;
revoke execute on function journal_post(uuid, date, text, uuid, text, text, uuid, jsonb, text) from anon;
revoke execute on function journal_post(uuid, date, text, uuid, text, text, uuid, jsonb, text) from authenticated;
grant  execute on function journal_post(uuid, date, text, uuid, text, text, uuid, jsonb, text) to service_role;

revoke execute on function seed_chart_of_accounts(uuid) from public;
revoke execute on function seed_chart_of_accounts(uuid) from anon;
revoke execute on function seed_chart_of_accounts(uuid) from authenticated;
grant  execute on function seed_chart_of_accounts(uuid) to service_role;

revoke execute on function seed_cost_centers(uuid) from public;
revoke execute on function seed_cost_centers(uuid) from anon;
revoke execute on function seed_cost_centers(uuid) from authenticated;
grant  execute on function seed_cost_centers(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 9. Despesas fixas (ciclo administrativo)
-- ---------------------------------------------------------------------
create table if not exists expenses (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  competencia  date not null,
  description  text not null check (char_length(description) >= 3),
  account_code text not null references account_catalog(code) on delete restrict,
  cost_center_id uuid references cost_centers(id) on delete set null,
  amount       numeric(12,2) not null check (amount > 0),
  recurring    boolean not null default false,
  paid_at      date,
  created_by   uuid,
  created_at   timestamptz not null default now()
);

create index if not exists idx_expenses_mes on expenses(tenant_id, competencia);
alter table expenses enable row level security;

-- ---------------------------------------------------------------------
-- 10. DRE por competencia
--     classes 4 (credit-debit), 5 e 6 (debit-credit) ja saem com sinal certo.
-- ---------------------------------------------------------------------
create or replace view v_dre as
select
  e.tenant_id,
  date_trunc('month', e.competencia)::date as mes,
  a.classe,
  a.tipo,
  a.dre_grupo,
  a.code,
  a.name,
  sum(l.debit)  as total_debito,
  sum(l.credit) as total_credito,
  case
    when a.classe = 4 then sum(l.credit) - sum(l.debit)
    else sum(l.debit) - sum(l.credit)
  end as valor
from journal_entry_lines l
join journal_entries e   on e.id = l.entry_id and e.status <> 'estornado'
join account_catalog a   on a.code = l.code
where a.classe in (4, 5, 6)
group by 1, 2, 3, 4, 5, 6, 7;

comment on view v_dre is
  'DRE por competencia (mes), ja agrupada por secao da demonstracao (receita_bruta, deducoes_receita, custo_vendidos, despesa_operacional, outras_receitas, despesa_financeira, ir_csf).';

revoke select on v_dre from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 11. RLS - padrao do repo: leitura so para gestao, escrita so service_role
-- ---------------------------------------------------------------------
create policy "le plano padrao (authenticated)" on account_catalog
  for select to authenticated using (true);

create policy "le plano do tenant (gestao)" on tenant_accounts
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.id = auth.uid()
       and p.tenant_id = tenant_accounts.tenant_id
       and p.status = 'ativo'
       and p.role in ('master','gerente')
  ));

create policy "le centros de custo (gestao)" on cost_centers
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.id = auth.uid()
       and p.tenant_id = cost_centers.tenant_id
       and p.status = 'ativo'
       and p.role in ('master','gerente')
  ));

create policy "le diario (gestao)" on journal_entries
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.id = auth.uid()
       and p.tenant_id = journal_entries.tenant_id
       and p.status = 'ativo'
       and p.role in ('master','gerente')
  ));

create policy "le lancamentos (gestao)" on journal_entry_lines
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.id = auth.uid()
       and p.tenant_id = journal_entry_lines.tenant_id
       and p.status = 'ativo'
       and p.role in ('master','gerente')
  ));

create policy "le despesas (gestao)" on expenses
  for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.id = auth.uid()
       and p.tenant_id = expenses.tenant_id
       and p.status = 'ativo'
       and p.role in ('master','gerente')
  ));

-- ---------------------------------------------------------------------
-- 12. Semente para os tenants que ja existem (idempotente)
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select id from tenants loop
    perform seed_chart_of_accounts(t.id);
    perform seed_cost_centers(t.id);
  end loop;
end $$;
