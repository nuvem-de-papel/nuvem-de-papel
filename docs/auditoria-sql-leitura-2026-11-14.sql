-- Auditoria Nuvem de Papel — 14/11/2026
-- SQL de LEITURA para executar manualmente no painel Supabase (staging: cwfvxthfwbvpfjhsxpmc)
-- ATENÇÃO: apenas SELECT — não modifica dados

-- =============================================================================
-- 1. RLS por tabela em public (quantas com/sem RLS)
-- =============================================================================
select
  count(*) filter (where rowsecurity) as com_rls,
  count(*) filter (where not rowsecurity) as sem_rls,
  count(*) as total_tabelas
from pg_tables
where schemaname = 'public';

-- Esperado: total_tabelas = 43, sem_rls = 0 (todas protegidas após 0020)

-- =============================================================================
-- 2. Tabelas sem RLS (lista — deve estar vazia)
-- =============================================================================
select tablename
from pg_tables
where schemaname = 'public' and not rowsecurity
order by tablename;

-- Esperado: 0 linhas (todas as tabelas de public têm RLS)

-- =============================================================================
-- 3. Funções SECURITY DEFINER sem search_path (vulnerabilidade search_path)
-- =============================================================================
select
  p.proname as funcao,
  n.nspname as schema,
  case
    when pg_get_functiondef(p.oid) ~ 'search_path' then 'OK (tem search_path)'
    else 'VULNERÁVEL (sem search_path)'
  end as status
from pg_proc p
join pg_namespace n on p.pronamespace = n.oid
where p.prosecdef = true -- SECURITY DEFINER
  and n.nspname = 'public'
order by funcao;

-- Esperado após 0041: todas as linhas com "OK (tem search_path)"
-- Se alguma mostrar "VULNERÁVEL", a 0041 não foi aplicada ou está incompleta

-- =============================================================================
-- 4. Grants para anon/authenticated em tabelas sensíveis
-- =============================================================================
select
  grantee,
  table_name,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.table_privileges
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'tenants', 'profiles', 'financial_titles', 'financial_settlements',
    'caixa_sessions', 'caixa_movements', 'journal_entries', 'journal_entry_lines',
    'expenses', 'sefaz_config', 'tenant_company', 'nfe_emissoes',
    'bank_extratos', 'bank_linhas', 'cobranca_envios', 'cart_recovery_sends'
  )
group by grantee, table_name
order by table_name, grantee;

-- Esperado:
-- - RLS deny-all → anon/authenticated NÃO devem ter INSERT/UPDATE/DELETE
-- - SELECT pode existir (RLS filtra), mas escrita é proibida

-- =============================================================================
-- 5. Policies por tabela (cobertura de RLS)
-- =============================================================================
select
  tablename,
  count(*) as num_policies,
  string_agg(policyname, ', ' order by policyname) as policies
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;

-- Tabelas com 0 policies + RLS ligado = deny-all (correto para escrita service-only)
-- Tabelas operacionais (orders, catalog_items, customers) devem ter >= 2 policies

-- =============================================================================
-- 6. CNPJ emitente em tenant_company (conflito conhecido #2)
-- =============================================================================
select
  cnpj,
  regime,
  razao_social,
  ie,
  cidade,
  uf
from tenant_company
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- Verificar: CNPJ é 09050756000110 (Mania de Modas, staging)
-- ou outro (emitente E2E 11222333000181)?

-- =============================================================================
-- 7. Source_type de financial_titles (conflito conhecido #7 — venda web)
-- =============================================================================
select
  source_type,
  count(*) as quantidade,
  sum(amount) as total
from financial_titles
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
group by source_type
order by source_type;

-- Verificar: existe source_type = 'web' ou 'loja'?
-- Se não existir, venda web cai direto em caixa (sem título).

-- =============================================================================
-- 8. Orders: quantos são de canal 'web' e qual status?
-- =============================================================================
select
  status,
  count(*) as quantidade,
  sum(total) as total_pedidos
from orders
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
  and channel = 'web'
group by status
order by status;

-- Verificar: pedidos 'aguardando_pagamento' existem?
-- (conflito #6 — checkout exige login, mas deveria permitir visitante)

-- =============================================================================
-- 9. Migrations aplicadas (últimas 10)
-- =============================================================================
-- Nota: Supabase não expõe schema_migrations por padrão.
-- Alternativa: verificar existência de objetos criados pelas últimas migrations.

-- 0051: grade_variantes
select exists(
  select 1 from pg_tables
  where schemaname = 'public' and tablename = 'product_variants'
) as migration_0051_aplicada;

-- 0052: grade_blt38_teste (seed de teste BLT38?)
select count(*) as blt38_cadastrados
from catalog_items
where sku ilike 'BLT38%';

-- 0053: oferta_destaque (coluna em_oferta, em_destaque?)
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'catalog_items'
  and column_name in ('em_oferta', 'em_destaque', 'grupo_pai')
order by column_name;

-- =============================================================================
-- 10. Contagem de RLS confirmada (invariante pós-0020)
-- =============================================================================
select
  count(*) as tabelas_public,
  count(*) filter (where rowsecurity) as com_rls,
  count(*) - count(*) filter (where rowsecurity) as sem_rls_CRITICO
from pg_tables
where schemaname = 'public';

-- Esperado: sem_rls_CRITICO = 0
-- Se > 0, nova tabela foi criada sem RLS (violação da regra 0020)

-- =============================================================================
-- 11. Auditoria: últimos 10 eventos
-- =============================================================================
select
  event_type,
  actor_id,
  created_at,
  event_data->'after' as dados
from audit_log
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
order by created_at desc
limit 10;

-- Verificar: eventos recentes batem com o trabalho feito hoje?

-- =============================================================================
-- FIM — Copiar resultados para o relatório de auditoria
-- =============================================================================
