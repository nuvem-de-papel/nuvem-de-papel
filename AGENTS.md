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
2. **E2E Playwright** (`playwright-core`, canal `msedge`, `.env.local` lido por `lerEnv()`): `npm run e2e` roda `f2…f6 + email + clube + vendas + fiscal + sefaz` — contagem atual **233/233**. Servidor local: build parado na 3000 → `npm run start` → suite → matar porta 3000. Base de helpers: `e2e/vendas.cjs` (nav do painel) e `e2e/email.cjs` (criar usuário de teste).
3. Smokes de produção (só leitura) ficam em `C:\Users\joaqu\AppData\Local\Temp\opencode\e2e-f2\prod-smoke-*.cjs`.

## Painel administrativo (convenções da F6.6/F6.7/F7.1 — 30/09/2026)

1. Menu lateral = `src/components/admin/AdminShell.tsx` (`AdminMenu` antigo **deletado**). Um `layout.tsx` por segmento renderiza o shell (sem route groups). `/produtos` e `/publicacoes` usam `podeVerPainel()` (`src/lib/painel.ts`): operacionais veem o painel, visitante/revenda continua vendo a loja pública. Ordem: **Painel CRM primeiro** (grupo sem label), depois Vendas, depois o resto; rodapé só tem "Sair" (**"Ver loja" removido**).
2. Toda tela com `PageHeader` (`src/components/admin/PageHeader.tsx`): H1 único `{título} - {subtítulo}` + botão Voltar. **Exceção (pedido 30/09): `/configuracoes/cadastro` não tem PageHeader** — começa direto no conteúdo (sem título, sem descrição, sem Voltar); E2E confere pelos headings internos (`Cadastro de produto`, `Cadastro da empresa emitente`).
3. **Cadastros**: grupo **fechado por padrão** (botão toggle `aria-expanded` + chevron; abre sozinho quando a URL é `/configuracoes/cadastro`) com sub-items cliente/produto/fornecedor/revenda apontando para `/configuracoes/cadastro?tela=…` (sem repetir "cadastro" nos rótulos); a tela é escolhida por `useSearchParams` (barra escura com botões foi removida). **Empresa** saiu daqui e mora no gear Configurações (`?tela=empresa`). Fornecedor reusa `criarFornecedor` (Compras); Revenda reusa `alternarStatus` (Usuários — trilha `revenda.aprovada/revenda.rejeitada` + e-mail).
4. Rodapé e flutuante da loja **não aparecem no painel** (CSS `body:has(.admin-shell)`). Flutuante = padrão do rodapé: círculo `#4D4D4D`, glifo branco, hover `#E084AC`, WhatsApp `#25D366`, na vertical.
5. `/vendas` = RBAC gestão (aba Compras expõe custo). NF-e (`nfe_emissoes`, migration 0011) = **emissão interna, sem transmissão SEFAZ** (exige certificado A1 → fase F8); emitente fixo em `src/app/vendas/actions.ts` (`EMITENTE`).

## Clube de assinantes (F7 — 30/09/2026)

1. Migration 0012 (`club_plans` + `club_subscriptions` + `orders.discount_amount`): planos **públicos** (RLS select `using (true)` — landing `/clube` no anon), escrita deny-all (server actions usam service_role), assinatura privada (o dono via `auth.uid()` ou a gestão ativa lê; anon não lê). Índice único parcial impede duas assinaturas `pendente/ativa` por usuário. Seed: 3 planos fixos (`papel` 5%, `criativo` 8%, `atelier` 12%).
2. Fluxo: `/clube` (landing pública) → `assinarPlano` (`src/app/clube/actions.ts` — fail-closed em produção sem token do MP; local `MP_MOCK=1` cria id `mock-pre-*`) → webhook MP **tópico `preapproval`** ativa (`approved/authorized` → `ativa` com período de 30 dias; `cancelled` nunca ressuscita) → benefício no checkout (`beneficioClube` em `src/lib/clube.ts` desconta o total **no servidor**; linha negativa na preferência MP) → painel `/conta/assinatura` cancela (estado local manda; `cancelarPreapproval` best-effort).
3. Gestão de planos: `/configuracoes/clube` (item "Clube" na engrenagem, RBAC gestão, trilha `clube.plano_alterado` / `clube.plano_criado`).
4. E2E `e2e/clube.cjs` (24 checks): webhook assinado HMAC do mesmo jeito que `f4.cjs`; limpeza inclui `mock-pre-fantasma` em `webhook_events`.

## Fiscal (F8.1 — 30/09/2026)

1. Migration 0013: `ean_dv_valido` (GS1 mod-10) + `item_fiscal_data.gtin` (check 8/13 + DV, índice único parcial), `cest/origem/unit/weight_gross_kg`; `tenant_company` (CNPJ `^[0-9]{14}$`) e `sefaz_config` com RLS gestão e escrita deny-all (INSERT viola `WITH CHECK` com 42501; UPDATE deny-all filtra em silêncio → testar por efeito nulo).
2. Validações **sempre no servidor** (`src/app/configuracoes/cadastro/actions.ts`): `eanValido`/`cnpjValido` replicam o banco; `num()` limpa `R$`/`%` (`[^\d,.-]`); produto upserta `catalog_items` + `item_fiscal_data` + `item_commercial_data` + `item_prices` (`onConflict "item_id,channel,min_quantity,valid_from"`); audit `empresa.atualizada`/`produto.criado|atualizado`.
3. UI: produto e empresa são **reais** (props `empresa`/`produtos` do `page.tsx`, `defaultValues`); embeds 1-1 vêm como objeto **ou** array (tratar com `Array.isArray`); inputs mascarados usam `fill` com dígitos puros; feedback no `.ct-feed` (E2E espera por substring do texto da action).
4. E2E `e2e/fiscal.cjs` (10 checks) restaura `tenant_company`/`sefaz_config` e apaga os SKUs de teste ao final. F8.2 (SEFAZ com A1+CSC) e F8.3 (Mercado Livre) seguem bloqueadas em credenciais do cliente.

## Motor SEFAZ (F8.2 — 02/10/2026)

1. Migration 0014: máquina M13 em `nfe_emissoes` (`pendente | transmitida | autorizada | rejeitada | cancelada`, default `pendente`; notas antigas `emitida` migraram) + `ambiente/modelo/chave(44,única por tenant)/recibo/protocolo/xml/motivo/*_em` com invariantes por estado. **Ordem importa:** drop do check antigo ANTES do `update emitida→pendente` (staging não tinha notas antigas; produção tinha).
2. `src/lib/sefaz.ts` (servidor): `montarChave44` (43+DV mod11), `transmitirNfe/consultarNfe/cancelarEvento` — `SEFAZ_MOCK=1` (`.env.local`, dev/E2E) roda o ciclo fake; **produção é fail-closed** sem `SEFAZ_A1_PFX/SEFAZ_A1_SENHA/SEFAZ_CSC_ID/SEFAZ_CSC_TOKEN` (nunca emitir sem A1+CSC; transporte real pendente da entrega do A1). Segredos (CSC/ML) ficam em arquivo local fora do git + Vercel — nunca no repositório.
3. Estados na UI (`ConsoleVendas.tsx`): notas nascem pendente; Transmitir (pendente) → Consultar (transmitida) → Cancelar (pendente/rejeitada/autorizada; autorizada exige evento SEFAZ). Cancelamento de pendente/rejeitada é interno.
4. E2E `e2e/sefaz.cjs` (11 checks) exige `SEFAZ_MOCK=1` no `.env.local`; smoke de produção (`prod-smoke-sefaz.cjs`) só confere a recusa fail-closed — nunca transmite de verdade.

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
