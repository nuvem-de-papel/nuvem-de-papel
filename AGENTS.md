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
2. **E2E Playwright** (`playwright-core`, canal `msedge`, `.env.local` lido por `lerEnv()`): `npm run e2e` roda `f2…f6 + email + clube + vendas + fiscal + sefaz + pdv-v6 + vendas-v5 + compras-v1` — contagem atual **378/378**. Servidor local: build parado na 3000 → `npm run start` → suite → matar porta 3000. Base de helpers: `e2e/vendas.cjs` (nav do painel) e `e2e/email.cjs` (criar usuário de teste).
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
4. E2E `e2e/fiscal.cjs` (10 checks) restaura `tenant_company`/`sefaz_config` e apaga os SKUs de teste ao final. F8.2 (motor + transporte SEFAZ) foi concluída em 02/10/2026; F8.3 (Mercado Livre) segue bloqueada na URL de callback do app do ML.

## Motor SEFAZ (F8.2 — 02/10/2026)

1. Migration 0014: máquina M13 em `nfe_emissoes` (`pendente | transmitida | autorizada | rejeitada | cancelada`, default `pendente`; notas antigas `emitida` migraram) + `ambiente/modelo/chave(44,única por tenant)/recibo/protocolo/xml/motivo/*_em` com invariantes por estado. **Ordem importa:** drop do check antigo ANTES do `update emitida→pendente` (staging não tinha notas antigas; produção tinha).
2. `src/lib/sefaz.ts` (servidor): `montarChave44` (43+DV mod11; `tpEmis="1"` fixo — `tpAmb` não entra na chave), `transmitirNfe/consultarNfe/cancelarEvento` — `SEFAZ_MOCK=1` (`.env.local`, dev/E2E) roda o ciclo fake; **produção é fail-closed** sem `SEFAZ_A1_PFX/SEFAZ_A1_SENHA` (nunca emitir sem A1; o CSC `000001`+token estão guardados fora do git). Segredos (A1/CSC/ML) ficam em arquivo local fora do git + Vercel — nunca no repositório. **Teste real** = transmitir contra a homologação SP com `SEFAZ_MOCK=0` + A1 no `.env.local` (só local; restaurar `SEFAZ_MOCK=1` e emitente E2E depois — o A1 de teste é de outro CNPJ e NÃO vai para o Vercel).
3. Convenções SEFAZ que custaram rejeição até acertar (todas testadas na homologação): **(a)** assinar o XML **completo** (`nfeProc`) e recortar `<NFe>` só depois — recortar antes muda o contexto do c14n e a SEFAZ rejeita **cStat 297**; **(b)** em homologação o `xNome` do destinatário DEVE ser literal `NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL` (**598**); **(c)** destinatário CNPJ contribuinte exige `indIEDest=1` + `<IE>` — a action persiste `destinatario.ie` do campo "IE do destinatário" (**232**), sem IE fica `indIEDest=9`; **(d)** evento 110111: Id = `ID110111`+chave+`01` (52 dígitos, pattern `ID[0-9]{52}`), elemento `nSeqEvento=1` e `verEvento` (**225**); **(e)** `enviNFe` aceita só `<NFe>` (**225**), enderEmit exige **bairro**, chave duplicada = **204**, CNPJ dest precisa existir na Receita (**181**); **(f)** transporte: Node `fetch` não faz mTLS → `https.request` com PEM (o Node não lê o PFX em TLS), `ca` da cadeia ICP-Brasil obrigatório (403 sem cert, cert errado sem CA); SOAP 1.2 com `<nfeDadosMsg>` e filho com `xmlns` da NF-e explícito (**242**); **(g)** montador valida emitente/dest pelo `municipios-ibge.json` (cidade+UF → código IBGE) — `bairro` virou campo do cadastro da empresa.
4. Estados na UI (`ConsoleVendas.tsx`): notas nascem pendente; Transmitir (pendente) → autoriza direto (síncrono) ou cai em Consultar (recibo) → Cancelar (autorizada = evento SEFAZ); o documento auxiliar mostra a emitente **real** do tenant (prop `emitente` do `page.tsx`; fallback estático só sem prop).
5. E2E `e2e/sefaz.cjs` (11 checks) exige `SEFAZ_MOCK=1` no `.env.local`; smoke de produção (`prod-smoke-sefaz.cjs`) só confere a recusa fail-closed — nunca transmite de verdade. Teste real de homologação (script local fora do git) cobriu autorização direta (~0,8 s) + cancelamento aceito: 11/11.

## Módulo Compras v1 (04/10/2026)

1. Migrations `0017_compras_v1` (`purchase_orders.origem/tipo/condicao`, `nfe_recebidas`, `compra_transporte`, `purchase_order_items.qtd_recebida`, rateio de custo) e `0019_compras_v1_ui` (sequências `seq_numero_compra`/`seq_entrada_direta`) — aplicadas em **staging e produção** no mesmo ritual preflight → migration → pgTAP; produção recebeu 0015–0019 em 04/10/2026 (**161 asserts / 0 falhas**: 32 + 20 + 62 + 28 + 19).
2. Console `src/components/compras/ConsoleCompras.tsx` com **3 abas** (`aria-label="Aba {label}"`): Compras (default), Recebimento (badge chegaram + atrasadas) e Notas recebidas (badge a tratar). Funil de 5 cartões `aria-label="Filtro {label}"` com precedência exclusiva `problema > conferir > caminho > pagar > nota`; "A pagar" exibe `brl(totalAPagar)`. **Entrada no painel:** não há link no menu lateral — chega por Cadastros → Fornecedor → "Abrir compras" (e por `rbac.ts`, `/compras` = perfis de gestão).
3. Fluxo em `src/app/compras/actions.ts` (16 server actions) + `src/lib/compras.ts` (`etapasCompra`, `compararNotaComPedido`, `SEQUENCIAS_TRANSPORTE`, `estaAtrasada`, `cfopEntrada`): vínculo de NF-e compara item a item (`Aceitar assim` / `Recusar` / `Desconhecer` com `confirm()`), entrada direta `EN-…`, NF-e de entrada com CFOP `1102|2102|3102` (importação exige ≥ `desembaraço` + DI/DUIMP + CNPJ do emitente), transporte pela sequência da origem (nacional 4 estados, importação 8) e recebimento via `purchase_receive` (estoque + títulos `payable`).
4. **Contrato f6 intocado**: `e2e/f6.cjs` continua no form rápido (`select[aria-label="Item 1"]`, `input[aria-label="Quantidade 1"]`, `input[placeholder="Nome do fornecedor"]`, …); os fluxos novos passam pelo editor (etapas grandes, `Etapa {nome}: {estado}`, `Vincular NF {numero}`).
5. E2E `e2e/compras-v1.cjs` (**69 checks**) somado ao script `e2e` — helpers `todosUnicos()` (o `count()` do Playwright não espera: confirma 1 elemento só depois de o DOM estabilizar), `esperarPedidos`, `vincular()`. Suíte completa **378/378**; smoke de produção `prod-smoke-compras.cjs` **19/19**. Pendências: DF-e real (mock `SEFAZ_MOCK=1`, senão fail-closed), PDF do pedido (hoje `templatePedidoCompra` é HTML), `regraFiscal()` da contabilidade, NFC-e/CSC, Melhor Envio/Correios, de-para NE-09, PTAX/títulos, troco, e o erro de hidratação do React que `/pdv` loga em produção (não afeta Compras; `#425/#418`).

## Bloco 1 - Blindagem (04/10/2026)

1. **Migration `0020_tenants_rls`** - liga RLS em `public.tenants`, a unica das 43 tabelas sem (diagnostico nas duas bases: `TOTAL_TABELAS=43`, `TABELAS_SEM_RLS=1`, e a 1 era `tenants`). Prova em producao antes de aplicar, leitura pura: `set role anon` → `rls_tenants=false`, `visivel_para_anon=1`, `slugs_vistos='nuvem-de-papel'`, com `anon` detendo `INSERT/SELECT/UPDATE/DELETE`; como `profiles`, `catalog_items`, `orders` e `audit_log` referenciam `tenants` com `on delete cascade`, **um DELETE anonimo apagaria o tenant inteiro**. Deny-all deliberado (RLS on + zero policies = nenhum papel publico enxerga linha); **sem** `force row level security` para o dono `postgres` continuar inserindo em futura migration de onboarding; nenhum codigo le `tenants` (grep `from("tenants")` = 0 - o id vem da constante `NUVEM_DE_PAPEL_TENANT_ID`). **Divergencia corrigida:** no staging a RLS ja estava ligada manualmente e nada no repo a liga (`git log -S "tenants enable row level security"` = 0) - estado manual nao versionado; agora e idempotente e igual nas duas bases. Ritual **preflight → migration → pgTAP** rodou em staging e em producao: `supabase/tests/0020_test.sql` **4 asserts / 0 falhas** em cada (RLS on, zero policies, e a invariante global de que nenhuma tabela de `public` fica sem RLS).
2. **Auditoria (faltava em 2 pontos)** - `criarFornecedor` era o unico cadastro da tela de Compras sem `audit_log` → agora grava `fornecedor.criado` com `after` completo; o pedido da loja criado em `checkout/actions.ts` tambem nao auditava → grava `pedido.criar` com canal, origem, status, total, desconto, forma de pagamento, cliente e quantidade de itens - **depois** da `reserve_order_stock`, so auditando pedido que realmente ficou de pe.
3. **Margem 30d corrigida** (`src/app/financeiro/page.tsx`) - o card "margem bruta" subtraia custo de **todo** o historico de uma receita de 30 dias: a query de `order_items` nao filtrava periodo nem status, ao contrario da de `orders` (que tinha `gte(created_at, 30d)` + `neq(status,'cancelado')`). Agora usa `orders!inner(created_at, status)` com os mesmos dois filtros. `margemBase` e `custo` continuam percorrendo as mesmas linhas (so itens com `cost_price`) para nao inflar margem com item sem custo cadastrado.
4. E2E **378/378** e smoke de producao `prod-smoke-compras.cjs` **19/19** apos o deploy `b07fc4f` (Vercel success nas duas). Correcao do registro anterior: a auditoria de 04/10 dizia "42 de 43 com RLS" - em producao era mesmo (1 sem = `tenants`), mas no staging a tabela ja estava protegida fora do versionamento.

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
