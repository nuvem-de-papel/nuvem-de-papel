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
| Produção | `F:\Projetos\nuvem-de-papel` | `main` | Supabase `cbnmnpnpioukbzircmzn` (nuvem-de-papel) | Vercel Production — dispara em push/merge em `main` |
| Staging/dev | `F:\Projetos\nuvem-de-papel-staging` | `staging` (ou qualquer branch != `main`) | Supabase `urlfwxeflxpdmmxkuuur` (nuvem-de-papel-staging) | Vercel Preview — dispara em push de qualquer branch != `main` |

Repositório único: https://github.com/nuvem-de-papel/nuvem-de-papel

Migrations aplicadas via Management API do Supabase com o helper da sessão
30/09/2026: `& "C:\Users\joaqu\AppData\Local\Temp\opencode\supabase-query-pat.ps1" -ProjectRef <ref> -SqlFile <arquivo>`
(staging `urlfwxeflxpdmmxkuuur`, produção `cbnmnpnpioukbzircmzn`). O token do
Supabase CLI no CredMan está **sem escopo `database_read`** (403) — usar o
helper de PAT (`sbp_…` salvo em `sbp-token.txt` no temp da sessão), não o
`supabase-query.ps1` original. Antes de criar a próxima, conferir a numeração
real em `supabase/migrations/`.

## Fluxo obrigatório para qualquer mudança de código ou de banco

1. Trabalhar sempre na pasta de staging/dev (`nuvem-de-papel-staging`), nunca editar direto na pasta de produção.
2. Validar local primeiro (`npm run type-check` → `npm run lint` → `npm run build` → `npm run e2e`).
3. Commit + push na branch `staging`, nunca direto em `main`.
4. Mudança em migrations — aplicar/testar primeiro no banco de staging (`urlfwxeflxpdmmxkuuur`), e **sempre aplicar em produção (preflight → migration → pgTAP) ANTES do merge** que deploya.
5. Só depois de validado, fazer merge em `main` — esse é o único gatilho que deve tocar produção de verdade.

Push ao GitHub: `gh`/credential manager desta máquina estão logados numa conta **sem acesso** ao repo — usar o credential helper one-off com PAT do cliente (forma documentada na sessão; o token fica fora do repo, nunca commitar). Repos antigos `satcyber003-sketch/nuvem-de-papel` são obsoletos.

Essa regra vale para qualquer IA ou pessoa trabalhando neste projeto a partir desta data, mesmo sem ser lembrada a cada tarefa.

Merge é local, sem PR no GitHub: com CI verde, `git fetch` → `git merge origin/staging` na pasta de produção → `git push origin main` (Vercel deploya).

## Regras permanentes de sessão (auto-aplicáveis)

Valem para qualquer sessão/IA, mesmo sem ser lembradas na conversa:

1. **Validação antes de qualquer commit** — toda alteração é feita e validada em `F:\Projetos\nuvem-de-papel-staging`: `npm run type-check` → `npm run lint` → `npm run build`, com o dev server **parado** antes do build (build com dev aberto corrompe `.next` e gera erro de módulo ausente).
2. **Migrations — conferir a numeração na pasta antes de criar** — listar `supabase/migrations/` e usar o próximo número disponível; nunca confiar em memória de sessão anterior. A migration nasce e é testada no staging; o mesmo SQL vai para produção só depois de validada.
3. **Este arquivo faz parte da entrega** — toda decisão/padrão novo relevante (regra de ambiente, fluxo, arquitetura, paleta, convenção) entra neste AGENTS.md **no mesmo commit** da mudança de código. Editou algo relevante → atualizou este arquivo → commit junto.
4. **Documentação viva** — decisões relevantes ficam em arquivos `.md` (ex.: paleta e mockups em `F:\Projetos\nuvem-de-papel-documentacao\`); comentário datado no código só em pontos não-óbvios, mínimo e com contexto.
5. **CI obrigatória** — todo push roda `.github/workflows/ci.yml` (lint → type-check → build). CI vermelha = não fazer merge. Watch com `gh run watch <id> --exit-status` (rodar com workdir dentro do repo).

## Testes

1. **pgTAP** por migration: `supabase/tests/NNNN_test.sql` (+ `preflight/` e `rollback/`). A query API devolve só o último result set → acumular asserts em `create temp table _out (line text)` e devolver `count(*)/falhas` na última linha. Gate = `falhas = 0`.
2. **E2E Playwright** (`playwright-core`, canal `msedge`, `.env.local` lido por `lerEnv()`): `npm run e2e` roda `f2…f6 + email + vendas` — contagem atual **184/184**. Servidor local: build parado na 3000 → `npm run start` → suite → matar porta 3000. Base de helpers: `e2e/vendas.cjs` (nav do painel) e `e2e/email.cjs` (criar usuário de teste).
3. Smokes de produção (só leitura) ficam em `C:\Users\joaqu\AppData\Local\Temp\opencode\e2e-f2\prod-smoke-*.cjs`.

## Painel administrativo (convenções da F6.6/F6.7 — 30/09/2026)

1. Menu lateral = `src/components/admin/AdminShell.tsx` (`AdminMenu` antigo **deletado**). Um `layout.tsx` por segmento renderiza o shell (sem route groups). `/produtos` e `/publicacoes` usam `podeVerPainel()` (`src/lib/painel.ts`): operacionais veem o painel, visitante/revenda continua vendo a loja pública.
2. Toda tela com `PageHeader` (`src/components/admin/PageHeader.tsx`): H1 único `{título} - {subtítulo}` + botão Voltar.
3. **Cadastros**: sub-items no menu (cliente/produto/empresa/fornecedor/revenda) apontam para `/configuracoes/cadastro?tela=…`; a tela é escolhida por `useSearchParams` (barra escura com botões foi removida). Fornecedor reusa `criarFornecedor` (Compras); Revenda reusa `alternarStatus` (Usuários — trilha `revenda.aprovada/revenda.rejeitada` + e-mail).
4. Rodapé e flutuante da loja **não aparecem no painel** (CSS `body:has(.admin-shell)`). Flutuante = padrão do rodapé: círculo `#4D4D4D`, glifo branco, hover `#E084AC`, WhatsApp `#25D366`, na vertical.
5. `/vendas` = RBAC gestão (aba Compras expõe custo). NF-e (`nfe_emissoes`, migration 0011) = **emissão interna, sem transmissão SEFAZ** (exige certificado A1 → fase F8); emitente fixo em `src/app/vendas/actions.ts` (`EMITENTE`).

## Stack

Next.js (App Router) + TypeScript + Supabase/PostgreSQL + Vercel + Mercado Pago + pgTAP + Playwright.

## Identidade visual — paleta v3 cinza (aprovada pelo cliente 25/09/2026)

1. Fundos de página e cards: `#E0E0E0` (`--bg-cotton` e `--bg-cloud` em `src/app/globals.css`); bordas `#C9C9C9`, texto fraco `#CFCFCF`, sombras neutras `rgba(0,0,0,…)`.
2. Barras de topo (Header) e rodapé (Footer): `#3D3D3D` sólido (antes: gradiente navy).
3. Mantidos: navy `#073B4C` (títulos/texto), CTA pink `#E084AC` (hover `#D06A97`), amarelo `#FFD166` só na marca, fontes Poppins + Open Sans.
4. Hero da home: vídeo full-bleed com rotação de 4 clipes Pexels 720p em `public/videos/` (crossfade no fim de cada clipe, pausa via IntersectionObserver + visibilitychange), overlay navy e fade do conteúdo na rolagem; `prefers-reduced-motion` ou Save-Data → cena SVG estática, sem vídeo e sem parallax.
5. Referência visual: `F:\Projetos\nuvem-de-papel-documentacao\Diversos4\preview-identidade-v2.html` (paleta + hero com vídeo).

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
