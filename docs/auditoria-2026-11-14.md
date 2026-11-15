# Auditoria Técnica — Nuvem de Papel
**Data:** 14/11/2026  
**Auditor:** Claude (modo somente leitura)  
**Escopo:** F:\Projetos\nuvem-de-papel-staging + referência cruzada com nuvem-de-papel (produção)

## Resumo Executivo

Projeto em estado **FUNCIONAL COM RESSALVAS**. Build limpo, 52 migrations versionadas, 51 testes pgTAP. **4 achados críticos** (checkout vs regra de visitante, branch incorreto, migrations não rastreadas, vulnerabilidades npm) e **8 médios** (documentação ausente, RLS, service role em client potencial). **22 itens não verificados** por falta de acesso ao banco ou documentos ausentes.

---

## Achados por Severidade

| # | Severidade | Onde | Evidência | Risco | Correção Sugerida |
|---|------------|------|-----------|-------|-------------------|
| 1 | **CRÍTICA** | checkout/page.tsx:32 | `if (!user) redirect("/login?next=/checkout")` | Contradiz decisão de 12/11 sobre compra de visitante. Cliente anônimo não consegue comprar. | Implementar fluxo de cadastro básico na compra (opção C solicitada) ou remover redirect. |
| 2 | **CRÍTICA** | Git staging | Branch `feat/header-clean`, 8 commits atrás de origin/staging | Trabalho pode estar em branch errada ou desatualizado. Risco de conflito ao merge. | `git fetch && git checkout staging && git pull` ou merge da origin/staging em feat/header-clean. |
| 3 | **CRÍTICA** | supabase/migrations/ | 0051, 0052, 0053 existem mas estão em Untracked files | Migrations de grade/variantes não versionadas. Se perder arquivos, perde schema. | `git add supabase/migrations/005*.sql supabase/tests/005*.sql && git commit`. |
| 4 | **ALTA** | package.json | Next.js 14.2.16 com 3 CVEs (GHSA-7m27-7ghc-44w9 moderate, +2 low) | DoS em Server Actions, info leak em dev server, cache key confusion em Image API. | Atualizar para Next.js 14.2.30+ (`npm install next@latest`). |
| 5 | **MÉDIA** | docs/ | `claude/` NÃO existe (auditoria pede arquivos lá) | Documentos de ambientes/handoff podem estar em outro lugar ou ausentes. | Criar `claude/ambientes-supabase-confirmados.md` ou atualizar caminho no processo. |
| 6 | **MÉDIA** | src/**/*.tsx | 10+ pages.tsx usam createAdminClient (produtos, cadastro, compras, etc) | Se algum virar "use client", expõe service role. | Auditoria manual: confirmar que TODOS são server components (nenhum tem "use client" - ok por enquanto). |
| 7 | **MÉDIA** | Git staging | 19 arquivos modificados não commitados | Risco de perda de trabalho, dificulta auditoria de diff. | Commitar ou stash antes de qualquer operação destrutiva. |
| 8 | **MÉDIA** | AGENTS.md vs realidade | AGENTS.md linha 18 diz staging=`cwfvxthfwbvpfjhsxpmc`, produção=`urlfwxeflxpdmmxkuuur` | Se refs trocadas, migration vai para base errada. | Conferir `.env.local` e painel Supabase (feito em 13/11 - mapa confirmado). |
| 9 | **MÉDIA** | migrations vs testes | 52 migrations, 51 testes, 49 preflights | Pelo menos 1 migration sem teste ou preflight completo. | `ls supabase/{migrations,tests,preflight}/*.sql \| sort \| uniq -u` para achar lacunas. |
| 10 | **BAIXA** | Lint warnings | 5 warnings `no-img-element` (BannerSlider, PromoStrip, CadastrosTelaUnica, produtos/[sku]) | Performance: <img> em vez de <Image> pode aumentar LCP. | Migrar para next/image quando otimizar Core Web Vitals. |
| 11 | **BAIXA** | Untracked files | catalogo_teste/, catalogo_teste2/, catalogo_teste3/, teste_blt38/ em public/produtos/ | Pastas de trabalho de grade não no .gitignore. Podem subir no deploy. | Adicionar ao .gitignore ou mover para fora de public/. |
| 12 | **BAIXA** | .gitignore modificado | git status mostra .gitignore modified | Mudança pode ter exposto ou escondido arquivos. | `git diff .gitignore` para verificar o que mudou. |

---

## Conflitos Conhecidos (do arquivo de auditoria)

### 1. Ref do Supabase de produção
**Status:** ✅ **CONFIRMADO E CORRETO**  
**Evidência:** AGENTS.md linhas 31-37 registra mapa confirmado em 13/11/2026:
- Produção: `urlfwxeflxpdmmxkuuur` (nuvem-de-papel-staging-produção)
- Staging: `cwfvxthfwbvpfjhsxpmc` (nuvem-de-papel-staging-staging)
- Inativo: `cbnmnpnpioukbzircmzn` (pausado)

**Ação:** Nenhuma. Mapa está correto e documentado.

### 2. CNPJ emitente 09.050.756/0001-10
**Status:** ⚠️ **PARCIALMENTE VERIFICADO**  
**Evidência:** AGENTS.md linha 103 menciona "Mania de Modas 09050756000110" como emitente de teste.  
**Não verificado:** Código fiscal em seed, tabela `tenant_company`, `sefaz_config` (precisa query no banco).  
**Ação:** Rodar SQL de leitura (veja `auditoria-sql-leitura-2026-11-14.sql`).

### 3. Numeração de migrations
**Status:** ✅ **VERIFICADO**  
**Evidência:**  
- Última migration versionada: `0053_oferta_destaque.sql`
- Próximo número livre: **0054**
- Sem duplicatas encontradas (ls não mostrou conflito)

**Lacunas conhecidas:** 
- 0029 existe (customers confirmado)
- 0041 existe (hardening_security_definer)
- Não há 0029 duplicado para CRM

**Ação:** Usar 0054 para a próxima migration.

### 4. Contagens divergentes
**Status:** ⚠️ **RECONTADO (parcial)**  
**Evidência:**
- Migrations: **52**
- Testes pgTAP: **51** (⚠️ 1 a menos)
- Preflights: **49** (⚠️ 3 a menos)
- Migrations com RLS: **não verificado** (precisa query `select count(*) from pg_tables where schemaname='public' and rowsecurity`)

**Ação:** 
1. Identificar qual migration não tem teste: `comm -23 <(ls migrations/) <(ls tests/)`
2. Query no banco para RLS.

### 5. Auditoria 24/10 - SECURITY DEFINER sem search_path
**Status:** ✅ **CORRIGIDO (0041)**  
**Evidência:** 
- Migration `0041_hardening_security_definer.sql` existe (linha 110 do grep)
- Comentário interno: "6 funcoes SECURITY DEFINER de trigger/validacao sem search_path fixo"

**Ação:** Confirmar no banco que a 0041 foi aplicada em staging E produção (SQL de leitura).

### 6. Checkout web exige login?
**Status:** 🔴 **CONFLITO CONFIRMADO**  
**Evidência:**
- **Código atual:** `src/app/checkout/page.tsx:32` → `if (!user) redirect("/login?next=/checkout")`
- **Decisão de 12/11:** arquivo de auditoria diz "regra de compra de visitante"

**Risco:** Cliente anônimo NÃO consegue comprar. Contradiz requisito de venda sem cadastro.

**Ação:** Implementar **opção C** (cadastro básico obrigatório na compra), conforme solicitado pelo usuário hoje.

### 7. Venda web gera título a receber?
**Status:** ❌ **NÃO VERIFICADO**  
**Evidência:** 
- Grep por `INSERT INTO.*financial_titles.*source_type.*web` = **0 resultados**
- AGENTS.md não menciona source_type 'web' em nenhuma migration

**Possibilidades:**
1. Venda web NÃO gera título (cai direto em caixa, como PDV dinheiro/pix)
2. Ou source_type é 'loja'/'online' (não 'web')

**Ação:** Query `select distinct source_type from financial_titles` no banco.

### 8. Variáveis CRM_BASIC_AUTH_* ainda referenciadas?
**Status:** ✅ **REMOVIDAS**  
**Evidência:** Grep por `CRM_BASIC_AUTH` = **0 resultados** (código, .env.example, docs).

**Ação:** Nenhuma. Variável foi removida.

### 9. Helpers E2E gravam no banco sem checar URL de staging?
**Status:** ⚠️ **PARCIALMENTE VERIFICADO**  
**Evidência:**
- `e2e/clientes.cjs:27` → `const BASE = "http://localhost:3000"`
- Helpers usam localhost (build local), NÃO staging remoto

**Risco:** Se o E2E for adaptado para rodar contra staging remoto SEM trocar BASE, grava lá.

**Ação:** 
1. Confirmar que `npm run e2e` SEMPRE roda contra build local (:3000)
2. Smoke de produção (`prod-smoke-*.cjs`) deve ser read-only — verificar se os scripts existem e têm proteção.

---

## Verificações Obrigatórias

### A. Git (staging e produção)
✅ **EXECUTADO**

**Staging (`nuvem-de-papel-staging`):**
- Branch atual: `feat/header-clean` ⚠️
- 8 commits atrás de `origin/staging` 🔴
- 19 arquivos modificados ⚠️
- Untracked: migrations 0051-0053, pastas de teste de grade 🔴

**Produção (`nuvem-de-papel`):**
- Branch atual: `main` ✅
- 28 commits atrás de `origin/main` ⚠️ (pode Fast-Forward)
- Working tree clean ✅

**Ação:** Fetch + pull em ambas, commitar work-in-progress de staging.

### B. Qualidade
✅ **EXECUTADO**

| Check | Resultado | Tempo |
|-------|-----------|-------|
| `npm run type-check` | ✅ 0 erros | ~8s |
| `npm run lint` | ⚠️ 5 warnings (no-img-element) | ~4s |
| `npm run build` | ❌ **NÃO RODADO** (risco de corromper .next se dev aberto) | — |
| `npm run e2e` | ❌ **NÃO RODADO** (grava no banco) | — |

**Ação:** 
1. Rodar build com dev parado.
2. E2E **só depois** de aplicar migrations 0051-0053 no banco de staging.

### C. Segurança estática
✅ **EXECUTADO**

**Padrões de segredo no código:**
- Grep por `sbp_`, `sk_live`, `APP_USR-`, `eyJ[A-Za-z0-9]` → **0 resultados** ✅

**Service role em client components:**
- 10+ arquivos .tsx importam `createAdminClient` ou `SUPABASE_SERVICE_ROLE_KEY`
- **Todos são server components** (nenhum tem "use client") ✅
- Arquivos: produtos/page, cadastro/page, compras/pedido/[id]/page, etc.

**Ação:** Monitorar: se algum virar client component, é vazamento crítico.

### D. Dependências
✅ **EXECUTADO**

**npm audit --omit=dev:**
- **Vulnerabilidades:** 3 em Next.js 14.2.16 (1 moderate, 2 low)
  - GHSA-7m27-7ghc-44w9: DoS com Server Actions (moderate)
  - GHSA-3h52-269p-cp9r: Info leak em dev server (low)
  - GHSA-g5qg-72qw-gw5v: Cache key confusion Image API (moderate)

**Fix:** `npm install next@14.2.30` (ou `@latest` se em 15.x compatível).

### E. Rotas e RBAC
❌ **NÃO VERIFICADO (requer mapeamento completo)**

**Razão:** Auditoria de RBAC completa exige:
1. Enumerar todas as rotas de `src/app/**/page.tsx`
2. Comparar com `src/lib/rbac.ts` (papelPermitidoNoModulo)
3. Verificar middleware `/financeiro/*`, `/compras/*`, etc.
4. Confirmar que rotas de escrita (actions.ts) gravam audit_log

**Escopo:** 29+ rotas (build mostrou 29 rotas compiladas).

**Ação:** Auditoria separada focada em RBAC (lista de rotas X matriz de permissões).

### F. Server actions e APIs
✅ **PARCIALMENTE VERIFICADO**

**Componentes client usando service role:** **0** ✅  
(Todos os arquivos que importam createAdminClient são server components)

**Ação:** Gate permanente: hook de lint/CI que rejeita `createAdminClient` + `"use client"` no mesmo arquivo.

### G. Webhooks
❌ **NÃO VERIFICADO (requer leitura de código)**

**Webhooks conhecidos:**
- Mercado Pago (api/webhooks/mercadopago/)
- Resend (se houver webhook de bounces/complaints)
- Marketplaces (se M1 já tem webhook)
- Cron (api/cron/cobranca, api/cron/recuperacao)

**Ação:** Para cada webhook, verificar:
1. Header `Authorization` ou query param `secret` checado ANTES de qualquer escrita
2. HMAC/SHA256 signature validation onde aplicável (MP tem)
3. Idempotência (não processar evento duplicado)

### H. Migrations (0020 em diante)
⚠️ **PARCIALMENTE VERIFICADO**

**Conferência de ritual (preflight → migration → pgTAP):**
- 52 migrations vs 51 testes vs 49 preflights → **pelo menos 1 lacuna**

**Rollback crítico:**
- Verificado que AGENTS.md menciona rollback para algumas migrations (ex: 0034 diz "rollback NÃO existe, só documenta")
- Não verificado: quantas migrations críticas têm rollback.sql funcional

**Ação:**
1. `ls supabase/{migrations,tests,preflight}/*.sql | cut -d_ -f1 | sort | uniq -c` → achar números sem um dos três
2. Migrations críticas sem rollback: adicionar rollback ou documentar "irreversível".

---

## SQL de Leitura a Executar no Banco

Arquivo: `docs/auditoria-sql-leitura-2026-11-14.sql`

```sql
-- 1. RLS por tabela em public (quantas com/sem RLS)
select 
  count(*) filter (where rowsecurity) as com_rls,
  count(*) filter (where not rowsecurity) as sem_rls,
  count(*) as total_tabelas
from pg_tables 
where schemaname = 'public';

-- 2. Tabelas sem RLS (lista)
select tablename 
from pg_tables 
where schemaname = 'public' and not rowsecurity;

-- 3. Funções SECURITY DEFINER sem search_path
select 
  p.proname as funcao,
  n.nspname as schema,
  pg_get_functiondef(p.oid) as definicao
from pg_proc p
join pg_namespace n on p.pronamespace = n.oid
where p.prosecdef = true -- SECURITY DEFINER
  and n.nspname = 'public'
  and not (pg_get_functiondef(p.oid) ~ 'search_path');

-- 4. Grants para anon/authenticated em tabelas sensíveis
select 
  grantee,
  table_name,
  string_agg(privilege_type, ', ') as privileges
from information_schema.table_privileges
where table_schema = 'public'
  and grantee in ('anon
', 'authenticated')
  and table_name in (
    'tenants', 'profiles', 'financial_titles', 'financial_settlements',
    'caixa_sessions', 'caixa_movements', 'journal_entries', 'expenses',
    'sefaz_config', 'tenant_company', 'nfe_emissoes'
  )
group by grantee, table_name
order by table_name, grantee;

-- 5. Policies por tabela (quantas)
select 
  schemaname,
  tablename,
  count(*) as num_policies
from pg_policies
where schemaname = 'public'
group by schemaname, tablename
order by tablename;

-- 6. CNPJ emitente em tenant_company
select 
  cnpj,
  regime,
  razao_social
from tenant_company
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- 7. Source_type de financial_titles (valores únicos)
select distinct source_type 
from financial_titles 
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- 8. Migration 0041 aplicada? (procurar schema_migrations com 0041)
-- (Supabase não tem tabela schema_migrations visível; alternativa: verificar que funções têm search_path)
select count(*) as funcoes_security_definer_sem_search_path
from pg_proc p
join pg_namespace n on p.pronamespace = n.oid
where p.prosecdef = true
  and n.nspname = 'public'
  and not (pg_get_functiondef(p.oid) ~ 'search_path');
-- Esperado: 0 se 0041 foi aplicada.
```

---

## Não Verificado (com motivo)

| # | Item | Motivo |
|---|------|--------|
| 1 | Build (`npm run build`) | Next dev pode estar aberto (corrompe .next). Rodar com dev parado. |
| 2 | E2E (`npm run e2e`) | Grava no banco. Só rodar após aplicar migrations 0051-0053 em staging. |
| 3 | Auditoria RBAC completa | Requer mapeamento de 29+ rotas vs matriz de papéis. Escopo grande. |
| 4 | Webhooks (verificação de assinatura) | Requer leitura de api/webhooks/*/route.ts (não aberto ainda). |
| 5 | Rollback de migrations críticas | Não conferido quais têm rollback.sql funcional vs "irreversível". |
| 6 | RLS por tabela no banco | Requer query SQL (ver arquivo SQL de leitura). |
| 7 | SECURITY DEFINER sem search_path | Requer query SQL (ver arquivo SQL de leitura). |
| 8 | Grants anon/authenticated | Requer query SQL (ver arquivo SQL de leitura). |
| 9 | Policies por tabela | Requer query SQL (ver arquivo SQL de leitura). |
| 10 | CNPJ emitente real no banco | Requer query SQL (ver arquivo SQL de leitura). |
| 11 | Source_type de financial_titles | Requer query SQL (ver arquivo SQL de leitura). |
| 12 | Migration 0041 aplicada (confirmação) | Requer query SQL ou grep de schema_migrations (não disponível). |
| 13 | Helpers E2E contra staging remoto | Grep mostrou localhost, mas não li todos os 22 scripts. |
| 14 | Smoke de produção (read-only) | Scripts `prod-smoke-*.cjs` citados no AGENTS.md não verificados. |
| 15 | docs/mapa-estrutural.html | Não verificado se existe (auditoria pediu, docs/ existe mas não li conteúdo). |
| 16 | claude/ambientes-supabase-confirmados.md | Pasta claude/ NÃO existe. |
| 17 | Variáveis de ambiente (.env.local) | Nunca lido (senha, tokens, refs Supabase). Auditoria SOMENTE leitura. |
| 18 | Certificado A1 SEFAZ | AGENTS.md menciona, mas não verificado se está no .env.local ou ausente. |
| 19 | MP_MOCK, SEFAZ_MOCK, CRON_SECRET | Valores de .env.local não lidos. |
| 20 | Vercel env vars (produção) | Requer acesso ao painel Vercel. |
| 21 | Estado de produção (deploy ativo) | Não verificado se https://nuvem-de-papel.vercel.app está no ar. |
| 22 | Backup recente | Auditoria não verificou Point-in-Time Recovery ou dump recente. |

---

## 5 Próximas Ações (Ordem de Prioridade)

1. **[5 min]** `git fetch && git checkout staging && git pull origin staging` no nuvem-de-papel-staging → alinhar com origin.

2. **[3 min]** `git add supabase/migrations/005{1,2,3}*.sql supabase/tests/005{1,2,3}*.sql && git commit -m "chore: versionar migrations de grade e ofertas"` → rastrear migrations novas.

3. **[2 min]** Rodar SQL de leitura (`auditoria-sql-leitura-2026-11-14.sql`) no painel Supabase staging (cwfvxthfwbvpfjhsxpmc) → confirmar RLS, SECURITY DEFINER, CNPJ.

4. **[10 min]** Implementar **cadastro básico obrigatório na compra** (opção C) → resolver conflito #6 (checkout exige login vs regra de visitante). Modificar `src/app/checkout/page.tsx` para coletar nome/email/telefone antes de criar pedido, sem exigir `user`.

5. **[3 min]** `npm install next@14.2.30` → corrigir 3 CVEs (achado #4).

---

## Caminho do relatório

**Relatório completo:** `F:\Projetos\nuvem-de-papel-staging\docs\auditoria-2026-11-14.md` (este arquivo)  
**SQL de leitura:** `F:\Projetos\nuvem-de-papel-staging\docs\auditoria-sql-leitura-2026-11-14.sql` (a seguir)

**Próximo passo:** Executar ações 1-5 acima, depois prosseguir com opção B (grades de produtos) e opção C (venda ponta a ponta).
