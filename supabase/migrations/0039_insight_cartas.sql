-- 0039_insight_cartas.sql - "carta de insights com IA" (entrega 6, dashboard com IA).
--
-- Contexto (regra 19/10/2026 - staging primeiro):
--   * escopo acordado: o ERP JA calcula faturamento/margem/pedidos/contas/aging.
--     A entrega 6 e a CARTA da semana: o CODIGO calcula um JSON de indicadores
--     (regra de ouro), a IA (Gemini) so ESCREVE o texto com etiquetas {chave},
--     o codigo troca cada etiqueta pelo numero real e VALIDA (rejeita numero
--     solto fora de etiqueta ou etiqueta inexistente no JSON).
--   * e a MESMA IDEIA das cartas do prompt "Dashboard de gestão com IA", mas
--     sobre os dados que ja existem (orders, financial_installments, customers)
--     - sem planilha/funil/metas manuais novas (isso duplicaria o ERP).
--
-- Tabela:
--   * insight_cartas: 1 linha por carta gerada. `indicadores` guarda a FOTO
--     exata dos numeros usados (jsonb) e `texto` as secoes da carta (jsonb:
--     resumo/melhorou/piorou/atencao/faltam_dados/acoes). `status` e
--     completa|incompleta|falhou. Escrita so via service_role (a IA grava no
--     servidor); RLS leitura so master|gerente (mesmo padrao do financeiro
--     0008:179-204).
--
-- Nada de dependencia: e aditiva, nao mexe em tabela existente.

begin;

create table if not exists public.insight_cartas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  tipo text not null default 'semanal' check (tipo in ('semanal','mensal')),
  periodo_inicio date not null,
  periodo_fim date not null,
  -- foto exata dos numeros usados (a IA nunca calcula; so le este JSON)
  indicadores jsonb not null default '{}'::jsonb,
  -- secoes ja com etiquetas substituidas pelos numeros reais
  texto jsonb not null default '{}'::jsonb,
  status text not null default 'completa' check (status in ('completa','incompleta','falhou')),
  -- o que a conferencia rejeitou (etiqueta inexistente / numero solto), p/ log
  reprovados jsonb,
  enviada_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists insight_cartas_tenant_created_idx
  on public.insight_cartas (tenant_id, created_at desc);

-- RLS: leitura so gestao (master|gerente). Escrita NAO tem policy -> deny-all
-- (so service_role, que bypassa RLS, grava a carta pelo servidor).
alter table public.insight_cartas enable row level security;

drop policy if exists "le insight_cartas (gestao)" on public.insight_cartas;
create policy "le insight_cartas (gestao)"
  on public.insight_cartas for select to authenticated
  using (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('master','gerente') and p.status = 'ativo'
  ));

commit;
