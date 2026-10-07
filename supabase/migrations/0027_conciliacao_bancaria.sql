-- 0027_conciliacao_bancaria.sql - Conciliacao bancaria (M1).
-- Importacao de extrato (OFX/CSV) + conferencia linha a linha contra as
-- liquidacoes de titulo e as despesas pagas do sistema. Era o ultimo
-- componente da lista de DRE que estava em 0 (auditoria 06/10).
--
-- Regras:
--   * conciliacao e CONTROLE, nao contabilidade: nenhum lancamento novo no
--     diario (o livro continua sendo o dos gatilhos da 0021-0023);
--   * o extrato entra com o sinal do banco (entrada +, saida -);
--   * dedupe entre importacoes pelo FITID do OFX (unique parcial) - o
--     arquivo reexportado nao duplica linha;
--   * ref_tipo/ref_id nao tem FK de proposito: os alvos (financial_settlements,
--     expenses) podem sumir na limpeza de homologacao e a linha conciliada
--     vira registro historico - mesmo criterio do source_id do 0008;
--   * escrita so pelo servidor (service role, igual as demais server
--     actions); RLS de leitura gestao (master/gerente) igual ao 0008.

create table if not exists bank_extratos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  fonte text not null default 'csv' check (fonte in ('ofx', 'csv')),
  arquivo_nome text,
  competencia date not null,
  linhas_total integer not null default 0 check (linhas_total >= 0),
  linhas_novas integer not null default 0 check (linhas_novas >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (linhas_novas <= linhas_total)
);

create table if not exists bank_linhas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  extrato_id uuid not null references bank_extratos(id) on delete cascade,
  seq integer not null check (seq > 0),
  data date not null,
  descricao text not null,
  valor numeric(12,2) not null,        -- sinal do banco: entrada +, saida -
  fitid text,                          -- identificador do banco (OFX) p/ dedupe
  status text not null default 'pendente'
    check (status in ('pendente', 'conciliada', 'ignorada')),
  ref_tipo text check (ref_tipo in ('liquidacao', 'despesa')),
  ref_id uuid,
  conciliada_em timestamptz,
  conciliada_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, extrato_id, seq),
  -- conciliada so com vinculo; pendente/ignorada so sem vinculo
  check ((status = 'conciliada') = (ref_tipo is not null and ref_id is not null))
);

create index if not exists idx_bank_linhas_status
  on bank_linhas(tenant_id, status, data);
create index if not exists idx_bank_linhas_mes
  on bank_linhas(tenant_id, data);

-- mesmo movimento nao entra duas vezes (FITID do banco)
create unique index if not exists uq_bank_linhas_fitid
  on bank_linhas(tenant_id, fitid)
  where fitid is not null;

alter table bank_extratos enable row level security;
alter table bank_linhas enable row level security;

create policy "le extratos (gestao)"
  on bank_extratos for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente')
      and p.status = 'ativo'
  ));

create policy "le linhas (gestao)"
  on bank_linhas for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente')
      and p.status = 'ativo'
  ));
