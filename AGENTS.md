# AGENTS.md

## Custom Instructions: ADHD-Friendly Output

O desenvolvedor lendo isso tem TDAH. Formate TODAS as respostas para que um cérebro com TDAH possa agir imediatamente.

**Regras Absolutas:**
1. **Comece com a próxima ação:** A primeira linha DEVE ser um comando, caminho ou snippet de código. Zero preâmbulos.
2. **Numere tarefas com múltiplas etapas:** Use listas numeradas curtas. Um passo = uma ação isolada. Máximo de 5 itens por lista.
3. **Seja Direto:** Sem frases de cordialidade. Remova fechamentos vazios.
4. **Estimativas Exatas:** Dê estimativas de tempo específicas (minutos).
5. **Estado Visível:** Reafirme o progresso e externalize o estado a cada interação.

## Ambientes — dev/staging vs produção

| Ambiente | Pasta local | Branch git | Banco/Backend | Deploy |
|---|---|---|---|---|
| Produção | `F:\Projetos\nuvem-de-papel` | `main` | Supabase `zychcqlvfblwmibfnold` (nuvem-de-papel) | Vercel Production — dispara em push/merge em `main` |
| Staging/dev | `F:\Projetos\nuvem-de-papel-staging` | `staging` (ou qualquer branch != `main`) | Supabase `wvdvyglbunsquauxdqxj` (nuvem-de-papel-staging) | Vercel Preview — dispara em push de qualquer branch != `main` |

Repositório único: https://github.com/nuvem-de-papel/nuvem-de-papel

## Fluxo obrigatório para qualquer mudança de código ou de banco

1. Trabalhar sempre na pasta de staging/dev (`nuvem-de-papel-staging`), nunca editar direto na pasta de produção.
2. Validar local primeiro (`npm run build`, `npm run lint`, `npm run type-check`).
3. Commit + push numa branch nova (ou na branch `staging`), nunca direto em `main`.
4. Mudança em migrations — testar primeiro contra o banco de staging (`wvdvyglbunsquauxdqxj`), nunca contra produção diretamente.
5. Só depois de validado, fazer merge em `main` — esse é o único gatilho que deve tocar produção de verdade.

Essa regra vale para qualquer IA ou pessoa trabalhando neste projeto a partir desta data, mesmo sem ser lembrada a cada tarefa.

Merge é local, sem PR no GitHub: com CI verde, `git fetch` → `git merge origin/staging` na pasta de produção → `git push origin main` (Vercel deploya).

## Regras permanentes de sessão (auto-aplicáveis)

Valem para qualquer sessão/IA, mesmo sem ser lembradas na conversa:

1. **Validação antes de qualquer commit** — toda alteração é feita e validada em `F:\Projetos\nuvem-de-papel-staging`: `npm run type-check` → `npm run lint` → `npm run build`, com o dev server **parado** antes do build (build com dev aberto corrompe `.next` e gera erro de módulo ausente).
2. **Migrations — conferir a numeração na pasta antes de criar** — listar `supabase/migrations/` e usar o próximo número disponível; nunca confiar em memória de sessão anterior. A migration nasce e é testada no staging; o mesmo SQL vai para produção só depois de validada.
3. **Este arquivo faz parte da entrega** — toda decisão/padrão novo relevante (regra de ambiente, fluxo, arquitetura, paleta, convenção) entra neste AGENTS.md **no mesmo commit** da mudança de código. Editou algo relevante → atualizou este arquivo → commit junto.
4. **Documentação viva** — decisões relevantes ficam em arquivos `.md` (ex.: paleta e mockups em `F:\Projetos\nuvem-de-papel-documentacao\`); comentário datado no código só em pontos não-óbvios, mínimo e com contexto.
5. **CI obrigatória** — todo push roda `.github/workflows/ci.yml` (lint → type-check → build). CI vermelha = não fazer merge.

## Stack

Next.js (App Router) + TypeScript + Supabase/PostgreSQL + Vercel + Mercado Pago + Docker + Ngrok.

## Regras de modelagem de dados (definidas no parecer de migração ConnectionCyber)

Aplicadas desde a primeira migration, para permitir migração futura sem dano estrutural
para uma plataforma ERP multi-tenant maior, se e quando decidido:

1. Todo ID é UUID v4 (`gen_random_uuid()`) — nunca serial/auto-incremento.
2. Toda tabela de negócio carrega `tenant_id uuid not null` — mesmo com 1 tenant único hoje
   (`00000000-0000-0000-0000-000000000001` = Nuvem de Papel), nunca assume loja única no schema.
3. Catálogo separado em 3 blocos: `catalog_items` (dado central) / `item_fiscal_data` (NCM, CST,
   ICMS, IPI) / `item_commercial_data` (custo, margem, estoque mínimo) — nunca achatado numa
   tabela só.
4. Preço/catálogo carrega `channel` (`varejo` | `atacado`), default `varejo`.
5. Identidade visual do tenant fica em `tenant_branding.branding_tokens jsonb` — paleta,
   tipografia, raio, sombra como JSON estruturado, nunca CSS solto ou coluna única de cor.

Migrations em `supabase/migrations/NNNN_*.sql`, com `preflight/`, `rollback/`, `tests/`
correspondentes por número — mesmo padrão de governança documentado no parecer de migração.
