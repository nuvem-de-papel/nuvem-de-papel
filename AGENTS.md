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
| Produção | `F:\Projetos\nuvem-de-papel` | `main` | Supabase `urlfwxeflxpdmmxkuuur` (nuvem-de-papel-staging-produção) | Vercel Production — dispara em push/merge em `main` |
| Staging/dev | `F:\Projetos\nuvem-de-papel-staging` | `staging` (ou qualquer branch != `main`) | Supabase `cwfvxthfwbvpfjhsxpmc` (nuvem-de-papel-staging-staging) | Vercel Preview — dispara em push de qualquer branch != `main` |

Repositório único: https://github.com/nuvem-de-papel/nuvem-de-papel

Migrations aplicadas via Management API do Supabase com o helper da sessão
30/09/2026: `& "C:\Users\joaqu\AppData\Local\Temp\opencode\supabase-query-pat.ps1" -ProjectRef <ref> -SqlFile <arquivo>`
(staging `cwfvxthfwbvpfjhsxpmc`, produção `urlfwxeflxpdmmxkuuur`). O token do
Supabase CLI no CredMan está **sem escopo `database_read`** (403) — usar o
helper de PAT (`sbp_…` salvo em `sbp-token.txt` no temp da sessão), não o
`supabase-query.ps1` original. Antes de criar a próxima, conferir a numeração
real em `supabase/migrations/`.

> **Atualização (17/11/2026):** o helper `supabase-query-pat.ps1` e o `sbp-token.txt`
> **não existem mais** no temp. SQL de apoio (leitura e ritual) passou a rodar
> pelo conector MCP do Supabase (`execute_sql`, com `project_id` do ambiente);
> escrita pelo MCP pede confirmação do Joaquim a cada chamada.

### Mapa confirmado dos projetos Supabase (confirmado pelo Joaquim em 13/11/2026 — não perguntar de novo)

- **PRODUÇÃO:** `urlfwxeflxpdmmxkuuur` (nome no painel: `nuvem-de-papel-staging-produção`) — https://urlfwxeflxpdmmxkuuur.supabase.co
- **TESTE / STAGING:** `cwfvxthfwbvpfjhsxpmc` (nome no painel: `nuvem-de-papel-staging-staging`) — https://cwfvxthfwbvpfjhsxpmc.supabase.co
- Projeto `cbnmnpnpioukbzircmzn` (`nuvem-de-papel-pausado`, INACTIVE): NÃO é usado pelo código atual. Não escrever nele.
- Chaves (publishable, service role, senha do banco) ficam APENAS no `.env.local` da pasta de staging e nunca no chat, no Git ou em documentos. A senha do banco entra por `[YOUR-PASSWORD]` no comando de conexão.
- Regra: a pasta de staging (`.env.local`) aponta para `cwfvxthfwbvpfjhsxpmc`. Qualquer migration, SQL de escrita ou teste começa aí. Produção (`urlfwxeflxpdmmxkuuur`) só recebe migration depois de validada no teste.

## Fluxo obrigatório para qualquer mudança de código ou de banco

> **REGRA INEGOCIÁVEL (reafirmada em 14/10/2026):** TODO teste e validação acontece PRIMEIRO em `F:\Projetos\nuvem-de-papel-staging`. Produção (`F:\Projetos\nuvem-de-papel`) só recebe atualização DEPOIS de staging validado. As entregas serão **modulares** — cada módulo/passinho é testado e validado no staging antes de qualquer merge para produção. Em nenhuma hipótese editar ou deployar produção sem ter passado pelo staging.

1. Trabalhar sempre na pasta de staging/dev (`nuvem-de-papel-staging`), nunca editar direto na pasta de produção.
2. Validar local primeiro (`npm run type-check` → `npm run lint` → `npm run build` → `npm run e2e`).
3. Commit + push na branch `staging`, nunca direto em `main`.
4. Mudança em migrations — aplicar/testar primeiro no banco de staging (`cwfvxthfwbvpfjhsxpmc`), e **sempre aplicar em produção (preflight → migration → pgTAP) ANTES do merge** que deploya. Query API de apoio ao ritual: `supabase-query-pat.ps1` precisa rodar no **pwsh 7** (`pwsh -File …`) — no Windows PowerShell 5.1 o `ConvertTo-Json` serializa o SQL como objeto `{"value":…}` e a API responde 400, e o header tem de ser parâmetro `-ContentType`, não hashtable.
5. Só depois de validado (staging ok), fazer merge em `main` — esse é o único gatilho que deve tocar produção de verdade.

Push ao GitHub: `gh` está logado na conta **`nuvem-de-papel`** (admin do repo) — device flow `gh auth login --hostname github.com --git-protocol https --web` + `gh auth setup-git` (helper `credential.https://github.com` = `!gh auth git-credential`), feito em 07/10/2026; se o login expirar, refazer o device flow no navegador logado na mesma conta. A conta antiga `connection-cyber-so` (só leitura) foi removida do credential manager (`cmdkey /delete:LegacyGeneric:target=git:https://github.com`). Repos antigos `satcyber003-sketch/nuvem-de-papel` são obsoletos.

Essa regra vale para qualquer IA ou pessoa trabalhando neste projeto a partir desta data, mesmo sem ser lembrada a cada tarefa.

Merge é local, sem PR no GitHub: com CI verde, `git fetch` → `git merge origin/staging` na pasta de produção → `git push origin main` (Vercel deploya).

> **Correção (09/11/2026):** as branches `main` e `staging` têm *branch protection* no GitHub (exige PR, sem push direto mesmo do fetch/merge local) — a frase acima ("merge local, sem PR") está desatualizada pra isso: push direto em qualquer uma das duas é rejeitado (`GH006: Protected branch update failed`). Os PRs #10 a #13 foram merged direto em `main` via `gh pr merge --admin` (sem passar por `staging` antes), deixando `staging` 7 commits atrás; reconciliado no PR #14 (merge de `main` para `staging`). Daqui pra frente: **todo trabalho novo commita e abre PR contra `staging` primeiro** (valida no Preview da Vercel); o avanço de `staging` para `main` também precisa de PR (`gh pr create --base main` + `gh pr merge --admin`, mesma mecânica), não há mais merge local sem PR nas duas branches.

## Regras permanentes de sessão (auto-aplicáveis)

Valem para qualquer sessão/IA, mesmo sem ser lembradas na conversa:

1. **Validação antes de qualquer commit** — toda alteração é feita e validada em `F:\Projetos\nuvem-de-papel-staging`: `npm run type-check` → `npm run lint` → `npm run build`, com o dev server **parado** antes do build (build com dev aberto corrompe `.next` e gera erro de módulo ausente).
2. **Migrations — conferir a numeração na pasta antes de criar** — listar `supabase/migrations/` e usar o próximo número disponível; nunca confiar em memória de sessão anterior. A migration nasce e é testada no staging; o mesmo SQL vai para produção só depois de validada.
3. **Este arquivo faz parte da entrega** — toda decisão/padrão novo relevante (regra de ambiente, fluxo, arquitetura, paleta, convenção) entra neste AGENTS.md **no mesmo commit** da mudança de código. Editou algo relevante → atualizou este arquivo → commit junto.
4. **Documentação viva** — decisões relevantes ficam em arquivos `.md` (ex.: paleta e mockups em `F:\Projetos\nuvem-de-papel-documentacao\`); comentário datado no código só em pontos não-óbvios, mínimo e com contexto.
5. **CI obrigatória** — todo push roda `.github/workflows/ci.yml` (lint → type-check → build). CI vermelha = não fazer merge. Watch com `gh run watch <id> --exit-status` (rodar com workdir dentro do repo).

## Testes

1. **pgTAP** por migration: `supabase/tests/NNNN_test.sql` (+ `preflight/` e `rollback/`). A query API devolve só o último result set → acumular asserts em `create temp table _out (line text)` e devolver `count(*)/falhas` na última linha. Gate = `falhas = 0`.
2. **E2E Playwright** (`playwright-core`, canal `msedge`, `.env.local` lido por `lerEnv()`): `npm run e2e` roda `f2…f6 + email + clube + vendas + fiscal + sefaz + pdv-v6 + vendas-v5 + compras-v1 + dre + documentos + vendedores + precos + clientes + marketplaces + despesas + conciliacao + frete` — 22 suítes; execução completa **14/10/2026: 577 checks, 577 PASS · 0 falhas** (inclui `clientes.cjs` 26/26 desde a 0029; `dre.cjs` 41/41, `despesas.cjs` 21/21, `conciliacao.cjs` 32/32 e `frete.cjs` 13/13). **Flakes corrigidos em 14/10** (ambiente lento fazia qualquer suíte fluar por timing): `f5/pdv-v6/vendas-v5` capturavam `t0` no relógio da MÁQUINA e filtravam `created_at` (= `now()` do Supabase, ~5,5 s atrás — helper `e2e/_relogio-banco.cjs`); `f3.cjs` contava o carrinho antes do render client-side. Rodada em cadeia hoje falhou 4× em suítes aleatórias (f2/f3/f5/clube) — todas passaram avulsas; com o ambiente lento, **rodar a suíte avulsa antes de investigar**. Pegadinha de leitura: `email.cjs` e `clube.cjs` **não** imprimem `TOTAL` (fecham com `E2E F6.5: 20/20 checks` e `resumo: 24 checks`) - casar o resumo certo de cada suíte ou os totais andam. A cadeia para no primeiro FAIL — para validar tudo numa execução só, rodar as suítes de `dre` em diante avulsas. Servidor local: build parado na 3000 → `npm run start` → suite → matar porta 3000. Base de helpers: `e2e/vendas.cjs` (nav do painel) e `e2e/email.cjs` (criar usuário de teste).
3. **Conta mestre E2E**: as suítes usam `e2e/_credenciais-e2e.cjs`, que exige `E2E_MASTER_EMAIL` e `E2E_MASTER_PASSWORD` somente no `.env.local` ignorado pelo Git. A conta é exclusiva do banco de staging; nunca fixar e-mail ou senha mestre em scripts de teste nem reutilizar uma conta operacional.
4. Smokes de produção (só leitura) ficam em `C:\Users\joaqu\AppData\Local\Temp\opencode\e2e-f2\prod-smoke-*.cjs`.

## Painel administrativo (convenções da F6.6/F6.7/F7.1 — 30/09/2026)

1. Menu lateral = `src/components/admin/AdminShell.tsx` (`AdminMenu` antigo **deletado**). Um `layout.tsx` por segmento renderiza o shell (sem route groups). `/produtos` e `/publicacoes` usam `podeVerPainel()` (`src/lib/painel.ts`): operacionais veem o painel, visitante/revenda continua vendo a loja pública. Ordem: **Painel CRM primeiro** (grupo sem label), depois Vendas, depois o resto; rodapé só tem "Sair" (**"Ver loja" removido**).
2. Toda tela com `PageHeader` (`src/components/admin/PageHeader.tsx`): H1 único `{título} - {subtítulo}` + botão Voltar. **Exceção (pedido 30/09): `/configuracoes/cadastro` não tem PageHeader** — começa direto no conteúdo (sem título, sem descrição, sem Voltar); E2E confere pelos headings internos (`Cadastro de produto`, `Cadastro da empresa emitente`).
3. **Cadastros**: grupo **fechado por padrão** (botão toggle `aria-expanded` + chevron; abre sozinho quando a URL é `/configuracoes/cadastro`) com sub-items cliente/produto/fornecedor/revenda apontando para `/configuracoes/cadastro?tela=…` (sem repetir "cadastro" nos rótulos); a tela é escolhida por `useSearchParams` (barra escura com botões foi removida). **Empresa** saiu daqui e mora no gear Configurações (`?tela=empresa`). Fornecedor reusa `criarFornecedor` (Compras); Revenda reusa `alternarStatus` (Usuários — trilha `revenda.aprovada/revenda.rejeitada` + e-mail).
4. Rodapé e flutuante da loja **não aparecem no painel** (CSS `body:has(.admin-shell)`). Flutuante (invertido em 10/11/2026 a pedido do Joaquim, `Footer.tsx`): círculo **preto** `#000000`, ícone e borda rosa do CTA `#FC99D3`, hover `#1A1A1A`, WhatsApp `#25D366`, na vertical, no lado **direito** (desde `b8ce4a5`); some abaixo de 769px. E2E `vendas.cjs` N9 confere essas cores.
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
4. E2E `e2e/fiscal.cjs` (10 checks) restaura `tenant_company`/`sefaz_config` e apaga os SKUs de teste ao final. F8.2 (motor + transporte SEFAZ) foi concluída em 02/10/2026; a F8.3 virou a trilha de marketplaces M1–M4 — M1 (kernel) concluída em 06/10/2026, M2 (Mercado Livre) é o próximo.

## Motor SEFAZ (F8.2 — 02/10/2026)

1. Migration 0014: máquina M13 em `nfe_emissoes` (`pendente | transmitida | autorizada | rejeitada | cancelada`, default `pendente`; notas antigas `emitida` migraram) + `ambiente/modelo/chave(44,única por tenant)/recibo/protocolo/xml/motivo/*_em` com invariantes por estado. **Ordem importa:** drop do check antigo ANTES do `update emitida→pendente` (staging não tinha notas antigas; produção tinha).
2. `src/lib/sefaz.ts` (servidor): `montarChave44` (43+DV mod11; `tpEmis="1"` fixo — `tpAmb` não entra na chave), `transmitirNfe/consultarNfe/cancelarEvento` — `SEFAZ_MOCK=1` (`.env.local`, dev/E2E) roda o ciclo fake; **produção é fail-closed** sem `SEFAZ_A1_PFX/SEFAZ_A1_SENHA` (nunca emitir sem A1; o CSC `000001`+token estão guardados fora do git). Segredos (A1/CSC/ML) ficam em arquivo local fora do git + Vercel — nunca no repositório. **Teste real** = transmitir contra a homologação SP com `SEFAZ_MOCK=0` + A1 no `.env.local` (só local; restaurar `SEFAZ_MOCK=1` e emitente E2E depois — o A1 de teste é de outro CNPJ e NÃO vai para o Vercel).
3. Convenções SEFAZ que custaram rejeição até acertar (todas testadas na homologação): **(a)** assinar o XML **completo** (`nfeProc`) e recortar `<NFe>` só depois — recortar antes muda o contexto do c14n e a SEFAZ rejeita **cStat 297**; **(b)** em homologação o `xNome` do destinatário DEVE ser literal `NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL` (**598**); **(c)** destinatário CNPJ contribuinte exige `indIEDest=1` + `<IE>` — a action persiste `destinatario.ie` do campo "IE do destinatário" (**232**), sem IE fica `indIEDest=9`; **(d)** evento 110111: Id = `ID110111`+chave+`01` (52 dígitos, pattern `ID[0-9]{52}`), elemento `nSeqEvento=1` e `verEvento` (**225**); **(e)** `enviNFe` aceita só `<NFe>` (**225**), enderEmit exige **bairro**, chave duplicada = **204**, CNPJ dest precisa existir na Receita (**181**); **(f)** transporte: Node `fetch` não faz mTLS → `https.request` com PEM (o Node não lê o PFX em TLS), `ca` da cadeia ICP-Brasil obrigatório (403 sem cert, cert errado sem CA); SOAP 1.2 com `<nfeDadosMsg>` e filho com `xmlns` da NF-e explícito (**242**); **(g)** montador valida emitente/dest pelo `municipios-ibge.json` (cidade+UF → código IBGE) — `bairro` virou campo do cadastro da empresa.
4. Estados na UI (`ConsoleVendas.tsx`): notas nascem pendente; Transmitir (pendente) → autoriza direto (síncrono) ou cai em Consultar (recibo) → Cancelar (autorizada = evento SEFAZ); o documento auxiliar mostra a emitente **real** do tenant (prop `emitente` do `page.tsx`; fallback estático só sem prop).
5. E2E `e2e/sefaz.cjs` (11 checks) exige `SEFAZ_MOCK=1` no `.env.local`; smoke de produção (`prod-smoke-sefaz.cjs`) só confere a recusa fail-closed — nunca transmite de verdade. Teste real de homologação (script local fora do git) cobriu autorização direta (~0,8 s) + cancelamento aceito: 11/11.
6. **Bloco 3 (07/10/2026):** emitente do staging = MANIA DE MODAS (`09050756000110`, IE `635556710110`, `regime='normal'` — BrasilAPI: fora do Simples desde 31/12/2023 → CRT 3; p/ restaurar o emitente E2E: `EMPRESA E2E FISCAL LTDA` / `11222333000181` / ie `""` / endereço vazio). Régua real reexecutada **11/11** (autorização direta 3,3 s, protocolo `135260009107783`, cancelamento aceito) já com o grupo **IBSCBS** da NT 2025.002 (leiaute PL_010): `CST 000` + `cClassTrib 000001`, IBS 0,1% + CBS 0,9% (transição 2026) por item + `<IBSCBSTot>` no `<total>` — validado no XSD PL_010 local antes de transmitir. Regressão: 7 suítes do raio fiscal = 223/223; `SEFAZ_MOCK` restaurado para 1. Rejeições vencidas no caminho: cStat **180** (regime → CRT 3), **225** (CST ICMS de 2 dígitos + modBC) e **1115** (grupo IBSCBS ausente). Pendências do Bloco 3: **3.3** `regraFiscal()` com os parâmetros do contador e **3.4** NFC-e (credenciamento do cliente + QR Code — CSC já no `sefaz_config`, item 8).

## Módulo Compras v1 (04/10/2026)

1. Migrations `0017_compras_v1` (`purchase_orders.origem/tipo/condicao`, `nfe_recebidas`, `compra_transporte`, `purchase_order_items.qtd_recebida`, rateio de custo) e `0019_compras_v1_ui` (sequências `seq_numero_compra`/`seq_entrada_direta`) — aplicadas em **staging e produção** no mesmo ritual preflight → migration → pgTAP; produção recebeu 0015–0019 em 04/10/2026 (**161 asserts / 0 falhas**: 32 + 20 + 62 + 28 + 19).
2. Console `src/components/compras/ConsoleCompras.tsx` com **3 abas** (`aria-label="Aba {label}"`): Compras (default), Recebimento (badge chegaram + atrasadas) e Notas recebidas (badge a tratar). Funil de 5 cartões `aria-label="Filtro {label}"` com precedência exclusiva `problema > conferir > caminho > pagar > nota`; "A pagar" exibe `brl(totalAPagar)`. **Entrada no painel:** não há link no menu lateral — chega por Cadastros → Fornecedor → "Abrir compras" (e por `rbac.ts`, `/compras` = perfis de gestão).
3. Fluxo em `src/app/compras/actions.ts` (16 server actions) + `src/lib/compras.ts` (`etapasCompra`, `compararNotaComPedido`, `SEQUENCIAS_TRANSPORTE`, `estaAtrasada`, `cfopEntrada`): vínculo de NF-e compara item a item (`Aceitar assim` / `Recusar` / `Desconhecer` com `confirm()`), entrada direta `EN-…`, NF-e de entrada com CFOP `1102|2102|3102` (importação exige ≥ `desembaraço` + DI/DUIMP + CNPJ do emitente), transporte pela sequência da origem (nacional 4 estados, importação 8) e recebimento via `purchase_receive` (estoque + títulos `payable`).
4. **Contrato f6 intocado**: `e2e/f6.cjs` continua no form rápido (`select[aria-label="Item 1"]`, `input[aria-label="Quantidade 1"]`, `input[placeholder="Nome do fornecedor"]`, …); os fluxos novos passam pelo editor (etapas grandes, `Etapa {nome}: {estado}`, `Vincular NF {numero}`).
5. E2E `e2e/compras-v1.cjs` (**69 checks**) somado ao script `e2e` — helpers `todosUnicos()` (o `count()` do Playwright não espera: confirma 1 elemento só depois de o DOM estabilizar), `esperarPedidos`, `vincular()`. Suíte completa **378/378**; smoke de produção `prod-smoke-compras.cjs` **19/19**. Pendências: DF-e real (mock `SEFAZ_MOCK=1`, senão fail-closed), PDF do pedido (hoje `templatePedidoCompra` é HTML), `regraFiscal()` da contabilidade, NFC-e/CSC, etiqueta/rastreio Melhor Envio (a **cotação** de frete foi resolvida em 07/10 — matriz local `0028`), de-para NE-09, PTAX/títulos, troco, e o erro de hidratação do React que `/pdv` loga em produção (não afeta Compras; `#425/#418`).

## Bloco 1 - Blindagem (04/10/2026)

1. **Migration `0020_tenants_rls`** - liga RLS em `public.tenants`, a unica das 43 tabelas sem (diagnostico nas duas bases: `TOTAL_TABELAS=43`, `TABELAS_SEM_RLS=1`, e a 1 era `tenants`). Prova em producao antes de aplicar, leitura pura: `set role anon` → `rls_tenants=false`, `visivel_para_anon=1`, `slugs_vistos='nuvem-de-papel'`, com `anon` detendo `INSERT/SELECT/UPDATE/DELETE`; como `profiles`, `catalog_items`, `orders` e `audit_log` referenciam `tenants` com `on delete cascade`, **um DELETE anonimo apagaria o tenant inteiro**. Deny-all deliberado (RLS on + zero policies = nenhum papel publico enxerga linha); **sem** `force row level security` para o dono `postgres` continuar inserindo em futura migration de onboarding; nenhum codigo le `tenants` (grep `from("tenants")` = 0 - o id vem da constante `NUVEM_DE_PAPEL_TENANT_ID`). **Divergencia corrigida:** no staging a RLS ja estava ligada manualmente e nada no repo a liga (`git log -S "tenants enable row level security"` = 0) - estado manual nao versionado; agora e idempotente e igual nas duas bases. Ritual **preflight → migration → pgTAP** rodou em staging e em producao: `supabase/tests/0020_test.sql` **4 asserts / 0 falhas** em cada (RLS on, zero policies, e a invariante global de que nenhuma tabela de `public` fica sem RLS).
2. **Auditoria (faltava em 2 pontos)** - `criarFornecedor` era o unico cadastro da tela de Compras sem `audit_log` → agora grava `fornecedor.criado` com `after` completo; o pedido da loja criado em `checkout/actions.ts` tambem nao auditava → grava `pedido.criar` com canal, origem, status, total, desconto, forma de pagamento, cliente e quantidade de itens - **depois** da `reserve_order_stock`, so auditando pedido que realmente ficou de pe.
3. **Margem 30d corrigida** (`src/app/financeiro/page.tsx`) - o card "margem bruta" subtraia custo de **todo** o historico de uma receita de 30 dias: a query de `order_items` nao filtrava periodo nem status, ao contrario da de `orders` (que tinha `gte(created_at, 30d)` + `neq(status,'cancelado')`). Agora usa `orders!inner(created_at, status)` com os mesmos dois filtros. `margemBase` e `custo` continuam percorrendo as mesmas linhas (so itens com `cost_price`) para nao inflar margem com item sem custo cadastrado.
4. E2E **378/378** e smoke de producao `prod-smoke-compras.cjs` **19/19** apos o deploy `b07fc4f` (Vercel success nas duas). Correcao do registro anterior: a auditoria de 04/10 dizia "42 de 43 com RLS" - em producao era mesmo (1 sem = `tenants`), mas no staging a tabela ja estava protegida fora do versionamento.

## Bloco 2 - passo 1: fundacao contabil (04/10/2026)

1. **Decisoes do Bloco 2** (delegadas pelo cliente com "kernel generico por tenant, abranger todas as necessidades, executar"): granularidade **classe 1-6 em 3 niveis**; disparador **automatico** nos eventos que ja existem + manual para despesas; regime de competencia para o DRE (caixa continua sendo os titulos, que ja existiam); regime tributario **do kernel** (`tenant_company.regime` ja aceita `simples|normal|mei` - nenhuma regra gravada em pedra); despesas fixas com **centro de custo**; DRE **completo** (receita bruta, deducoes, CMV, despesas operacionais, EBITDA, depreciacao, LAIR, IR/CSLL) por periodo.
2. **Migration `0021_plano_de_contas_dre`** - cria `account_catalog` (plano padrao GLOBAL, 60 contas / 39 folhas, NBC TG 1000), `tenant_accounts` (habilitacao por tenant, PK composta `(tenant_id, code)` - mesmo padrao do `module_catalog`/`tenant_modules` do ConnectionCyber: trocar `ativo` e feature flag, nao exige migration), `cost_centers`, `journal_entries` + `journal_entry_lines` (dupla entrada com coluna **`competencia`**, que era o que faltava para separar caixa de competencia), `expenses`, view `v_dre`. Escrita so pela RPC `journal_post()` (security definer, `revoke` de `public`/`anon`/`authenticated`, `grant` a `service_role`) com validacao de balanco, idempotencia por `(tenant_id, idempotency_key)` e checagem de que toda conta usada esta habilitada no tenant.
3. **Imutabilidade** (mesma filosofia de `caixa_movements` e `financial_settlements`): linha do diario nunca `update`/`delete` (`DIARIO_LINHA_IMUTAVEL`), cabecalho nunca `delete` (`DIARIO_CABECALHO_IMUTAVEL`) - erro se tentar, a correcao e estorno. O balanco e garantido **duas vezes**: na propria `journal_post()` (imediato, mensagens `DIARIO_DESVIO: debito X <> credito Y`) e num `constraint trigger ... deferrable initially deferred` como rede de seguranca.
4. **Armadilha de SQL contornada**: o self-FK `parent_code references account_catalog(code) deferrable initially deferred` deixa trigger events pendentes na tabela, e qualquer `ALTER TABLE` posterior falha com `55006: cannot ALTER TABLE ... because it has pending trigger events` - o `enable row level security` teve de ser movido para **antes** da semente (60 linhas). Preflight registra os 7 objetos novos para o ciclo nao rodar duas vezes.
5. **Ritual completo nas duas bases** - preflight  `migration`  `pgTAP`: `supabase/tests/0021_test.sql` **20 asserts / 0 falhas** em staging (`urlfwxeflxpdmmxkuuur`) e em producao (`cbnmnpnpioukbzircmzn`). `type-check` limpo, lint `No ESLint warnings`, build ok, **E2E 378/378 - 0 falhas** (11 suite com agregador = 334, `clube` 24, `email` 20). Nenhum trigger de escrita foi posto em tabela de negocio ainda: as regras de lancamento automatico (venda, recebimento, liquidacao, compra) vem no passo 2, depois de mapear o ciclo de vida real do PDV - aqui so a base, e ela ja e testavel sozinha.

## Bloco 2 - passo 2: lancamentos automaticos (04/10/2026)

1. **Migration `0022_lancamentos_automaticos`** - 3 funcoes `security definer` + `create constraint trigger ... deferrable initially deferred`: `post_order_accounting` em `orders` (insert/update), `post_purchase_receipt_accounting` em `purchase_receipts` (insert), `post_settlement_accounting` em `financial_settlements` (insert). Os tres **releem a linha** na funcao (`select ... into` no inicio) porque um gatilho deferred roda no COMMIT com o estado FINAL - e no commit que a posicao mais recente e a que vale.
2. **Regra anti-dobra da venda**: se existir `financial_titles` `direction='receivable'` com `source_id = order` (`0022:85-90`), o credito da receita cai em `1.1.2 Contas a receber` e a `financial_settlements` posterior leva ao caixa; se nao existir titulo (venda PDV dinheiro/debito/pix, ou loja), cai direto em `1.1.1 Caixa` (`0022:90` + `0022:101`). Compra = `1.1.3 Estoque x 2.1.1 Fornecedores` (`0022:233-241`). Liquidacao = caixa x titulo para receivable e fornecedor x caixa para payable (`0022:315-342`), competencia = `financial_settlements.created_at::date` (`0022:281`).
3. **Estorno**: pedido que ja faturou e foi cancelado gera o lancamento inverso com competencia `current_date` (corrige o saldo sem reescrever o historico); pedido cancelado que **nunca** faturou nao tem nada a estornar e a funcao sai sem gravar (`0023:70-76`).
4. **Tela da DRE** em `src/components/financeiro/ConsoleFinanceiro.tsx` (`montarDRE()`) le `v_dre` e monta as linhas oficiais ate o lucro liquido; seletor de competencia em `src/app/financeiro/page.tsx`.
5. **Ritual nas duas bases**: `supabase/preflight/0022_preflight.sql` -> `0022_lancamentos_automaticos.sql` -> `supabase/tests/0022_test.sql` **28 asserts / 0 falhas** em staging (`urlfwxeflxpdmmxkuuur`) e producao (`cbnmnpnpioukbzircmzn`). `type-check` limpo, lint `No ESLint warnings or errors`, build ok, **E2E 419/419 - 0 falhas** (14 suítes), push staging `3c37bfe`, CI verde, merge ff em main, Vercel success.

## Bloco 2 - passo 3: despesas no diario (04/10/2026)

1. **Buraco 1 - faturamento estreito**: o 0022 so lancava quando `orders.status = 'pago'`, mas o caminho de 0007 so permite `aguardando_pagamento -> pago -> processando -> em_rota -> entregue`, e um pedido que ja subiu de nivel deixava de contar como receita. Faturado virou `status not in ('aguardando_pagamento','cancelado')` (`0023:17-18`): `aguardando_pagamento` continua de fora (nao e receita) e `cancelado` vira estorno.
2. **Buraco 2 - despesas fora do diario**: `post_expense_accounting` (`0023:183-237`) + `trg_post_expense_accounting` deferred em `expenses`. Debita `expenses.account_code` e credita `1.1.1 Caixa` quando `paid_at` esta preenchido, senao `2.1.1 Fornecedores`; competencia = `expenses.competencia`; idempotencia `despesa:<id>` (**o primeiro estado vence** - regravar `paid_at` depois nao duplica lancamento).
3. **KPI alinhado**: `src/app/financeiro/page.tsx` passou a usar `.not("status","in","(cancelado,aguardando_pagamento)")` na receita (l.51-53) e `.not("orders.status",...)` no CMV (l.59-66) - antes o card do cabecalho e a DRE nao fechavam entre si.
4. **Ritual nas duas bases**: preflight -> migration -> `supabase/tests/0023_test.sql` **18 asserts / 0 falhas** em staging e producao. `type-check` limpo, lint `No ESLint warnings or errors`, build ok, **E2E 419/419 - 0 falhas**, commit `0c69dcd` em staging e main, CI `37257122855` success, Vercel success. Backfill de producao: 2 pedidos `processando` (139,80) entraram no diario e ficaram com debito = credito = 202,80.

## Bloco 2 - passo 4: tela de despesas e rateio (07/10/2026)

1. **Rota `/financeiro/despesas`** (page server + `ConsoleDespesas.tsx` client): gate duplo igual ao do financeiro (middleware `/financeiro/*` devolve 403 para papel de fora, a pagina redireciona `/crm` se nao for `PAPEIS_GESTAO` ativo). Tela = form (`aria-label="Nova despesa"`) + lista do mes com filtro `aria-label="Mês das despesas"` + cards de resumo por centro (`aria-label="Total {code}"`). Entrada tambem pelo botao "Lancar despesas" no cabecalho do DRE em `/financeiro` (`ConsoleFinanceiro.tsx:281`).
2. **Server action `criarDespesa`** (`src/app/financeiro/actions.ts`): valida descricao (3..160), competencia `AAAA-MM`, conta **folha da classe 6** (`aceita_lancamento`; sem isto o gatilho da 0023 estouraria `DESPESA_CONTA_NAO_FOLHA` apos o insert), valor `> 0` e centros ativos do tenant. **Rateio** = N linhas em `expenses` que somam 100% (a ultima absorve o arredondamento) -> N lancamentos `despesa:<id>`, cada um com o seu `cost_center_id`; `paid_at` so no nascimento (pago agora -> credita `1.1.1 Caixa`, em aberto -> `2.1.1`). Auditoria `despesa.criar` com o resumo do rateio.
3. **Sem edicao e sem exclusao por design**: o diario e imutavel (o gatilho usa idempotencia `despesa:<id>` - "o primeiro estado vence"), entao a tela nao oferece apagar/editar; correcao entra como novo lancamento. Excluir a linha de `expenses` deixa o lancamento no diario (residuo aceito, mesmo criterio das suites F5/F6).
4. **E2E `e2e/despesas.cjs` (21 checks)** na cadeia `npm run e2e` (depois de `marketplaces`): gate, validacoes travando o botao, lançamento simples (toast + `expenses` + publicacao do gatilho com C 1.1.1), rateio 50/30/20 (3 linhas 500/300/200 em ADM/COM/LOG + 3 lancamentos C 2.1.1 com centro em cada um + cards 750,00 / 1.250,00), filtro de mes, auditoria e limpeza (`expenses` fora, diario fica).

## Bloco 2 - passo 5: conciliacao bancaria (07/10/2026)

1. **Migration `0027_conciliacao_bancaria`** - era o ultimo componente da lista de DRE em 0 (auditoria 06/10). `bank_extratos` (lote: fonte `ofx|csv`, competencia, linhas_total/linhas_novas, `created_by`) e `bank_linhas` (data, descricao, valor **com o sinal do banco** - entrada +, saida -, `fitid`, status `pendente|conciliada|ignorada`, `ref_tipo/ref_id` **sem FK** de proposito: o alvo pode sumir na limpeza de homologacao, mesmo criterio do `source_id` do 0008). Checks: `seq > 0`, `linhas_novas <= linhas_total` e `(status = 'conciliada') = (ref preenchido)`. Unique parcial `(tenant, fitid)` = reexportar o OFX nao duplica linha. RLS de leitura gestao (master/gerente) igual ao 0008; escrita so pela server action (service role).
2. **Rota `/financeiro/conciliacao`** (page + `ConsoleConciliacao.tsx`; entrada pelo botao "Conciliar extrato" no cabecalho do DRE em `/financeiro`). Parser no cliente: OFX por blocos `STMTTRN` (`DTPOSTED`/`TRNAMT`/`FITID`/`MEMO`) e CSV `data;descricao;valor` (`;` ou `|`, cabecalho cai fora, `dd/mm/aaaa` ou ISO, `1.234,56` e `(123,45)` negativo). **Sugestao** = valor igual (±0,009) + data em ate 5 dias, so contra candidatos que sairam do caixa fisico: liquidacoes com `method <> 'dinheiro'` (dinheiro = gaveta, nao banco) e despesas pagas. Botoes Conciliar/Ignorar/Desconciliar/Reabrir, filtros `Mês do extrato`/`Status das linhas`, cards de pendentes/conciliadas/saldo e faixa de `Importacoes`.
3. **Server actions** (`src/app/financeiro/actions.ts`): `importarExtrato` valida competencia, fonte, 1..500 linhas (data ISO, descricao, valor != 0), dedupe FITID antes e dentro do lote, fallback linha a linha se o batch estourar `23505` (reajusta `linhas_novas` depois) e audita `extrato.importar` com `{total, novas, repetidas}`; `conciliarLinha` valida que o alvo (settlement/expenses) e do tenant antes de gravar o vinculo e audita `extrato.conciliar/ignorar/desconciliar/reabrir`. Conciliacao e CONTROLE: **nenhum lancamento novo no diario**.
4. **Ritual nas duas bases**: `preflight/0027` -> `migrations/0027` -> `tests/0027_test.sql` = **18 asserts / 0 falhas** em staging (`urlfwxeflxpdmmxkuuur`) e producao (`cbnmnpnpioukbzircmzn`) pelo helper `supabase-query-pat.ps1` (ver "Ambientes", linha 23). type-check 0, lint 0, build ok (29 rotas).
5. **E2E `e2e/conciliacao.cjs` (32 checks)** - ultimo da cadeia `npm run e2e` (depois de `despesas`): gate, validacoes do form (vazio/lixo travam o botao, cabecalho CSV nao vira linha), importacao CSV (3 linhas com sinal + cards), OFX com FITID (reimportar -> `0 linha(s) importada(s) — 2 repetida(s) ignorada(s)`), sugestao pre-carregada na despesa-cenario de 132,45, conciliar/ignorar/desconciliar/reabrir conferidos no banco, filtros de mes/status, auditoria `extrato.*` e limpeza (extratos fora por cascade; a despesa-cenario sai, o diario fica).
6. **Deploy (07/10/2026)**: push `staging` `b66f612..be8aeec` (9 commits — marketplaces M1, fotos reais, IBSCBS/Bloco 3, despesas, conciliação, Bloco 6) com a conta `nuvem-de-papel` (linha 39) → CI `37696190509` success (Lint/Type-check/Build, 1m28s) → merge ff em `main` → push `b66f612..be8aeec` → Vercel Production + Preview success → validação (`/` 200, `/financeiro/conciliacao` 307→login, `/produtos/agenda.jpg` 200).

## Dados de demonstracao (05/10/2026)

1. **Motivo**: o cliente autorizou povoar a producao com dados ficticios (valores, quantidades, precos, pesos, clientes, fornecedores, revenda e produtos) porque o sistema ainda nao e usado por ninguem; no voao definitivo tudo e apagado e recomeca da estaca zero. Ferramentas em `supabase/seed/`:
   - `demo-wipe.sql` - desliga os gatilhos de imutabilidade **dentro da transacao**, zera diario/pedidos/compras/titulos/despesas/caixa/estoque e os cadastros demo (`id d3e00000-...`). `nfe_*`/`notas_entrada` sao apagadas **antes** de `orders` (a constraint `nfe_emissoes_check` exige `order_id` ou `purchase_order_id`).
   - `demo.sql` - 10 secoes que passam pelo caminho de verdade (pedido -> faturamento -> titulo -> liquidacao; compra -> recebimento -> estoque; despesa -> gatilho 0023 -> diario), idempotente por ids fixos e `where not exists`.
2. **Transacao em DOIS commits**: os gatilhos de diario sao `deferrable initially deferred`, ou seja, rodam **no COMMIT**. Se o seed inteiro fosse um commit so, a secao que calcula PIS/COFINS e IR leria o diario vazio e gravaria 0. Por isso `demo.sql` faz `commit;` apos as despesas e abre `begin;` de novo antes de calcular impostos (cabo em `demo.sql:580-581`).
3. **Coerencia conferida em producao (05/10/2026)**: `debito = credito = 404.538,32`; compras `82.096,00` - CMV `59.341,00` = estoque `22.755,00` (mesmo valor de `1.1.3` = `82.096,00 - 59.341,00`); saldo de `1.1.2` = `9.904,00` = unico titulo em aberto (`FAT-DEMO-011`); todo titulo de receber bate com `sum(order_items.total)` do pedido e todo titulo de pagar com `purchase_receipts.total`; saldo de estoque por SKU = `comprado - vendido` em todos os 10 SKUs.
4. **Resultado liquido por competencia (positivo nos 6 meses)**: mai `1.217,97`, jun `2.058,75`, jul `753,15`, ago `1.368,56`, set `1.710,52`, out `707,23` (receita bruta `16,7k-20,7k`, CMV ~57%, custo fixo `6.170,00` + depreciacao `250,00`, EBITDA = resultado antes da depreciacao, ou seja `resultado + 250`). Verificado na tela `https://nuvem-de-papel.vercel.app/financeiro` (competencia outubro/2026) e por SQL em `v_dre`.

## Zeragem definitiva dos dados ficticios (0034 — 19/10/2026)

1. **Motivo**: o cliente confirmou manter usuarios/perfis e o cadastro-base, e apagar TODO o resto (vendas, pedidos, compras, titulos, despesas, caixa, estoque, diario, clientes, fornecedores, produtos, assinaturas, marketplaces operacionais, e-mail, campanhas, audit log, endereços, webhooks). A migration `0034_zeragem_dados.sql` e o "zerar" definitivo (o `demo-wipe.sql` continuava deixando os cadastros demo; esta apaga tambem clientes/fornecedores/produtos reais de teste).
2. **O que SOBREVIVE**: `auth.users`, `profiles`, `tenants`, `tenant_branding`, `tenant_company`, `sefaz_config`, `account_catalog` (60 contas), `tenant_accounts` (60), `cost_centers` (4), `club_plans` (3), `freight_tabelas` (160 linhas Correios), `marketplace_channels` (10 canais).
3. **Ordem e gatilhos**: desliga as 7 travas de imutabilidade (`trg_journal_*`, `trg_financial_settlements_*`, `trg_caixa_movements_*`, `trg_stock_movements_*`) dentro da transacao; apaga `nfe_*`/`notas_entrada` **antes** de `orders`/`purchase_orders` (constraint exige um dos dois — `0011:26-27`, `0017:136`); `settlements -> installments -> titles` e `caixa_movements -> sessions` por causa do `on delete restrict` (`0008:158`, `0008:139`, `0008:62`); `orders`/`campaigns` antes de `customers` (restrict `0003:22`).
4. **Ritual executado nos DOIS bancos (19/10/2026)**: staging `urlfwxeflxpdmmxkuuur` e producao `cbnmnpnpioukbzircmzn` — preflight (base confirmada), migration (todas as operacionais zeradas, base preservada), pgTAP `0034_test.sql` (`TESTE OK` nos dois). Commit `a7f2e22` em `staging` e `main`; CI `39221533307` (staging) success.
5. **Rollback NAO existe**: `rollback/0034_rollback.sql` so documenta — os dados sao perdidos. Se precisar restaurar, Point-in-Time Recovery do Supabase. Helper de SQL recriado em `C:\Users\joaqu\AppData\Local\Temp\opencode\supabase-query-pat.ps1` (usa PAT lido de `sbp-token.txt`, nunca commitado — tokens reais NAO ficam neste arquivo; ver no gerenciador de tokens do Supabase se precisar gerar um novo).

## Cobrança automática — régua de lembretes (0035 — 19/10/2026)

1. **O que e**: régua que manda e-mail (Resend) nos dias `-3, 0, +3, +7, +15` em relacao ao vencimento de parcelas a receber em aberto, e PARA sozinha quando a parcela e liquidada. WhatsApp (Meta Cloud API) fica para etapa 2 — por enquanto so email. Prompt de origem: "Cobrança automática com IA" (`_nucleo-ia/Cobrança automática com IA.txt`).
2. **Tabelas (0035)**: `cobranca_reguas` (dias, canal `email|whatsapp|ambos`, ativo, texto; unique `(tenant_id, dias)`; seed das 5 etapas) e `cobranca_envios` (trilha com unique `(installment_id, regua_id, canal)` — idempotencia, nunca manda a mesma etapa 2x). RLS leitura `master|gerente` (mesmo padrao do financeiro `0008:179-204`).
3. **Motor**: `src/lib/cobranca.ts` — pega parcelas `status='aberto'`, casa a etapa mais recente cujo dia chegou e ainda NAO foi enviada (nunca 3 atrasadas de uma vez), manda SÓ ela, registra em `cobranca_envios` (mesmo em falha, para retry) e usa `enviarEmail()` com `relatedEntity='financial_installments'`. Join manual `financial_titles.customer_id -> customers` (sem FK, `0008:124`).
4. **Disparo**: server action `executarCobrancaManual()` (botao do painel) e cron route `GET|POST /api/cron/cobranca` (fail-closed sem `CRON_SECRET` → 503; header `Authorization: Bearer <secret>`; **GET** é o que o Vercel Cron usa). **Producao**: `CRON_SECRET` + agendamento no `vercel.json` — ver secao "Crons da Vercel + env vars de producao" (20/10).
5. **Console**: `/financeiro/cobranca` (link em `/financeiro`), abas Cobranças/Régua/Histórico, execução manual, edicao de texto com variaveis obrigatorias `{nome} {valor} {vencimento}`. Validado em staging: migration (2 tabelas RLS + 5 regras `-3,0,3,7,15`), motor E2E (achou parcela, casou etapa, chamou Resend, gravou trilha; falha so por Resend recusar dominio de teste), type-check/lint/build limpos. **Em producao desde 20/10/2026** (ritual 0035–0039 + merge `0680efb` — ver "Crons da Vercel + env vars de produção").

## Notificação automática de clientes (entrega 2 — 19/10/2026)

1. **O que e**: quando o pedido muda de status, o cliente recebe e-mail (Resend) automaticamente. Motivo: o fluxo `/logistica` (que avanca `orders.status` pago→processando→em_rota→entregue) **nao avisava ninguem**, e **cancelamento nao notificava em fluxo algum**. O `/vendas` (entregas) ja avisava em_transito/entregue/falhou (`vendas/actions.ts:987`). Prompt de origem: "Notificação automática de clientes" (`_nucleo-ia/`). WhatsApp (Meta Cloud API) fica para etapa 2 — por enquanto so email.
2. **Templates novos** (`src/lib/email.ts`): `templatePedidoSeparado` (processando), `templatePedidoEnviado` (em_rota), `templatePedidoEntregue`, `templatePedidoCancelado` — so mensagem de servico, sem propaganda (CDC).
3. **Helper**: `src/lib/pedido-notificar.ts` → `notificarStatusPedido(admin, pedidoId, evento, actor)`. Busca cliente via `order -> customers(name,email)` (join manual, `customer_id` sem FK), descarta `balcao@nuvemdepapel.com.br` (cliente interno do PDV `0015`) e email invalido, manda best-effort (try/catch — **nunca derruba a action**) via `enviarEmail()` com `relatedEntity='orders'`.
4. **Onde esta ligado**: `logistica.avancarExpedicao` (processando/em_rota/entregue — `logistica/actions.ts`), `logistica.cancelarPedidoNaoPago` (cancelado) e webhook MP cancel (`api/webhooks/mercadopago/route.ts`). **Idempotencia de graça**: quem chama so chama quando o status MUDOU de verdade (update com `.in("status",[de])`); no webhook, so quando o update casou 1 linha (mesmo padrao do caminho `approved`). Um retry/reentrega nao re-avisa.
5. **Validado em staging (19/10/2026)**: pedido de teste `pago` → avancou para `processando` pela tela `/logistica` → aviso "Pedido #... em separação" gravado em `email_messages` (status `failed` so por Resend recusar `example.com`, dominio de teste — nao e bug). type-check/lint/build limpos. Commit `bb20adc`. **Em producao desde 20/10/2026** (sem migration — so codigo; foi no merge `0680efb`).

## Recuperação de carrinho abandonado (entrega 3 — 19/10/2026)

1. **O que e**: régua de e-mail (Resend) que retoma pedido parado em `aguardando_pagamento` — cliente iniciou checkout e não pagou. Lembra com o link de pagamento 1, 3 e 7 dias depois do pedido, só a etapa mais recente que faltar. **Para sozinha**: ao virar `pago` (webhook MP 0007:97) ou `cancelado`, o pedido sai da consulta. Prompt de origem: "Recuperação de carrinho/orçamento" (`_nucleo-ia/`) — a versão de orçamento não se encaixa no ERP; a de carrinho abandonado encaixa no checkout.
2. **0036** (migration + preflight/rollback/test): `cart_recovery_rules` (toques +1/+3/+7, texto) + `cart_recovery_sends` (trilha **idempotente** por unique `(order_id, rule_id)` — nunca manda o mesmo toque 2x) + `orders.mp_init_point` (passa a persistir a URL de pagamento do MP — antes só ficava em memoria no checkout `actions.ts:455`). RLS leitura master/gerente (0008:179-204). Seed das 3 regras em todos os tenants.
3. **Motor**: `src/lib/cart-recovery.ts` → `executarReguaRecuperacao()`. Pega pedidos em `aguardando_pagamento`, casa etapa mais recente não enviada, manda só ela com `{link}`, grava envio. Sem `mp_init_point` pula (toque viraria muro de texto). Mesmo contrato da 0035 (best-effort, trilha, Resend). Bug de janela achado no teste: limite era `maxDias` (7d) e excluía pedido de 2d — passou a `minDias` (1d).
4. **Disparo**: server action manual (`/vendas/recuperacao/actions.ts`) + cron `GET|POST /api/cron/recuperacao` (secret `CRON_SECRET`, mesmo do `/api/cron/cobranca`; GET = Vercel Cron). Console `/vendas/recuperacao` (link "Recuperar carrinhos abandonados" na `/logistica`): abas Pedidos/Régua, edição de texto com variáveis obrigatórias `{nome} {codigo} {link}`. Checkout passou a gravar `mp_init_point` junto com `mp_preference_id`.
5. **Validado em staging (19/10/2026)**: migration ritual verde (2 tabelas RLS, coluna, 3 regras `1,3,7`); E2E — pedido parado há 2d → toque +1d disparado, trilha em `cart_recovery_sends` + `email_messages` (failed só por Resend recusar `example.com`). type-check/lint/build limpos. Commit `29e5f01`. **Em producao desde 20/10/2026** (ritual 0035–0039 + merge `0680efb` — ver "Crons da Vercel + env vars de produção").

## Marketing: reativação + avaliações (entrega 4 — 19/10/2026)

1. **O que e**: dois prompts da familia A juntos — "Reativação de clientes inativos" + "Coleta automática de avaliações" — na versão **SEM IA e SEM WhatsApp** (o stack nao tem provedor de IA; WhatsApp oficial fica pra etapa 2). Tudo por e-mail (Resend), regras simples, reaproveitando `customers` + `orders`.
2. **0037** (migration + preflight/rollback/test): `marketing_config` (link do Google, prazos de reativacao/avaliacao por tenant) + `customer_reactivation` (estado + `descadastro_token` p/ opt-out, unique `customer_id`) + `review_requests` (1 por pedido, unique `order_id`, clique/nota/reclamacao/resolvida). RLS so leitura master/gerente (0008:179-204).
3. **Reativacao** (`src/lib/reativacao.ts`): cliente que comprou e nao volta ha N dias (padrao 90, `reativacao_dias`) recebe e-mail citando a ultima compra (`order_items.name`), com opt-out LGPD. Cooldown (padrao 60d) impede re-contato; status `saiu`/`nao_incomodar`/`voltou` nunca entra. **upsert antes do envio** pra o link `/sair/[token]` já sair com o token (bug corrigido: antes o link saia sem token).
4. **Avaliacoes** (`src/lib/avaliacoes.ts`): pedido `entregue` ha >=3d (`avaliacao_atraso_dias`) sem review_request ganha pedido de avaliação com link curto `/avaliar/[orderId]`. **Regra do Google**: sai pra TODOS por igual (sem review gating), nunca pede nota alta nem oferece vantagem (CDC). Sem `google_review_link` configurado, nao envia nada.
5. **Rotas publicas** (sem auth): `/sair/[token]` marca `saiu` (opt-out, GET pq cliente de email nao faz POST) e `/avaliar/[orderId]` grava `link_clicado_em` (idempotente, 1a vez so) e 302 pro Google. **Cron** `GET|POST /api/cron/marketing` (secret `CRON_SECRET`; GET = Vercel Cron) roda as duas engines; botao manual em `/crm/marketing` (item "Marketing" no menu lateral, `AdminShell.tsx`) com stats + painel de reclamações (marcar/resolver à mão — detecção automática por IA fica pra etapa 2).
6. **Validado em staging (19/10/2026)**: migration ritual verde (3 tabelas RLS, uniques, config semeadado); E2E — inativo 120d + entregue 5d → 2 e-mails disparados, trilha em `customer_reactivation`/`review_requests`/`email_messages`; clique `/avaliar` gravou e deu 302 pro Google; `/sair` confirmou opt-out. type-check/lint/build limpos. Commit `60dbc66`. **Em producao desde 20/10/2026** (ritual 0035–0039 + merge `0680efb` — ver "Crons da Vercel + env vars de produção").

## Catálogo com IA — descrição de produto com Gemini (entrega 5 — 0038 — 19/10/2026)

1. **O que e**: o dono gera a **descrição pública** de um produto do catálogo existente com IA (Gemini), revisa/edita e salva; ela aparece na página do produto `/produtos/<sku>` e na vitrine do hero da home (`HeroVitrine.tsx`) — o card não mostra mais desde a vitrine nova (atualizado 17/11/2026). Escopo acordado com o cliente: IA no **catálogo atual** (o prompt de origem "Catálogo de produtos com IA" descrevia um bot de vendas no WhatsApp — fica pra etapa 2, exige credencial da Meta). **Regra de ouro** (prompt de origem): a IA **nunca inventa** produto/preço/marca — ela só redige a partir do `name`, `category`, `fabricante`, `sku` já cadastrados. **Provedor**: só Gemini (chave do cliente 19/10, `gemini-3.8-flash` — `2.5-flash` foi descontinuado p/ novos usuários).
2. **Adaptador de IA** (`src/lib/ia/`): ponto **único de plugue** — `index.ts` expõe `gerarTexto(prompt)` e despacha por `IA_PROVEDOR` (padrão `gemini`); `gemini.ts` faz POST em `generativelanguage.googleapis.com` (header `x-goog-api-key`, envs `GEMINI_API_KEY`/`GEMINI_MODEL`), timeout 45s, contrato **best-effort** (nunca lança — devolve `{ok,texto|motivo}`). Pra acrescentar OpenAI/Claude: criar o arquivo do provedor + 1 linha no switch, sem tocar em quem chama.
3. **Migration `0038_catalog_description`**: só `catalog_items.description` (text, nullable) — descrição pública da vitrine. RLS não mudou (herda o acesso de `catalog_items`). Ritual no staging: preflight OK → migration → pgTAP `TESTE OK`.
4. **Server action** (`cadastro/actions.ts`): `gerarDescricaoProduto(itemId)` (gestão-only, lê o produto, monta o prompt anti-invenção, chama `gerarTexto`, devolve o rascunho **sem gravar**; `gemini_sem_chave` vira erro claro) + `salvarProduto` ganhou `descricaoVitrine` (trim, máx 2000) gravando `description` no update e no insert.
5. **UI** (`CadastrosTelaUnica.tsx`): aba **"5. Descrição IA"** no form de produto (nasceu como "3. Descrição (IA)"; renomeada em `68c905b`, 09/11/2026) — textarea `#ct-prod-descricao-vitrine` + botão "✨ Gerar descrição com IA" (`gerarDescricaoIAUI`, exige produto já salvo; preenche o textarea, não grava). O dono edita e clica **Salvar** (persiste + audit `produto.atualizado`). Vitrine: `getStoreProducts`/`VarejoProduct` (`lib/products.ts`) expõem `description` e o card (`CategoryCarousel.tsx`) mostra até 3 linhas com ellipsis.
6. **Validado em staging (19/10/2026)**: type-check 0 · lint 0 · build ok (36 rotas) · **E2E `e2e/catalogo-ia.cjs` 7/7** (suíte nova no fim do script `e2e`): cria produto de teste, gera com IA real (Gemini), confirma sem preço inventado, grava em `catalog_items.description`, aparece na vitrine `/produtos`, limpa o lixo. Chave Gemini **só no `.env.local`** (`GEMINI_API_KEY`, gitignored) — nunca commitar. **Em producao desde 20/10/2026** (ritual 0035–0039 + merge `0680efb` — ver "Crons da Vercel + env vars de produção").

## Carta de insights com IA — dashboard (entrega 6 — 0039 — 19/10/2026)

1. **O que e**: o dono clica em "Gerar carta da semana/mês" no console `/crm/carta` e recebe uma carta curta (resumo, o que melhorou, o que piorou, atenção, faltam dados, o que fazer) escrita pela IA sobre os **números que o próprio ERP já calcula** — faturamento, pedidos, ticket, clientes novos, contas a pagar/receber 7d, atrasadas, margem. Escopo acordado: o prompt de origem "Dashboard de gestão com IA" descrevia um produto separado (planilha, funil, metas manuais, importador, Recharts) — ficou só a essência "com IA" sobre os dados existentes, mesmo critério da entrega 5. **Regra de ouro**: QUEM CALCULA É O CÓDIGO, A I.A SÓ ESCREVE com etiquetas `{chave}`.
2. **Migration `0039_insight_cartas`** (+preflight/rollback/test): `insight_cartas` (tipo semanal|mensal, periodo_inicio/fim, `indicadores` = foto jsonb dos números, `texto` = seções jsonb, `status` completa|incompleta|falhou, `reprovados`, `enviada_em`). RLS leitura só master/gerente, escrita deny-all (service_role). Ritual staging: preflight OK → migration → pgTAP `falhas=0`.
3. **`src/lib/insights.ts`** (o motor): `calcularIndicadores(inicio,fim)` monta 14 chaves (`fat_periodo` x `fat_anterior` + `var_fat/pct`, `pedidos`, `ticket`, `clientes_novos`, `receber_7d`, `pagar_7d`, `atrasadas_qtd/valor`, `margem` só se tiver `cost_price`) de `orders`/`order_items`/`financial_installments`/`customers` + `faltamDados` que o **código** escreve; `gerarCarta()` chama a IA (adapter `src/lib/ia/`), **valida** (`conferirCarta`: etiqueta inexistente ou `R$`/decimal fora de etiqueta ⇒ rejeita; inteiro de prosa "próximos 7 dias" passa), **substitui** (`substituir`) e tem 2 tentativas (cobre transitório do provedor); se falhar 2x, salva `incompleta` com o resumo de fallback.
4. **Console `/crm/carta`**: `page.tsx` (guard gestão, lista 30) + `ConsoleCarta.tsx` (botões semanal/mês, seções, badge completa/incompleta) + `actions.ts` (`gerarCartaAgora` = indicadores → carta → grava → e-mail Resend best-effort em `emailAvisos()` com `enviada_em`). Menu lateral "Carta com IA" no `AdminShell.tsx`. **Cuidado de UI**: o `setMsg` do feedback tem de ficar **FORA** do `startTransition` — dentro dele o React segura o render até a action terminar e o "Gerando..." nunca aparece (bug real achado no E2E).
5. **Validado em staging (19/10/2026)**: type-check 0 · lint 0 · build ok · **E2E `e2e/carta-ia.cjs` 9/9** (suíte nova no fim do script `e2e`): gera carta real, confere `indicadores` gravados, status `completa`, nenhuma etiqueta sobrando, todo dinheiro da carta bate com os indicadores (nada inventado), e-mail disparado, limpa as cartas. **Cota Gemini**: o free tier do `gemini-3.8-flash` dá só **20 req/dia** (estourou no meio da validação); o E2E final rodou com `GEMINI_MODEL=gemini-3.5-flash` (só `.env.local`, gitignored) — **Decisão do modelo (20/10): produção = `gemini-3.5-flash`** — o free tier do `gemini-3.8-flash` dá só **20 req/dia por projeto** (quebrou o E2E de 19/10), o `3.5-flash` validou 9/9 na mesma chave com cota padrão; trocar = 1 env var (`GEMINI_MODEL`) na Vercel, billing abriria o 3.8. Timeout do adaptador subiu pra 60s (`ia/gemini.ts`). **Em producao desde 20/10/2026** (ritual 0035–0039 + merge `0680efb` — ver "Crons da Vercel + env vars de produção").

## Crons da Vercel + env vars de produção (20/10/2026)

1. **`vercel.json` (novo)**: 3 crons **diários** — `/api/cron/cobranca` `3 12 * * *` (12:03 UTC ≈ 09:03 BRT), `/api/cron/recuperacao` `33 13 * * *` (10:33 BRT) e `/api/cron/marketing` `7 17 * * *` (14:07 BRT). Vercel Cron **só dispara em deploy de produção** e manda **GET** — por isso as 3 rotas agora exportam `GET|POST` (mesma engine, mesma auth; POST segue para agendador externo). Plano Hobby: 1 disparo/dia por cron (o Expressão tem de ser diária ou menos) e o disparo cai **em qualquer minuto da hora** marcada; até 100 crons por projeto em qualquer plano. Entrega é *best effort* (pode faltar ou duplicar um disparo) — as réguas já são idempotentes (trilha por `order`/`rule`).
2. **`CRON_SECRET`**: a Vercel anexa sozinha `Authorization: Bearer ${CRON_SECRET}` quando o env var se chama **exatamente** `CRON_SECRET` (docs "Securing cron jobs"). Rotas fail-closed: sem env → 503, secret errado → 401. Teste manual: `curl -H "Authorization: Bearer <secret>" https://<dominio>/api/cron/cobranca`. Sem retry da Vercel em falha — ver logs em Settings → Cron Jobs.
3. **Env vars de produção (conta `joaquimmscoelhoam-3974`, via CLI em 20/10)**: `GEMINI_API_KEY` (a mesma do `.env.local`, nunca commitar), `GEMINI_MODEL=gemini-3.5-flash` (decisão do dia — 3.8 free = 20 req/dia) e `CRON_SECRET` (valor novo exclusivo de produção, ≥16 chars; fica só na Vercel e em `.env.local` como `CRON_SECRET_PROD`).
4. **Validado em produção (20/10, ~01:40 BRT)**: ritual `0035`–`0039` completo em produção **antes** do merge (preflight → migration → cada asserção dos testes, statement a statement); merge ff `5748226..0680efb`; deploy Ready; env vars **exigem redeploy** — o deploy disparado pelo push não captura vars adicionados depois dele (`vercel redeploy <url>` resolve); rota responde 401 sem secret e com secret errado, 200 nos 3 disparos reais (base pós-zeragem = nada a disparar; `marketing_config.link_google` pendente de configurar quando quiser coletar avaliações). Alias `*.vercel.app` fica protegido por login Vercel de propósito; **produção pública = `nuvemdepapel.com.br`**.

## Venda manual — telefone/balcao (entrega 7 — 0040 — 20/10/2026)

1. **O que e**: o dono/gerente registra venda completa pelo `/vendas/nova` (botao "Nova venda" no cabecalho da Vendas Detalhada) **sem caixa aberto**: PF ou PJ, entrega ou retirada, todas as formas de pagamento (dinheiro, pix, debito, credito, boleto, fiado), com ou sem desconto. Escopo aprovado: "venda manual (telefone/balcao) ponta a ponta com todos os testes". Cancelamento de venda (etapa `venda`) segue fora — igual ao PDV.
2. **Migration `0040_venda_manual`** (+preflight/rollback/test): `orders_origem_check` + `'manual'`, `orders_payment_method_check` + `'fiado'`, `orders_condicao_check` estendido com `^[0-9]{1,2}x$` (o check antigo da 0015 so aceitava 'À vista'/'30 dias'/'30/60'/'30/60/90' — achado pelo smoke), `financial_titles_source_type_check` + `'manual'`. RPC **`manual_register_sale`** (security definer, execute só service_role): valida itens/estoque/cliente, **preco sempre server-side** (`resolve_price` com fallback varejo), estoque baixa direta via `register_stock_movement('venda')`, pedido nasce `etapa='venda'` `status='pago'` `origem='manual'` `venda_numero='V-'` (seq) SEM caixa; cliente existente (ativo) ou cria PF/PJ rapido (dedupe por documento, email placeholder `vendamanual-<8hex>@nuvemdepapel.com.br` porque `customers.email` e unico); TODO titulo `source_type='manual'` + parcelas — dinheiro/pix/debito liquidados na hora via `financial_settle` (mesma trilha do PDV ⇒ entram no diario), credito/boleto/fiado na regua de cobranca (boleto +3d, fiado +30d, credito +1..N meses); entrega (`p_entrega`) gera linha `entregas` `aguardando` com endereco jsonb, nulo = retira; idempotencia por `orders.idempotency_key` (mesma chave nao duplica).
3. **Server action `registrarVendaManual`** (`src/app/vendas/actions.ts`): so master|gerente (sem teto — regra de desconto por perfil do PDV nao se aplica, /vendas e modulo de gestao), valida tudo de novo no servidor **inclusive o digito verificador do CPF/CNPJ** (`src/lib/documento.ts` → `documentoValido`, usado tambem na UI para feedback imediato: borda vermelha + trava do botao), chama a RPC com `crypto.randomUUID()` e audita `venda.manual`. **UI**: pagina `/vendas/nova` (`page.tsx` server com itens+preco por canal e clientes ativos) + `ConsoleVendaManual.tsx` — **layout "console de balcao" em tela unica** (2 colunas: grade de itens como heroi a esquerda com cliente e entrega; pagamento em chips + resumo/TOTAL fixo a direita; atalhos F2/F4/F8/Ctrl+Enter; abaixo de 1000px colapsa em pilha unica). Cadastro rapido preenche rua/bairro/cidade/UF pelo **CEP (ViaCEP no blur)** — e o **CEP da entrega também** (mesmo caminho). Atencao: **o ViaCEP devolve a cidade em `localidade`, nao em `cidade`** (usar `j.localidade`; bug classico: rua/bairro/uf preenchem e a cidade fica vazia). Clicar em "Entregar" **traz o endereco do cliente** (cadastro em curso ou ja selecionado) com a faixa "E este ponto de entrega?" + botao "E outro — informar novo CEP" (limpa e foca o CEP); sem endereco no cadastro, mostra a dica de informar o CEP. Na Vendas Detalhada a coluna origem mostra "Manual · {canal}". Contrato E2E (aria-labels + `section[aria-label="Resumo da venda"]`) preservado.
4. **Validado em staging (20/10/2026)**: type-check 0 · lint 0 · pgTAP `falhas=0` · smoke comportamental da RPC 15/15 · **E2E `e2e/venda-manual.cjs` 28/28** (suíte nova na chain, depois de vendas-v5): PF pix+desconto, PJ fiado 3x+entrega (parcelas na regua, linha na Expedicao), cliente existente por busca+credito 2x, origem na lista, idempotencia, trava de estoque, limpeza. Vizinhas re-executadas verdes: vendas-v5 43/43, vendas 36/36, clientes 26/26, pdv-v6 33/33. Re-layout + DV + ViaCEP no commit `ee6cf1c` (20/10, staging) com E2E 28/28 re-executado. **Em producao desde 08/11/2026** (PR #10, merge `183dff8`; 0040 presente no banco de producao — conferido em 17/11/2026).
5. **Armadilhas pagas nesta entrega**: (a) `item_prices` tem PK de **4 colunas** desde a 0009 — `upsert(onConflict:"item_id,channel")` falha em silencio em fixture novo (bug latente do `f5.cjs`: passava so porque o fixture antigo ja tinha preco; a zeragem 0034 apagou os precos e a chain de 20/10 caiu no f5 — upsert corrigido para a PK completa no mesmo commit; qualquer fixture novo usa `onConflict:"item_id,channel,min_quantity,valid_from"`). (b) `CREATE OR REPLACE` com assinatura diferente cria **sobrecarga** — assinatura nova exige `DROP` da antiga na mesma migration. (c) plpgsql nao valida colunas na criacao: bug de parametro inexistente so aparece em runtime, por isso o smoke comportamental antes do E2E. (d) `stock_movements` imutavel + `on delete cascade` do item ⇒ item so vira `active=false`, nunca DELETE. (e) **f3 vazava estoque**: o checkout reserva 2 unidades e a limpeza so apagava o pedido (o ledger imutavel nao devolve) — o f3 consumia 2 do fixture do pdv-v6 a cada run e a chain de 20/10 caiu com saldo 1 (`ESTOQUE_INSUFICIENTE` no checkout); corrigido: f3 garante `SALDO_SEGURO=5` antes e devolve o saldo na limpeza via `register_stock_movement('ajuste')` (mesmo criterio do f5). (f) **compras-v1 quebrava com item fresco**: `ajustarEstoque(item, 0)` tentava registrar ajuste de **0** para criar a linha de `item_stock` (comentario antigo assumia isso), mas o RPC rejeita `QUANTIDADE_INVALIDA`; a linha agora e criada direto no `item_stock` zerada quando nao existe. (g) **documentos.cjs dependia de nota orfa**: o D6a-D8 (DANFE + download do XML) esperava uma nota em `nfe_emissoes` sobrando de runs antigos — a zeragem 0034 apagou a tabela toda e nenhuma suite da chain deixa uma (vendas/sefaz/vendas-v5 emitem e apagam a propria); a suíte agora semeia a propria nota (serie 9 = marcador da varredura, `chave` de 44 digitos, `protocolo` + `autorizada_em` porque o check `nfe_emissoes_autorizada_ok` exige, e `xml` de verdade para o D8) ligada ao PO que ja cria, e a limpeza apaga a nota ANTES do PO (o FK e `ON DELETE SET NULL`, sem isso fica orfa). (h) **produtos.cjs dependia do produto fictício "pastel"**: o P2g busca "pastel" no header de produtos para provar busca parcial por nome, mas a zeragem 0034 apagou o produto fictício — a suíte agora semeia o proprio (`SKU-E2E-PASTEL-*`, varredura no início e limpeza no final). (i) **Gemini free devolve "high demand" em pico**: `catalogo-ia.cjs` C3 (e o gerador da carta) chamam o Gemini real; o provedor recusa com "This model is currently experiencing high demand" em picos — **transitório** (standalone passa na hora). O C3 agora tenta **3x com 20s** entre tentativas antes de falhar; se cair de novo, é o provedor, não o código.

## Painel console — home de tiles (entrega 8 — 20/10/2026)

1. **O que e**: o `/crm` virou console de balcao (DNA do ERPClass legado, aprovado pelo cliente em mockup HTML antes de codar): faixa de acoes rapidas (chips reais — nova venda balcao, PDV, titulos, despesas, conciliacao, importar, precos), **4 indicadores vivos** (vendas de hoje com delta vs ontem, a receber 7 dias + vencidos, expedicao/estoque, clientes), **tile dominante navy "Efetuar venda"** com o estado do caixa (aberto desde HH:MM / fechado) e dois CTAs (PDV + venda balcao/telefone), 13 tiles de modulo com badge de estado (vencidos em rosa, entregas em azul, IA em lilas), 3 banners colapsaveis (componente cliente `src/components/admin/PainelBanners.tsx`), os blocos de sempre (clientes recentes, pedidos por status, campanhas ativas — cards agora brancos sobre o cinza) e faixa de status navy (`div.painel-status`, **nao** `<footer>`). CSS novo em `globals.css` ("Painel console") com colapso em 1180/900/760px.
2. **Dados**: `getCrmSummary` (`src/lib/crm.ts`) ganhou queries paralelas defensivas (todas com `tenant_id` e `limit`): parcelas receivable em aberto (vencida = status `vencido` OU vencimento < hoje ainda aberto/parcial — a regua pode nao ter rodado; **parse de coluna `date` ao meio-dio** para nao subtrair dia por fuso), `caixa_sessions` (unica aberta por tenant, indice `caixa_sessions_one_open`), `entregas` (abertas + prazo hoje), estoque e count exato de SKUs. **Armadilha paga**: `item_stock` e `item_commercial_data` sao irmaos (PK `item_id` em `catalog_items`) — **nao existe FK entre eles**; um `select` partindo de `item_stock` falha com "Could not find a relationship in the schema cache" (so aparece no log do `next start`, em runtime); a query parte do `catalog_items` embutindo os dois lados e trata embed objeto/array (mesmo padrao do PDV).
3. **Contratos E2E preservados**: heading "Painel CRM" + Voltar (PageHeader), nenhum `<footer>` na pagina (vendas.cjs N10 checa `document.querySelector("footer")`), "PDV" exato so no menu lateral (N2) e nenhum link com nome contendo "Usuarios"/"Auditoria" fora da engrenagem (N5 — o atalho "Usuarios" na pagina quebrava o teste; virou "Tabela de precos"). Verdes: **`vendas.cjs` 36/36** e **`f2.cjs` 15/15** (RBAC: master e operador com /crm 200). Helper `e2e/_print-painel.cjs` (fora da chain) tira prints wide/estreito para revisao visual. **Em producao desde 08/11/2026** (PR #10, junto com a entrega 7).

5. **Ajustes pos-aprovacao (20/10, cliente)**: h1 do `/crm` virou so a sigla **"CRM"** (sem subtitulo — `PageHeader` passou a aceitar `subtitulo` opcional e nao renderiza o " - " quando vazio) e a **faixa de acoes rapidas foi removida** (classes `painel-acoes*`/`painel-qbtn` removidas do CSS junto). E2E `vendas.cjs` **N7 ajustado** para o heading "CRM" (N6/N11 seguem checando "Painel CRM" no menu lateral, intocado). **Novo documento de governanca `docs/mapa-estrutural.html`**: mapa em arvore de todo o sistema (plataforma/ambientes, RBAC, loja, painel, APIs/crons, banco por dominio, integracoes, suites, convencoes) com busca e expansao total — regra de ouro: **toda mudanca estrutural (rota, modulo, tabela, cron, papel, integracao) atualiza o mapa no mesmo commit** (bump de versao + linha no changelog do proprio arquivo). Verde apos os ajustes: `vendas.cjs` 36/36, `f2.cjs` 15/15, type-check 0, lint 0, build ok. Commits `f63b4f7` + `dcc885b` (21/10); **em producao desde 08/11/2026** (PR #10).

## Bloco 4 - documentos (05/10/2026)

1. **PDF do pedido de compra**: rota nova `src/app/compras/pedido/[id]/page.tsx` (folha A4 com emitente, fornecedor, condicoes, itens, subtotal/frete/desconto/total e duas linhas de assinatura). Guard em duas camadas: middleware `/compras/:path*` (`src/middleware.ts:76`) e checagem de papel dentro da pagina (`page.tsx:111`) - sem sessao manda para `/login` (`page.tsx:68`), papel fora de `PAPEIS_GESTAO` manda para `/crm`, pedido inexistente responde `404` (`page.tsx:114`). O `select` com embed devolve `GenericStringError`, entao a linha crua vira `LinhaPo` (`page.tsx:74`), mesmo truque de `src/app/compras/page.tsx:33`. Botao `PDF` na coluna de acoes da listagem (`ConsoleCompras.tsx:1020`) abre a folha em nova aba.
2. **DANFE/impressao**: o documento auxiliar ganhou `div.doc-print` (`ConsoleVendas.tsx:2126`) e `div.doc-print-inner` (`ConsoleVendas.tsx:2145`); o botao `Imprimir / PDF` chama `window.print()`. A folha `@media print` (`src/app/globals.css:569`) esconde tudo menos `.doc-print`, anula padding/borda/sombra do dialogo (regra `!important` por cima do estilo inline), some com `[data-no-print]` e força A4 com `@page`. **O PDF sai do proprio browser** (Ctrl+P -> Salvar como PDF): zero lib de PDF no servidor e zero headless browser no deploy.
3. **Download do XML**: `buscarXmlNota()` (`src/app/vendas/actions.ts:1041`) le `nfe_emissoes.xml` **sob demanda** dentro da mesma `exigirGestao()` das demais acoes do modulo - o XML (varios KB) nunca entra na listagem. O botao `Baixar XML` (`ConsoleVendas.tsx:2198`) monta um `Blob` e dispara o download com nome `<chave de 44>.xml`; erro (nota sem XML) aparece em faixa vermelha e zera ao trocar de nota.
4. **Botao compartilhado**: `src/components/compras/BotaoImprimir.tsx` (componente client, ja nasce com `data-no-print`).
5. **Sem migration**: nada de banco novo no Bloco 4 - foi tudo front/server action sobre tabelas que ja existiam.
6. **Ritual**: `type-check` limpo, lint `No ESLint warnings or errors`, build ok (25 rotas, com a nova `/compras/pedido/[id]`), **E2E 440/440 - 0 falhas** (15 suítes; a nova `e2e/documentos.cjs` fecha com `TOTAL 21 | PASS 21` e entra no fim do script: `package.json` -> `node e2e/dre.cjs && node e2e/documentos.cjs`).
7. **Smoke do A1 agora e arquivo do repo**: `scripts/sefaz-a1-smoke.cjs` (nao roda na CI; exige `SEFAZ_A1_PFX` + `SEFAZ_A1_SENHA` fora do git). Confere `HTTP 200 / cStat 107 / tpAmb 2 / verAplic SP_NFE_PL009_V4`.
8. **NFC-e (modelo 65) continua nao emitida** (pendencia do Bloco 3): `emitirNfcePdv` segue fail-closed (`src/app/pdv/actions.ts:273-307`). O CSC ja esta gravado em `sefaz_config`, mas faltam o **credenciamento na NF-e Paulistana** (passo do cliente) e a formula oficial do QR Code da SEFAZ-SP - nao da para escrever sem o manual na mao.

## Bloco 5 - passo 1: vendedores e comissao (05/10/2026)

1. **Migration `0024_vendedores_comissao.sql`** (preflight -> migration -> pgTAP em **staging e producao**, **18 asserts / 0 falhas nos dois**): `sellers` (`0024:31`) com `commission_pct` 0-100, documento CPF/CNPJ e nome unico por tenant; `orders.seller_id` com FK `on delete set null` (`0024:77`); view `v_comissao` (`0024:103`); RLS de leitura so para master/gerente (`0024:130`). Sem pre-seed: a tabela nasce vazia.
2. **Politica de comissao e PARAMETRIZAVEL** (4 pontos, todos trocaveis na view): base = pedidos **faturados** (mesma regra do 0023: `status not in ('aguardando_pagamento','cancelado')`), competencia = mes de `orders.created_at`, percentual = `sellers.commission_pct` por vendedor, e **ninguem paga comissao automaticamente** - o sistema calcula, quem baixa e o financeiro.
3. **Telas**: aba `Vendedores` do console (`ConsoleVendas.tsx:925`, bloco `ConsoleVendas.tsx:1830`) com form de cadastro (nome/e-mail/CPF-CNPJ/telefone/% comissao/meta/ativo), edicao in-place, lista com Editar/Remover e a tabela **Comissao por mes**. **Atribuicao** no pedido exposto: `select[aria-label="Vendedor do pedido"]` (`ConsoleVendas.tsx:1301`) grava `orders.seller_id`.
4. **Server actions** em `src/app/vendas/actions.ts`, todas sob `exigirGestao()` + `audit_log`: `salvarVendedor` (`:1105`), `removerVendedor` (`:1175`) e `definirVendedorPedido` (`:1205`, recusa vendedor inativo). Leituras na pagina: `sellers` (`src/app/vendas/page.tsx:138`) e `v_comissao` (`:144`) via service_role - a view foi revogada de `anon`/`authenticated` no 0024.
5. **Ritual**: type-check 0, lint 0, build ok, **E2E 452/452 - 0 falhas** (16 suítes; a nova `e2e/vendedores.cjs` fecha `TOTAL 12 | PASS 12`, `e2e/vendedores.cjs:1`). Pegadinha de teste: os titulos usam `textTransform: uppercase`, entao `document.body.innerText` volta **em caixa alta** e a assercao de texto tem de comparar em minusculas.
6. **Bloco 5 restante: so o passo 3** - cadastro de cliente funcional (hoje e prototipo): `customers.email` e **not null** e `customers.tier` nasce em bronze. O passo 2 (tabela de preco) esta logo abaixo.

## Bloco 5 - passo 2: tabela de precos (05/10/2026)

1. **SEM migration**: `item_prices` ja tinha canal (`sales_channel` = `varejo|atacado`), faixa (`min_quantity`), vigencia (`valid_from`/`valid_until`) e a PK `(item_id, channel, min_quantity, valid_from)`. O que faltava era a tela e a disciplina de **uma linha por faixa**.
2. **REGRA DURA - uma linha por (item, canal, faixa)**, imposta pelos tres leitores de preco: o **checkout** leva a **maior faixa <= quantidade** e, no empate, a PRIMEIRA linha que o banco devolver (`src/app/checkout/actions.ts:138-143` - nao ha ORDER BY); o **PDV** leva a **menor faixa ativa e ignora a data** (`src/app/pdv/page.tsx:157-160`); a **loja** ordena por faixa ASC + `valid_from` DESC e fica com a primeira (`src/lib/products.ts:57-58`). Por isso `salvarPreco` faz o **upsert da linha nova e so entao apaga as outras da mesma faixa** (`src/app/configuracoes/precos/actions.ts:121`): se algo falhar no meio sobra uma linha de mais (o proximo salvamento conserta), nunca uma de menos (preco sumido do checkout).
3. **Tela** `/configuracoes/precos`: `src/app/configuracoes/precos/page.tsx:58` (sessao + `PAPEIS_GESTAO` no servidor, embed de `item_prices` por produto) e `src/components/precos/ConsolePrecos.tsx` - form de produto/canal/faixa/preco/vigencia (`ConsolePrecos.tsx:316`), tabela com situacao Vigente/Futura/Vencida (`ConsolePrecos.tsx:468`), filtro por SKU/nome, aviso de **produtos sem nenhuma faixa** (que nao aparecem no checkout) e o link no menu da engrenagem (`AdminShell.tsx:190`).
4. **Actions** `salvarPreco` (`actions.ts:121`) e `removerPreco` (`actions.ts:223`), ambas sob `gestorAtual()` (sessao + `PAPEIS_GESTAO`, fail-closed) + `audit_log` (entity `item_prices`, antes/depois) e `revalidatePath` de `/configuracoes/precos`, `/produtos` e `/`. `salvarProduto` foi ajustado junto (`configuracoes/cadastro/actions.ts:325` e `:341`): ele grava na linha-base da faixa 1 do varejo e apaga as demais - antes o upsert cego podia criar uma **segunda** linha para a mesma faixa.
5. **Ritual**: type-check 0, lint 0, build ok, **E2E 469/469 - 0 falhas** (17 suítes; a nova `e2e/precos.cjs:1` fecha `TOTAL 17 | PASS 17`). Duas pegadinhas de teste: (a) a gravacao roda dentro de `useTransition`, entao antes de mexer nos campos e preciso esperar o botao reabilitar **e** o valor esperado aparecer na tabela - quem le antes disso ve a gravacao anterior e o reset do formulario apaga o que acabou de digitar; (b) o `Intl` do Chrome separa "R$" do valor com **espaco inquebravel fino (U+202F)**, entao `innerText.includes("R$ 9,90")` so passa normalizando os espacos.
6. **Ficou de fora de proposito**: preco por `customers.tier` (bronze/prata/ouro/diamante). Muda os tres leitores e depende da decisao do cliente sobre ser desconto do Clube ou tabela propria (auditoria CISA, Bloco 5).

## Bloco 5 - passo 3: cadastro de cliente funcional (05/10/2026)

1. **SEM migration**: a tabela `customers` ja existia com tudo que a tela precisa (`0003_crm_core.sql:8`) - `email text not null` + `unique (tenant_id,email)` (`0003:12,16`), `tier` com check em `bronze|prata|ouro|diamante` e default `bronze` (`0003:13`), mais `documento`, `ie` e `uf` (migrations 0009/0015/0016). O que nao existia era o formulario gravar.
2. **Era prototipo e mentia**: a ficha tinha CEP, endereco, telefone, nascimento, profissao, "Receita Federal", contadores fixos (`Clientes total 318`) e botoes sem handler. **Endereco e telefone ficaram FORA de proposito** - a tabela nao tem essas colunas e mostrar campo que nao grava e mentira. *(Atualizado 14/10: virou a migration `0029` - ver secao "Cadastro completo do cliente" abaixo.)*
3. **Actions novas** em `src/app/configuracoes/cadastro/actions.ts`: `salvarCliente` (insercao ou update por id, com `tenant_id` em todas as queries) e `removerCliente`, ambas sob `gestaoAtual()` (sessao + `PAPEIS_GESTAO`, fail-closed) + `audit_log` (`cliente.criado`/`cliente.atualizado`/`cliente.removido`) + `revalidatePath` de `/configuracoes/cadastro`, `/crm` e `/vendas`. Validacao no servidor: nome 3-160, e-mail formato (obrigatorio), tier no check, **CPF/CNPJ com digito verificador** (funcao `cpfValido` ao lado do `cnpjValido` ja existente), UF na lista, pontos inteiro 0-1e9. 23505 vira `Ja existe um cliente com este e-mail.`; 23503 (FK) vira `Este cliente tem pedidos vinculados...`.
4. **Tela**: `page.tsx:74` busca os reais (`select ... orders(count)`, ate 500) e passa `clientes` (`page.tsx:215`) para `CadastrosTelaUnica` (`CadastrosTelaUnica.tsx:370`). Ficha com busca por nome/e-mail/CPF (autocomplete `.ct-ac`), campos ligados ao estado, `Incluir` (modal com nome/e-mail/doc/tier), `Apagar`, `Pesquisar`, `Imprimir` (`window.print()`) e `Salvar`. Contadores: total (bate com o banco), novos no mes e com pedidos - o "novos no mes" e calculado **nao `useEffect`** para o relogio do servidor nao entrar no HTML (hidratacao).
5. **Ritual**: type-check 0, lint 0, build ok, **E2E 471/471 nos testes de codigo** - a nova `e2e/clientes.cjs:1` fecha `TOTAL 22 | PASS 22`. A suíte `e2e/email.cjs` falhou com `daily_quota_exceeded` (cota diaria do Resend, ambiente - nao e codigo); todas as outras 17 suítes passaram.
6. **Pegadinha de teste**: o submit do modal e `form.ct-overlay button[type="submit"]` (a `<form>` carrega a classe `ct-overlay`; `ct-modal` e o filho) - seletor `form.ct-modal` nao existe e estoura timeout.
7. **Bloco 5 restante**: so a **decisao do cliente sobre preco por tier** (item 6 do passo 2).

Next.js (App Router) + TypeScript + Supabase/PostgreSQL + Vercel + Mercado Pago + pgTAP + Playwright.

## Marketplaces - Módulo 1: kernel (06/10/2026)

1. **Decisão do cliente (06/10/2026)**: integração multi-marketplace **módulo a módulo** - 1 módulo validado com testes na tela antes de abrir o próximo (M2 = Mercado Livre; M3 = Amazon/Shopee e, na sequência, Magalu/Via/AliExpress/Shein; M4 = nichados MadeiraMadeira/Netshoes/Dafiti). Arquitetura pedida: fila assíncrona (rate limit por canal), módulo central de OAuth 2.0 com ciclo de token, produto-mestre normalizado e **cada marketplace apenas um ADAPTADOR** (adicionar o 11º canal não mexe no core).
2. **Migration `0026_marketplace_core.sql`** (preflight/rollback/test - 24 asserts, 0 falhas no pgTAP do staging): 6 tabelas deny-all (RLS ligado + ZERO policies): `marketplace_channels` (catálogo global dos 10 canais semeados, 7 generalistas + 3 nichados; `api_docs` só com endereço conhecido, `null` = "a confirmar"), `marketplace_accounts` (tokens OAuth2 por tenant/canal, unique `(tenant, canal, label)`), `marketplace_listings` (unique `(conta, item)` + unique do externo), `marketplace_jobs` (**fila**: `marketplace_claim` com `FOR UPDATE SKIP LOCKED`, backoff `2^attempts` seg com teto 300, `dedupe_key` unique parcial enquanto o job está ativo), `marketplace_orders` (unique `(conta, id externo)` = puxar de novo não duplica), `marketplace_webhooks` (unique `(canal, event_id)` = replay idempotente). Funções `enqueue/claim/finish/reprocess` são SECURITY DEFINER com execute revogado de `public/anon/authenticated` e grant só para `service_role` (ritual do journal_post do 0021).
3. **Kernel TS** em `src/lib/marketplace/`: `types.ts` (`ProdutoMestre` = sku, nome, preço varejo, estoque - só dado que já existe no sistema; `MarketplaceAdapter` com publicar/atualizarPreço/atualizarEstoque/puxarPedidos/processarWebhook/renovarToken), `adapters.ts` (registro **vazio** no M1 - M2 chama `registrarAdapter()`), `fila.ts` (`processarFila` drena; o kernel só executa `ping` (heartbeat local) e `validar_item` (checagem do produto-mestre); job de canal **sem adaptador falha** com `adaptador '<slug>' pendente de implementacao (Modulo 2)` - o kernel **nunca inventa resposta de API**).
4. **Tela** `/configuracoes/marketplaces`: `page.tsx` (sessão + `PAPEIS_GESTAO`, 8 queries em `Promise.all`) e `ConsoleMarketplaces.tsx` (cards dos canais com chip Generalista/Nicho e docs/"a confirmar", contas com Ping/Remover, anúncios com Validar produto/Publicar na fila, fila com **Processar fila** devolvendo `Processados/Concluídos/Retentativas/Falhas`, botão Reprocessar só em Falhou, box do webhook). Actions todas sob `gestorAtual()`; `audit_log` **só** em criar/remover conta - a fila é a própria trilha operacional (tentativas e erro ficam no job). Item novo no menu da engrenagem "Marketplaces".
5. **Webhook** `POST /api/webhooks/marketplace`: fail-closed (sem `MARKETPLACE_WEBHOOK_SECRET` na env → 503; corpo inválido → 400; sem header → 401), idempotente (upsert `ignoreDuplicates` em `(channel_id, event_id)` → replay volta `{status:"duplicado"}`) e **sempre enfileira** `processar_webhook` com dedupe - o evento nunca é processado dentro da requisição do marketplace.
6. **Ritual**: type-check 0, lint 0, build ok (27 rotas), pgTAP 24/24 **nos dois bancos** (staging + produção — preflight → migration → pgTAP aplicados em 06/10), **E2E nova `e2e/marketplaces.cjs` 16/16** (encadeada por último no `npm run e2e`; `.env.local` ganhou `MARKETPLACE_WEBHOOK_SECRET`, gitignored). Pegadinhas: (a) a varredura do E2E **zera os jobs do tenant** - em staging não há worker e job órfão de run anterior (conta já removida ⇒ `account_id` null) fica pendente para sempre e contamina os contadores; (b) os embeds PostgREST vêm com o nome da TABELA (`catalog_items`, `marketplace_accounts`) - a página usa alias explícito (`item:catalog_items!inner(...)`, `canal:marketplace_channels!inner(...)`), senão a coluna renderiza "—"; (c) a leitura de `last_ping_at` espera o valor "sair de nunca" antes de afirmar. **Status do deploy (07/10):** tudo empurrado com a conta `nuvem-de-papel` (linha 39): `staging` em `be8aeec`, CI `37696190509` success, merge ff em `main` (`b66f612..be8aeec`), Vercel Production success; `MARKETPLACE_WEBHOOK_SECRET` ainda precisa entrar no **Vercel** antes de webhooks reais.
7. **`e2e/dre.cjs` — RESOLVIDO em 07/10 (Bloco 6 concluído, 0025 mantida)**: as 2 falhas de 06/10 (`pix sem titulo entra direto no caixa (1.1.1)` e estorno) tinham como causa a versão antiga da `0025_titulo_web.sql`; o `dre.cjs` foi repointado para a regra anti-dobra da 0022 e a suíte fecha **41/41**. Ritual final: em **produção** a 0025 estava com a função antiga (pgTAP assert 19 falhava — 2 títulos para o mesmo pedido) → migração reaplicada (**20/20**) e os **3 títulos `web:` duplicados** do backfill de 05/10 removidos (0 duplicados; nenhuma settlement/bank_linha referenciava os apagados).

## Frete Correios — matriz local sem credencial (0028 — 07/10/2026)

1. **Fonte**: simulador público dos Correios (`POST https://www2.correios.com.br/sistemas/precosPrazos/prazos.cfm`, form-urlencoded com campos ocultos `proCod_in_1..34`, data futura, CEPs com hífen; resposta em latin1 → `buf.toString("latin1")`) — **sem credencial** (Mercado Pago e API oficial descartados). WAF bloqueia rajada (403 por IP): o importador é retomável — checkpoint no banco (pula o que já existe), UA/Referer de browser, 3,5 s/req, 120 s de espera em 403 (até 6×) e retoma do mesmo ponto. **Nunca retomar com rajada.**
2. **Migration `0028_freight_tabelas.sql`**: `freight_tabelas` por (tenant, origem_cep, destino_regiao = 1º dígito do CEP destino, servico `pac|sedex`, peso_ate) — 10 regiões × 8 faixas de peso × 2 serviços = **160 linhas**. Ritual aplicado **nas duas bases** em 07/10 (staging e produção `cbmnnpnpioukbzircmzn`: preflight → migration → pgTAP **17/17** — produção **antes do merge**, regra 4 do fluxo).
3. **Importador** `scripts/importar-frete-correios.cjs` (10 CEPs representativos validados no ViaCEP): pegadinha — o `13010115` da região 1 (Campinas) **não existe** e o Correios devolve página sem "Preço do serviço" (falha determinística no parser); trocado por `13010000`. Origem = CEP de `tenant_company.endereco.cep` = 09850-730. Reexecutar é seguro (resume do checkpoint).
4. **Cotação só no servidor**: `cotarFrete`/`cotarInterno` em `src/app/checkout/actions.ts` — peso = Σ qty × (`weight_gross_kg ?? weight_kg ?? 0,3`), faixa = menor `peso_ate` ≥ peso; teto 20 kg → sem opções (fail-closed, só retirada). **O navegador manda apenas a modalidade** (`pac|sedex|retirada`), nunca o valor; `finalizarCheckout` recalcula e recusa modalidade fora da tabela.
5. **Escolha obrigatória**: `freteEscolha` nasce `null` no `CheckoutForm.tsx` e o servidor recusa modalidade ausente ("Escolha a modalidade de entrega…"). Default silencioso "retirada" seria armadilha: o backoffice trata `varejo + frete=0` como retirada e o pedido nasce **entregue** (EN-01, `vendas/actions.ts` ~:628). Gravação: `orders.frete` (`numeric(12,2)`, migração 0015), frete soma no `total_amount`, linha `Frete XXX` (`id: "frete"`) na preferência MP e `after.frete` no audit_log.
6. **UI** em `CheckoutForm.tsx` (seção "Entrega", `data-testid="entrega-frete"`): cotação automática por CEP (useEffect com cancelamento por `vivo`, guarda de carrinho vazio), erro de cotação **não** esconde a retirada (sempre é saída válida). **E2E `e2e/frete.cjs` 13/13** (encadeada por último no `npm run e2e`); `f3/f4/f6/clube` passaram a clicar em "Retirar na loja" antes de confirmar.
7. **Deploy de produção (07/10)**: matriz populada **antes do push** (importador na pasta de produção: 160/160, 0 falhas — sem janela sem frete), merge ff + push `273fc5f..2f99bdd` em `main`, CI `37718375419` **success** (lint/type-check/build) e build `2f99bdd` **servido no ar** — validado em produção: checkout exibe a seção "Entrega" e cotou para `01310-100` **PAC R$ 25,80 / 5 dias** e **SEDEX R$ 27,60 / 1 dia** (bate com o log do importador e com a query na matriz: 160 linhas, 2 serviços, 0 preços inválidos).

## Cadastro completo do cliente — contato, endereço e situação (0029 — 14/10/2026)

1. **Gap fechado**: a ficha do cliente (Bloco 5 passo 3) era enxuta de proposito porque `customers` nao tinha colunas de contato/endereco. A 0029 abriu as 13 colunas e a tela virou cadastro completo no mesmo desenho das telas de produto/empresa.
2. **Migration `0029_customers_cadastro_completo.sql`** (preflight/rollback/test): `telefone`, `whatsapp`, `nascimento date`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `observacoes`, `limite_credito numeric(10,2) not null default 0`, `ativo boolean not null default true`, `foto_url`. Checks: telefone `^[0-9]{10,11}$`, whatsapp `^[0-9]{11}$`, cep `^[0-9]{8}$` (so digitos — mesma convencao de `documento` da 0016; a mascara e da tela), `limite_credito >= 0`. RLS nao mudou (deny-all da 0003, so schema). Ritual **nas duas bases em 14/10** (staging `urlfwxeflxpdmmxkuuur` e producao `cbnmnpnpioukbzircmzn` — producao antes do merge, regra 4): preflight OK → migration → pgTAP **15/15 · 0 falhas** em ambas.
3. **Server action** (`actions.ts`): `ClienteInput` estendido com os 13 campos; validacoes novas — telefone 10-11 digitos, whatsapp 11, cep 8, nascimento data valida e nao futura, limite 0 a 10.000.000, observacoes max 2000 (so trim, preserva quebra de linha), textos de endereco normalizados e truncados. Grava sem mascara (`soDigitos`). `ativo` nasce true. Cabecalho antigo ("endere fora de proposito") atualizado.
4. **Tela** (`CadastrosTelaUnica.tsx` + `page.tsx`): grupos novos **Endereco** (CEP com busca ViaCEP no blur via `onCepCliente` — preenche logradouro/bairro/cidade/uf, clona o da empresa), **Contato** (telefone e WhatsApp com `mascaraTelefone`, `maxLength={16}`), **Documentos** com nascimento, checkbox "Inativo — bloquear atendimento" (`ativo` invertido), **Situacao comercial** com limite de credito + pill `ativo/inativo`, botao `Mensagem WhatsApp` (`wa.me/55{digitos}`) e textarea de Observacoes na lateral. Contadores ganharam **Ativos/Inativos** (`cliAtivos`). `page.tsx` faz select das 13 colunas + `mascaraTelefone` na carga. Campos antigos (nome/email/doc/ie/uf/tier/pontos + aria-labels da suite) intactos.
5. **E2E `e2e/clientes.cjs`**: +3 checks — **P13** ficha completa grava e sobrevive ao reload (confere telefone/whatsapp/cep/endereco/limite/observacoes direto no banco), **P14** contador de ativos == banco, **P15** marcar inativo grava `ativo=false` → **26/26**.
6. **Pegadinhas**: (a) `maxLength` do telefone e **16** — com 15, `"(11) 9 8877-2244"` trunca em 10 digitos antes da mascara e a action recusa (falhou o P13/P15 por isso); (b) limite chega da tela `"1.234,56"` (brl) e e convertido para numero no cliente antes do servidor (`Number("0,00")` = NaN se mandar cru); (c) `require("./helper")` sem extensao nao resolve `.cjs` — explicitar `./helper.cjs`.
7. **Flake de teste resolvido (pre-existente, nao era desta migration)**: `f5.cjs`, `pdv-v6.cjs` e `vendas-v5.cjs` gravavam `t0` com `new Date()` (relogio da **maquina**) e filtravam `.gte("created_at", t0)` — porem `created_at` e `now()` do Supabase, medido **~5,5 s ATRASADO** em relacao a maquina local (3 amostras: -5,7/-5,8/-5,1 s). Janela entre t0 e a gravacao no F5 e de ~3 s: quando o desfasado passava dela, o pedido "nascia antes" do t0 no relogio do banco e o C3 falhava (intermitente; reproduzi ate com `git stash` no codigo antigo — nao regressao). Correcao: helper `e2e/_relogio-banco.cjs` (`t0Banco`) grava um marco em `audit_log`, le o `created_at` devolvido (relogio do banco), apaga o marco e devolve — os dois lados da comparacao usam o mesmo relogio. Vale para toda suíte que compare relogio local com `created_at`.

## Cadastro de produto completo + importador por link do fornecedor (0031 — 14/10/2026)

1. **Gap fechado (Bloco 2)**: o form de produto tinha campos "fantasma" que nao gravavam nada (Fabricante, CST PIS/Cofins, Base de calculo, CST IBS/CBS, cClassTrib, GTIN tributavel, Observacoes, Data ultimo reajuste, "nao imprimir na tabela de precos") e nao existia tabela ligando item <-> fornecedor com dados de embalagem/logistica (o `supplier_item_map` da 0009 e so de-para sku->gtin). O fornecedor (Reval/Tilibra) confirmou que o SITE e a fonte oficial de dados (sem feed/API) — por isso o importador por link e o caminho.
2. **Migration `0031_produtos_completos_importacao.sql`** (preflight/rollback/test): `catalog_items` + `fabricante text`, `notes text`, `hide_price_table boolean not null default false`, `last_adjusted_at date`; `item_fiscal_data` + `cst_pis`/`cst_cofins` (**2 digitos**, CST 01-99 da tabela A/B — NAO 3 como o CST ICMS), `icms_base_pct numeric(7,4)` (0-100), `cst_ibscbs` (3 dig), `cclass_trib` (6 dig), `gtin_tributavel` (check GS1 `ean_dv_valido`); nova tabela **`item_supplier_data`** (tenant_id, item_id FK cascade, supplier_id FK set null, supplier_sku, manufacturer_ref, supplier_name, manufacturer, source_type `reval|manual|outro`, source_url, pack_qty/master_qty >=1, gtin_inner EAN-13, **gtin_master aceita GTIN-13 OU DUN-14**, dimensoes/peso emb e master em `numeric` — NUNCA jsonb, pra cubagem/frete; details jsonb so pros detalhes livres). Unique parcial `(item_id, supplier_sku)`, RLS 1 policy de leitura (item ativo). Ritual **nas duas bases em 15/10** (staging `urlfwxeflxpdmmxkuuur` e producao `cbnmnpnpioukbzircmzn` — producao antes do merge, regra 4): preflight OK → migration → pgTAP **20/20 · 0 falhas** em ambas.
3. **DUN-14 tem DV proprio**: o master do Reval (`17891027354944`) e DUN-14 (14 dig), e o DV e calculado sobre 14 digitos — NAO e o mesmo do GTIN-13 embutido (tirar o 1 da esquerda nao bate). Criada a funcao `dun14_dv_valido` (banco) e `dun14Valido` (TS, em `actions.ts`) alem do `ean_dv_valido` ja existente.
4. **Importador** (`src/lib/fornecedor-import.ts`, pura e testavel): `parsePaginaReval(html, url)` e `importarProdutoReval(url)`. Roda no SERVIDOR (server action `importarProdutoFornecedor` em `actions.ts` — Node faz fetch livre de CORS; o browser bloquearia). Pagina do Reval e ASP.NET WebForms server-rendered, tabela fixa `<th class=label>/<td class=data>` → regex simples, **sem cheerio, sem headless**. Parser DEFENSIVO (campo que nao vier vira null), `ehLinkReval` so aceita https do host reval.net (anti-SSRF), UA de browser, timeout 12 s, cache/limite 2 MB. Peso unitario = peso emb / qtd emb (`1,39 / 4 = 0,348 kg`). O unico campo que NAO vem e o PRECO (restrito a login de CNPJ). NAO grava nada: preenche o form e o usuario revisa + Salva.
5. **Form** (`CadastrosTelaUnica.tsx`): **linha 1** = `Código de barras (GTIN)` · `Descrição do produto*` · `Código interno` (grid inline `1.1fr 2fr 1.1fr`); **linha 2** = `Setor` · `Fornecedor/Cadastrar` · `Fabricante` · `Unidade` (`ct-r4-forn` = `1fr 1.5fr 1fr .5fr` — Fornecedor 1,5x e Unidade pela metade; some pro `1fr 1fr` em 920px e vira coluna unica em 560px) — os hints "busca automática/busca ou cria/busca ou cadastra na hora" sairam dos rotulos. **Setor nao tem cadastro proprio**: o dropdown deriva dos produtos (`setores` = `Set` de `produtos[].categoria`, `CadastrosTelaUnica.tsx:526`), valor novo digitado grava em `catalog_items.category` no Salvar e entra na lista no `router.refresh()` pós-salvamento; o botao "Cadastrar" (que so guardava em memoria) virou aviso `ct-ac-new` "Setor novo — grave o produto e ele entra na lista" (`:1331`). Campo **"Importar do fornecedor" (link + botao) nasce FECHADO** e abre pelo botao **"Busca web"** do header, entre Incluir e Relatorio (estado `mostrarImport`; o cursor cai no `#ct-prod-link`). *(Atualizado 17/11/2026: ate `68c905b` (09/11) abria so pelo atalho oculto Ctrl+Shift+[, que saiu.)* Rotulo do setor = `Setor`. Grupo **Fornecedor e embalagem** (fornecedor nome/codigo/ref, qtd emb/master, GTIN inner/master, dimensoes e pesos emb e master); campos que agora gravam ligados aos ids (`ct-prod-fabricante`, `ct-prod-cstpis`/`cstcofins` maxLength 2, `ct-prod-icmsbase`, `ct-prod-cstibscbs`, `ct-prod-cclasstrib`, `ct-prod-gtintrib` na aba Outros, `ct-prod-observacoes` na aba Observacoes, `ct-prod-oculta-preco`, `ct-prod-reajuste`). Removidos os fantasmas: "Codigo" fixo, aba "Foto", "Previsao de chegada", "Origem do produto". `page.tsx` faz select de tudo + `item_supplier_data`.
6. **Server actions** (`actions.ts`): `ProdutoInput`/`salvarProduto` estendidos (valida CST 2 dig, cClassTrib 6, gtin tributavel/inner/master com DV, icms_base 0-100, data reajuste ISO) e grava `catalog_items` + `item_fiscal_data` + **`item_supplier_data`** (so se veio ficha de fornecedor; `source_type = reval` se tem source_url, senao `manual`). Nova `importarProdutoFornecedor(url)` devolve `ProdutoImportado` (sku sugerido `REV-<codigo>`, todos os campos) + aviso do peso unitario calculado.
7. **Testes**: `e2e/produto-import.cjs` (**27/27**, OFFLINE — transpila o TS e roda contra fixture HTML do Reval, sem rede) e `e2e/produtos.cjs` (**8/8**, UI — importar sem link avisa, DUN-14 DV errado bloqueado, ficha completa grava em `catalog_items`+`item_fiscal_data`+`item_supplier_data`, reload persiste). As duas entraram no fim da cadeia `npm run e2e`. Regressao confirmada: fiscal 10/10, precos 17/17, f6 35/35, f2 15/15, marketplaces 16/16, compras-v1 69/69.
8. **Pegadinhas**: (a) CST PIS/Cofins e de **2 digitos** (o `GTIN_DB` fake ja usava "49"); errado era exigir 3; (b) GTIN master do Reval e DUN-14, so validando com `dun14_dv_valido`; (c) os campos de aba (GTIN tributavel, Observacoes) ficam escondidos ate clicar a aba — o E2E clica antes de preencher; (d) o `insert` de `catalog_items` precisa receber `hide_price_table`/`last_adjusted_at` junto do `update` (produto novo nao passa pelo update).
9. **Aviso no TOPO (14/10)**: feedback de erro/ok (`avisoTopo`, classe `ct-feed ct-feed-topo`, `role="alert"`) e renderizado logo apos o `ct-header` nas 5 telas (cliente/produto/empresa/fornecedor/revenda); a barra `ct-status` do rodape ficou **so com a dica estatica** (nunca mensagem de erro). Dentro do modal de cliente/fornecedor o feedback continua proprio do modal. Causa: o erro aparecia em vermelho dentro da barra escura do rodape, quase ilegivel.
10. **Hidratacao do `<style>`**: `<style>{css}</style>` quebra com seletor filho `>` no CSS (React escapa para `&gt;` no servidor e o cliente renderiza `>` → hydration mismatch). Corrigido com `<style dangerouslySetInnerHTML={{ __html: css }} />` (mesmo padrao de `layout.tsx`) — commit `49299bd`.
11. **Header do produto (15/10)**: os 4 botoes mortos do `.ct-menu` (Atualizacao/Relatorios/Listagem/Configuracao — nenhum tinha onClick) foram **removidos**, junto do CSS `.ct-menu`/`.ct-menu-btn`. Ordem nova do `ct-header` (`CadastrosTelaUnica.tsx:1344`): titulo → **busca** (`#ct-prod-busca`, `type="search"`) → **nav ◀◀ ◀ ▶ ▶▶** (`.ct-nav-prod`) → Salvar → Incluir → **Relatorio** (`#ct-btn-relatorio`) → spacer → pill. A busca casa **qualquer parte** de nome, GTIN e SKU (`achadosBusca`, `.filter(...).slice(0,12)`) e Enter carrega o primeiro achado; dropdown `ct-drop` e `position:fixed` porque `.ct-header` tem `overflow-x:auto` (cortaria um absoluto) — o fechamento fora e por `mousedown` em `window` checando `closest(".ct-drop")`/ids. O botao **Relatorio** abre `ct-drop[role="menu"]` com 5 relatorios (**Entradas, Saidas, Estoque, Patrimonio, Inventario**) gerados por `gerarRelatorioProduto(tipo)` em `src/app/configuracoes/importar/actions.ts` — a action devolve DADOS estruturados (`RelatorioDados` = titulo/subtitulo/colunas/linhas/resumo), e o **PDF e montado no cliente** por `gerarRelatorioPdf()` em `src/lib/relatorio-pdf.ts` (jsPDF + autoTable via **import dinamico**, so pesam no clique; A4 paisagem, cabecalho com titulo/data, faixa azul-cinza no cabecalho da tabela, linha de TOTAL no `foot` e pagina X de Y). Entradas/saidas = `stock_movements` com `quantity > 0` (entrada/devolucao/ajuste) ou `< 0` (venda/ajuste); estoque/patrimonio/inventario = `item_stock` + `catalog_items` (inventario tem coluna em branco pra contagem fisica; patrimonio soma `cost_price * stock_on_hand` e fecha com linha TOTAL). `reserva`/`liberacao` ficam de fora (mexem so no disponivel, nao no fisico). E2E `produtos.cjs` = **27/27** (P2e-P2l cobrem menu morto fora, busca, menu de relatorios, os 4 campos financeiros e as duas contas; P9a-P9c cobrem o fixture de nota de entrada; P10a-P10c cobrem a foto na vitrine, item 13 abaixo).
12. **Linha financeira com 4 campos (0033 — 15/10)**: a row "Financeiro e estoque" virou `ct-r4` com **Preço de custo** (`#ct-prod-custo`) · **Margem de lucro** (`#ct-prod-margem`) · **Custo Médio** (`#ct-prod-custo-medio`, `readOnly`+`disabled`, `opacity .7`, rotulo com hint "compras") · **Preço de venda\*** (`#ct-prod-venda`). A separacao existe porque `item_commercial_data.cost_price` era os DOIS conceitos ao mesmo tempo: o que o operador digitava E o custo medio PONDERADO reescrito pelo modulo de Compras na recepcao de nota (0017:471-494). A migration **`0033_item_commercial_data_preco_custo.sql`** criou `preco_custo numeric(12,4)` (check `>= 0`) e o **backfill** copia o `cost_price` atual pra la. `cost_price` continua sendo o custo medio — e o **CMV (0022:32) e o patrimonio continuam lendo ele**, entao nao pode virar "o ultimo preco digitado". `salvarProduto` grava `preco_custo` e so **semeia** `cost_price` quando ele ainda e `null` (`.is("cost_price", null)`) — produto novo ganha custo medio, produto que passou por Compras nunca tem a media sobrescrita. Duas contas no form (`lerNum` aceita "R$ 1.234,56" e "12.50"; `recalcVenda`/`recalcMargem` rodam em `onInput`+`onBlur`): **venda = custo x (1 + margem/100)** (margem sobre o CUSTO, nao sobre a venda) e **margem = (venda − custo) / custo x 100** (exige custo > 0, senao divide por zero). O CSV de `/configuracoes/importar` passou a ter 14 colunas, com `custo` = `preco_custo` e `custo_medio` = `cost_price` (antes exportava a media como se fosse o custo digitado). Ritual **no staging**: preflight OK → migration → pgTAP **6/6 · 0 falhas**. O `cost_price` so acompanha o preco digitado **enquanto o produto nao tem `purchase_receipt_items`** — `salvarProduto` consulta a FK `purchase_order_items!inner(item_id)` (0009:378) e, se achar nota, nao toca na media; a media ponderada e reescrita pelo recebimento da Compras (0017:471-494), e gravar por cima apagaria o custo real do CMV (0022) e do patrimonio. Enquanto nao ha nota, "media" e o proprio preco digitado e tem de acompanhar a edicao (senao a tela mostraria valor velho). Regressao: `dre.cjs` **41/41**, `compras-v1.cjs` **69/69**, `fiscal` 10/10, `precos` 17/17, `clientes` 26/26, `produto-import` 32/32. Ritual **nas duas bases em 15/10** (producao `cbnmnpnpioukbzircmzn` antes do merge): preflight OK → migration → pgTAP **6/6 · 0 falhas** em ambas; backfill em producao **10/10 produtos** com `preco_custo` preenchido (0 pendentes). Deploy 15/10: push `staging` `b5cecf3..a9f06be` → CI `38801116631` success → ritual de producao (0031+0032+0033 = **32 asserts / 0 falhas**) → merge ff `main` `88ac0a9..a9f06be` → CI `38806836781` success → Vercel em `https://nuvem-de-papel.vercel.app` (`/` 200, `/configuracoes/cadastro` 307→login, `/configuracoes/importar` 307→login, `/produtos/agenda.jpg` 200).
13. **Foto do produto (0032 — 15/10)**: o importador por link ja extraita a URL da foto do Reval, mas o cadastro nao tinha onde guarda-la — o unico `foto_url` que existia era o do CLIENTE (0029). A migration **`0032_catalog_items_foto_url.sql`** criou `catalog_items.foto_url text` + check `catalog_items_foto_url_check` que so aceita `https` e extensao `.jpg|.jpeg|.png|.webp` (com query string opcional). Guarda a **URL, nao o arquivo** — nao existe upload de imagem no cadastro, e a URL do fornecedor ja aponta pra imagem servida. Campo **Foto (URL)** no form (`#ct-prod-foto`, `CadastrosTelaUnica.tsx:1641`), preenchido automaticamente pelo importador (`:841`) e exportado no CSV de `/configuracoes/importar`. O Reval serve a foto em `/imagem/produtos/{g|m|pp}/{codigo}[sufixo].jpg` (`g` 1200px, `m` media, `pp` miniatura 54px) e `extrairFoto` (`fornecedor-import.ts:29`) tenta `g > m > pp` com fallback `/m/{codigo}.jpg`. **A vitrine USA a foto real** (gap fechado em 15/10): `getStoreProducts` seleciona `foto_url` e devolve `VarejoProduct.fotoUrl` (`products.ts:12,82`), `ProductCard.tsx:20` e `CategoryCarousel.tsx:91` repassam pra `ProductImage`, que usa a URL **so se passar** em `FOTO_REMOTA_OK` (`ProductImage.tsx:83` — `https` + `.jpg|.jpeg|.png|.webp`, MESMA regra do servidor em `actions.ts:287`); URL vazia, invalida ou com erro de carga (`onError`) cai de volta na ilustrativa da categoria (`ProductImage.tsx:102-106,143` — ex.: "bloco" casa `/produtos/caderno.jpg`). `<img>` de proposito (`eslint-disable` na linha 1): a URL e do fornecedor com host livre, entao nao existe `remotePatterns` no next.config. Coberto por `produtos.cjs` **P10a-c** (grava pelo form, confere `catalog_items.foto_url`, intercepta o host do reval.net com um PNG de 1px para o teste nao depender da rede, e confere a queda pra ilustrativa). A suíte **tambem limpa o lixo de rodadas anteriores** logo apos achar `antes` (`produtos.cjs:74-89`): um crash no meio deixava SKU + fixture de nota no banco e fazia P3/P4/P9a falharem em cascata na rodada seguinte. Ritual **nas duas bases em 15/10**: preflight OK → migration → pgTAP **6/6 · 0 falhas** em ambas.

Next.js (App Router) + TypeScript + Supabase/PostgreSQL + Vercel + Mercado Pago + pgTAP + Playwright.

## Identidade visual — paleta v3 cinza (aprovada pelo cliente 25/09/2026)

1. Fundos de página e cards: `#E0E0E0` (`--bg-cotton` e `--bg-cloud` em `src/app/globals.css`); bordas `#C9C9C9`, texto fraco `#CFCFCF`, sombras neutras `rgba(0,0,0,…)`.
2. Rodapé (Footer): `#3D3D3D` sólido (antes: gradiente navy). A barra do topo mudou em 18/11/2026 — ver "Barra do topo — vidro degradê" abaixo.
3. Mantidos: navy `#073B4C` (títulos/texto), CTA pink `#E084AC` (hover `#D06A97`), amarelo `#FFD166` só na marca, fontes Poppins + Open Sans.
4. Hero da home: vídeo full-bleed com rotação de 4 clipes Pexels 720p em `public/videos/` (crossfade no fim de cada clipe, pausa via IntersectionObserver + visibilitychange), overlay navy e fade do conteúdo na rolagem; `prefers-reduced-motion` ou Save-Data → cena SVG estática, sem vídeo e sem parallax.
5. Referência visual: `F:\Projetos\nuvem-de-papel-documentacao\Diversos4\preview-identidade-v2.html` (paleta + hero com vídeo).

## Barra do topo — vidro degradê (18/11/2026)

1. **Pedido do Joaquim** (referência de layout enviada por imagem): à esquerda o logo + "Nuvem de Papel" com "PAPELARIA" embaixo; no meio a busca arredondada; à direita favoritos (só ícone, ainda sem função), carrinho com contador e pessoa + "Entrar". Barra de ponta a ponta com o degradê rosa → lilás (`#F4C7D8` → `#D9C8F2`, 74% de opacidade) em **vidro** (`backdrop-filter: blur(16px) saturate(160%)`), sticky no topo. CSS no bloco "Barra do topo - vidro degrade" do `globals.css` (`.site-header*`, `.logo-home`, `.marca*`, `.header-busca`, `.busca-*`, `.header-acoes`, `.header-entrar`, `.header-links`, `.mobile-nav`).
2. **Logo leva para a Home em qualquer página do site**; no painel (`body:has(.admin-shell)`) o clique fica desligado por CSS (`pointer-events: none`) — o painel tem o próprio Voltar.
3. **Busca** (`src/components/busca/BuscaProdutos.tsx`) virou campo fixo no meio da barra (antes era uma lupa que abria painel): nome ou SKU, mínimo 2 letras, debounce 250 ms em `/api/produtos/busca`, lista flutuante embaixo, Enter/lupa abrem o 1º achado, Esc ou clique fora fecham. `aria-label="Buscar na loja"` **de propósito**: `Buscar produto` é o campo do PDV/venda manual (E2E) e o cabeçalho também aparece no painel.
4. **Rótulo da conta**: `Entrar` (deslogado) · `Minha conta` (cliente da loja → `/conta/pedidos`) · `Painel` (equipe, destino por papel). No celular (≤ 768 px) o texto some visualmente (fica só o ícone; o nome acessível continua), a busca vai para a 2ª linha inteira e os links vão para o hambúrguer.
5. **2ª linha provisória**: Home / Produtos / Publicações (+ Meus pedidos logado) até o Joaquim definir o que entra ali. Validado em 18/11: type-check 0, lint 0, build ok; `vendas-v5` 43/43 (H1: 390 px sem rolagem lateral), `vendas` 36/36, `f2` 15/15, `cadastro-basico-smoke-simple` 26/26. O `f3` caiu no C2 por ambiente, não pela barra: com `MERCADOPAGO_ACCESS_TOKEN` de teste no `.env.local` o checkout redireciona para o Mercado Pago e a suíte espera o caminho "pagamento desativado".

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

## Convencao de backup externo (definida 07/11/2026)

1. Volume dedicado, identificado por ROTULO (nao por letra): `FileSystemLabel = "BACKUP"`.
   Letra atual: `E:` — pode mudar em outra maquina. Scripts/rotinas devem resolver
   a letra em tempo de execucao, nunca hardcodar `E:\`:
   ```powershell
   $vol  = Get-Volume -FileSystemLabel "BACKUP"
   $dest = "$($vol.DriveLetter):\bk-nuvem-de-papel"
   ```
2. Convencao de pasta por projeto (cross-projeto, nao exclusiva deste repo):
   `<letra-resolvida>:\bk-<nome-do-projeto>\` — ex.: `E:\bk-nuvem-de-papel`,
   `E:\bk-imobiliaria`.
3. Pasta deste projeto ja criada: `E:\bk-nuvem-de-papel` (07/11/2026, volume
   NTFS "BACKUP", ~300GB total, ~99GB livres no momento da criacao).
4. Pendente (Fase 3 da auditoria 2026-11-07): rotina real de backup/restore dos
   dois projetos Supabase (dump logico + Storage export + checksum + teste de
   restore), gravando nesta pasta.

## Rotina de backup/restore Supabase (Fase 3 da auditoria, validada 08/11/2026)

1. Ferramentas: Supabase CLI (`supabase --version`) + Docker Desktop na maquina
   local. Nao precisa de `pg_dump` solto (o CLI usa o cliente embutido).
2. Login: `supabase login` (abre navegador, token fica salvo local). Cuidado:
   a conta pode vir logada em outro projeto/org (ja aconteceu com o CETADP) —
   sempre conferir com `supabase projects list` antes de prosseguir.
3. Dump (sempre staging primeiro):
   ```powershell
   $vol  = Get-Volume -FileSystemLabel "BACKUP"
   $dest = "$($vol.DriveLetter):\bk-nuvem-de-papel\<staging|producao>\<data>"
   New-Item -ItemType Directory -Path $dest -Force
   supabase link --project-ref <ref-do-projeto>   # cwfvxthfwbvpfjhsxpmc (staging) / urlfwxeflxpdmmxkuuur (producao)
   supabase db dump -f "$dest\schema.sql"
   supabase db dump --data-only -f "$dest\data.sql"
   ```
   Pede a senha do banco no prompt — nunca digitar em script/arquivo.
4. Checksum obrigatorio logo apos o dump: `Get-FileHash *.sql -Algorithm SHA256`,
   gravar em `checksums.sha256.txt` ao lado dos arquivos.
5. **IMPORTANTE — voltar o link pra staging depois do dump de producao**
   (`supabase link --project-ref cwfvxthfwbvpfjhsxpmc`) pra nao arriscar rodar
   outro comando (migration etc.) apontando pra producao sem querer.

### Teste de restore (validado 08/11/2026, dump de staging de 08/11/2026)

Usa Postgres local descartavel via Docker — nao toca em nenhum projeto Supabase real:
```powershell
docker run -d --name restore-test -e POSTGRES_PASSWORD=postgres -p 5544:5432 supabase/postgres:<versao-igual-ao-projeto>
docker cp schema.sql restore-test:/tmp/schema.sql
docker cp data.sql restore-test:/tmp/data.sql
docker exec restore-test psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f /tmp/schema.sql
docker exec restore-test psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f /tmp/data.sql
docker rm -f restore-test   # ao final
```

**A versao da imagem `supabase/postgres` tem que bater com a versao do projeto**
(`select version();` no projeto real) — senao da erro de privilegio
desconhecido (`maintain`, privilegio so do PG17). Projeto Nuvem de Papel roda
Postgres 17.6 (imagem testada: `supabase/postgres:17.6.1.163`).

Resultado do teste 08/11/2026 (dump de staging, 08/11/2026): schema e dados do
negocio restauram sem perda — 5 contagens conferidas batendo exatamente com o
staging real (orders 0, customers 2, journal_entries 734, account_catalog 60,
catalog_items 14).

**Ruido conhecido, nao e falha:**
- Extensao `pgtap` instalada dentro do `public` (em vez de schema proprio) faz
  o dump incluir GRANT de cada funcao interna dela — gera ~15-20 erros
  "function ... does not exist" no restore (`_retval`, `_typename`,
  `col_is_pk`, `format_type_string`, `has_pk`). Nao afeta schema/dados do
  negocio. Fix pendente no backlog (Fase 5): mover `pgtap` pra schema proprio.
- Dados de `auth.*`/`storage.*` (GoTrue/Storage) NAO restauram numa imagem
  `supabase/postgres` solta — essas tabelas so existem completas quando a
  stack completa roda (`supabase start`) ou dentro de um projeto Supabase de
  verdade. Para recuperar auth/storage de verdade, restaurar num projeto
  Supabase novo (nao num Postgres solto) — esse teste local valida só o
  schema e os dados de negocio, que é o que importa pra auditoria financeira.

## RLS deny-all intencional (13 tabelas, revisado 08/11/2026)

O advisor de seguranca do Supabase acusa "RLS enabled, no policy" (bloqueio
total pra anon/authenticated) nestas 13 tabelas. Revisado uma por uma —
todas sao deny-all por design, nao falta nenhuma policy:

- `marketplace_accounts`: guarda `access_token`/`refresh_token` (credenciais
  OAuth dos canais de marketplace) — nunca pode ser lido client-side.
- `item_fiscal_data`, `item_commercial_data`: custo/margem/dados fiscais —
  vazar isso pro cliente exporia preco de custo e dados fiscais internos.
  (Preco de venda fica em `item_prices`, que tem policy publica — separacao
  intencional.)
- `tenants`: registro mestre multi-tenant (`slug`, `name`) — uma policy de
  leitura vazaria a lista de todos os clientes/lojas da plataforma.
- `customers`: cadastro de CRM operado pelo staff (sem coluna `user_id`/
  `profile_id` — nao e o perfil do usuario logado, que fica em `profiles`).
- `campaigns`, `webhook_events`, `marketplace_jobs`, `marketplace_listings`,
  `marketplace_orders`, `marketplace_webhooks`, `marketplace_channels`,
  `freight_tabelas`: fila/processamento interno ou tabela de apoio —
  acessadas só via service_role (server actions, crons), sem motivo de
  acesso direto do cliente.

Decisao (08/11/2026): manter deny-all como esta, sem criar policy nova —
é o comportamento correto. Esse item do advisor pode ser ignorado daqui
pra frente nas proximas auditorias.

## Backlog bloqueado por plano: leaked password protection (08/11/2026)

"Prevent use of leaked passwords" (Auth → Sign In/Providers → Email, checa
senha contra HaveIBeenPwned) só existe no plano Pro do Supabase. A org
`nuvem-de-papel's Org` está no plano FREE — toggle aparece desabilitado.
Não é erro de configuração, é limite de plano. Revisitar se/quando fizer
upgrade pra Pro.

## Checkout sem login prévio — cadastro básico (Opção C, 14/11/2026)

1. `/checkout` sem sessão mostra `CadastroBasicoForm`; a action
   `cadastrarBasicoParaCompra` (`src/app/checkout/cadastro-actions.ts`) cria
   Auth user (`email_confirm: true`) + `customers` e **abre a sessão no
   servidor** (`signInWithPassword` com o client de `@/lib/supabase/server`),
   devolvendo `/checkout` — mesmo padrão de `src/app/orcamento/actions.ts`.
2. **Cliente da loja NÃO tem linha em `profiles`.** `profiles` é só equipe
   (`profiles_role_check` recusa `cliente`), e o `/login` (`LoginForm.tsx`)
   desloga quem não tem profile ativo — por isso o cliente nunca passa por ele.
3. Vínculo cliente↔login = `customers.auth_user_id` (0050). Colunas reais:
   `telefone`/`ativo` (0029), não `phone`/`active`. `audit_log` usa
   `action`/`actor_user_id`/`entity`/`entity_id`/`after`.
4. **Cliente com cadastro** entra pelo próprio form do checkout ("Já tem
   cadastro? Entrar aqui" → `entrarParaCompra`, sessão no servidor), não pelo
   `/login`. **Cabeçalho** (`Header.tsx`): logado sem profile = "Minha conta"
   → `/conta/pedidos`; com profile = "Painel" (destino por papel).
   E-mail já cadastrado ao criar conta: o Auth devolve `code: "email_exists"`
   (422; o texto da mensagem não serve para comparar) → o form avisa e troca
   sozinho para "entrar", mantendo o e-mail.
   **Sair do cliente**: botão "Sair" em `/conta/pedidos`
   (`src/components/conta/SairButton.tsx`, `signOut` + volta para `/`). Antes
   não existia saída para cliente — só o `AdminShell` da equipe tinha.
5. Smoke `e2e/cadastro-basico-smoke-simple.cjs` (lê `.env.local`, recusa rodar
   fora do Supabase de staging, apaga o usuário de teste no fim): **26/26** em
   14/11/2026 contra `npm run start` local. Teste manual do Joaquim: pedido
   `9B1BC50A` criado com conta nova (retirada, frete 0; MP não testado — `mp=0`).
   No preview Vercel de staging o checkout só abre com `CHECKOUT_LIBERADO=1`
   (env Preview, branch `staging`, criada 14/11/2026; produção NÃO tem e segue
   fechada até ter `MERCADOPAGO_ACCESS_TOKEN`). Pedido `96505B07` feito pelo
   preview em 14/11/2026.
6. **Login do cliente (14/11/2026)**: `/login` é único para clientes e equipe.
   Conta SEM linha em `profiles` = cliente da loja → `LoginForm` manda para
   `/conta/pedidos` (ou `?next=` se começar com `/conta` ou `/checkout`).
   Antes deslogava com "Perfil sem acesso" e o cliente nunca mais entrava.
   Profile inativo/pendente continua bloqueado (E2E `f2.cjs` E2) e as áreas da
   equipe seguem barradas pelo middleware (exige profile ativo).
7. **Frete PAC/Sedex (14/11/2026)**: `cotarInterno` usa como origem
   `tenant_company.endereco.cep` e procura `freight_tabelas.origem_cep` igual.
   Staging não tinha linha em `tenant_company` (copiada de produção: CEP
   `13405404`, Piracicaba) e as duas tabelas de frete tinham origem `09850730`
   — nenhum CEP batia ("CEP da loja não configurado para frete").
   `scripts/importar-frete-correios.cjs` cotava sempre de
   `FRETE_CEP_ORIGEM || "09850-730"` mesmo gravando outra origem; agora cota e
   grava com o CEP de `tenant_company` e para com erro se ele estiver vazio.
   Staging reimportado com origem `13405404`. **Produção ainda tem a tabela
   antiga** (origem `09850730`) — reimportar antes de abrir o checkout lá.
   Pedido `8177066E` (PAC R$ 23,30) conferido no banco. `/conta/pedidos`
   passou a mostrar as linhas Frete e Desconto (antes só itens e total).
   Em 14/11/2026 as 160 linhas antigas (origem `09850730`) foram apagadas do
   staging, que ficou só com `13405404` (80 PAC + 80 Sedex).

## Desagrupador de fotos de produto (grade BLT — 14/11/2026)

1. `scripts/processar_grades_blt.py` (Python 3 + Pillow) lê a foto em
   `public/produtos/catalogo/`, detecta vários produtos lado a lado pela
   proporção largura/altura (> 1,8 = 2; > 3,0 = 4) ou por > 70% de branco,
   recorta em partes iguais (quadradas, fundo branco), aplica a marca d'água
   `public/logo-nuvem.png` no centro com 30% de opacidade e grava em
   `public/produtos/catalogo_processado_blt/` com o nome da grade:
   `SKU.jpg` (principal), `SKUA.jpg`, `SKUB.jpg`… + `_relatorio.json`.
2. Uso (na raiz do repo): `Get-Content scripts/lote1-blt.txt | python scripts/processar_grades_blt.py`
   ou `python scripts/processar_grades_blt.py BLT38.jpg`. `lote1-blt.txt` é a
   lista do primeiro lote (10 fotos) que o cliente validou.
3. As fotos originais (WhatsApp) ficam FORA do repo em
   `F:\Projetos\nuvem-de-papel-produtos` (`ORGANIZADO_POR_GRUPO` e `site`).
4. As pastas de saída/teste (`catalogo_teste*`, `catalogo-novo`,
   `catalogo_processado_blt`, `teste_blt38`) estão no `.gitignore` — não
   sobem no deploy. Foto aprovada vai para `public/produtos/catalogo/` e entra
   por commit. O banco não aponta para essas pastas (BLT38/A/B/C com
   `foto_url` nula no staging).
5. A migration `0052_grade_blt38_teste.sql` é teste só de staging e NÃO entra
   no repo nem em produção sem aprovação explícita.

## Grade de produto — principal + variantes (0051 — documentado em 15/11/2026)

Documento único da grade. Código entrou pelos PRs #29 (schema + vitrine),
#30 (página do produto + cadastro), #31 (catálogo admin) e #37 (fotos); em
produção desde o PR #38.

1. **Modelo (migration `0051_grade_variantes.sql`)**: sem tabela nova — a
   grade mora em `catalog_items`: `grupo_pai text` (SKU do principal),
   `cor text` (rótulo da variante no seletor) e índice parcial
   `idx_catalog_items_grupo_pai`. Convenção:
   - **principal**: `grupo_pai` = o próprio SKU (ex.: `BLT38` → `BLT38`);
   - **variante**: `grupo_pai` = SKU do principal (`BLT38A/B/C` → `BLT38`);
   - **produto único**: `grupo_pai` nulo.
   Cada variante é um item completo (preço em `item_prices`, fiscal, estoque
   por local, fotos em `item_images` da 0048): vende, entra no carrinho e
   baixa estoque como qualquer item — não existe "estoque da grade".
2. **Cadastro**: `/configuracoes/cadastro?tela=produto`, logo abaixo do
   estoque — campo **Grade** (`#ct-prod-grupo-pai`, "código do principal;
   vazio = produto único") e **Cor / modelo** (`#ct-prod-cor`). `salvarProduto`
   (`src/app/configuracoes/cadastro/actions.ts`) faz `trim().toUpperCase()`
   no `grupo_pai` e grava `null` quando vazio. Para montar uma grade: cadastre
   o principal com Grade = o próprio SKU, depois cada variante com Grade = SKU
   do principal e um rótulo em Cor / modelo (o principal também leva rótulo,
   ex.: "Modelo 1", senão o seletor mostra o SKU).
3. **Vitrine e página do produto** (`src/lib/products.ts`):
   `getStoreProducts` **pula variantes** (só o principal vira card);
   `getPaginaProduto(sku, ?v)` busca `sku = grupo OR grupo_pai = grupo`
   (só ativos), põe o principal primeiro e as variantes por SKU.
   `/produtos/[sku]` mostra o seletor **Cor** (miniatura + `cor ?? sku`) só com
   2+ itens; a variante escolhida vai na URL `?v=SKU`
   (`/produtos/BLT38?v=BLT38A`) e troca foto, preço, SKU e o item do carrinho.
   A galeria (posições 1-4 de `item_images`) é sempre a do **principal**.
4. **Catálogo admin** (`/produtos` para a equipe,
   `src/components/catalogo/CatalogoAdmin.tsx`): filtro **Grade**
   (Todos / Só grades / Só únicos), etiqueta `grade · N` no principal e
   linha expansível com as variantes.
5. **Armadilhas**:
   - o cadastro **não valida** se o SKU digitado em Grade existe. Variante
     apontando para SKU inexistente/inativo some da vitrine (é pulada) e a
     página dela dá 404 (sem principal). Conferir com
     `select sku, grupo_pai from catalog_items where grupo_pai is not null and grupo_pai not in (select sku from catalog_items where active)`;
   - principal com `grupo_pai` nulo também funciona (vitrine, página e
     catálogo admin agrupam pelas variantes que apontam para ele), mas a
     convenção é o principal apontar para si mesmo, como na BLT38 do staging.
6. **Estado dos bancos (conferido em 15/11/2026, só leitura)**: as colunas
   da 0051 (e `em_oferta`/`em_destaque` da 0053) e o índice existem em
   **staging e produção**. Staging tem a grade de teste BLT38 (4 itens, da
   `0052`, fora do repo); produção tem **0 itens em grade** — a primeira
   grade real é cadastro pela tela, sem migration.
7. **Fotos da grade**: ver "Desagrupador de fotos de produto" acima
   (`scripts/processar_grades_blt.py`).

## Pagamento Mercado Pago — rastro, conferência e pedido em dobro (17/11/2026)

1. **Problema**: 2 pedidos pagos em 16/11 (Pix e cartão) ficaram em
   `aguardando_pagamento` em produção. Toda falha do webhook APAGAVA a linha
   de `webhook_events` (para liberar o retry do MP) e o motivo sumia; e não
   havia outro caminho para descobrir que o pedido foi pago.
2. **Rastro de falha** (`src/app/api/webhooks/mercadopago/route.ts`): a falha
   fica gravada em `webhook_events.payload._falha {motivo, em, tentativas}` e
   o webhook responde 500. Evento repetido **com** `_falha` é REPROCESSADO
   (retry do MP continua valendo); sucesso depois de falha grava
   `_resolvido {apos_tentativas}`; repetido sem `_falha` segue `duplicado`.
   Reprocessar é seguro: troca de status guardada por `.in("status", [...])`
   e `settle/release_order_stock` idempotentes.
3. **Regra única de confirmação** (`src/lib/pagamento-confirmar.ts`):
   `confirmarPagamentoAprovado` (webhook) e `reconciliarPedido` (consulta o MP
   por `external_reference` = `orders.id`, via `src/lib/mercadopago.ts`).
   Usada em três lugares: webhook, **volta do cliente** (`/conta/pedidos`
   confere até 5 pedidos pendentes dos últimos 30 dias, teto de 6 s, banner
   "Pagamento confirmado") e botão **"Conferir pagamento"** em `/logistica`
   (`conferirPagamentoMP`, audit `pagamento.reconciliado`). Nunca cancela.
   Com `MP_MOCK=1` local não consulta o MP.
4. **Pedido em dobro**: `finalizarCheckout` recusa pedido igual (mesmo
   cliente, itens, entrega e pagamento) criado nos últimos 10 min ainda em
   `aguardando_pagamento` (`pedidoRepetido` em `checkout/actions.ts`) e o
   `CheckoutForm` trava o duplo clique com `enviandoRef`. Origem: em 16/11 o
   cartão de R$ 6,00 gerou 2 pedidos com 10 s de diferença.
5. **E2E atualizados para a vitrine nova** (lista `/produtos` sem botão de
   carrinho; vitrine lê o saldo do CD em `item_stock_by_location`, separado do
   ledger `item_stock` que o checkout reserva): helper `e2e/_vitrine.cjs`
   (`definirSaldoCd`/`restaurarSaldoCd`/`adicionarPelaPagina`). `f3` 20/20,
   `f4` 32/32, `frete` 13/13 (agora com item próprio `SKU-E2E-FRETE` e devolve
   a reserva — antes vazava 2 unidades do 1º produto da vitrine por rodada),
   `clube` 24/24. Rastro de falha testado à parte: 7/7. **A conta mestre E2E
   (`E2E_MASTER_EMAIL`) foi criada no staging em 17/11** — não existia depois
   da troca de projeto Supabase, e o `f3` quebrava no login.

## Cancelar venda manual (0054 — 17/11/2026)

1. **Por que**: venda registrada não tinha como ser desfeita. Editar não existe de propósito — o diário, as liquidações e o ledger de estoque são imutáveis —, então o fluxo é **cancelar com estorno e registrar a venda nova**. A V-4268 (produção, 17/11) mostrou o buraco: mudar `orders.status` para `cancelado` direto estorna receita/CMV no diário (0023), mas **não tira o dinheiro do caixa** (a liquidação continua lá) nem devolve estoque.
2. **Migration `0054_cancelar_venda.sql`** (+preflight/rollback/test/smoke): `orders.cancelado_motivo` (check 5–500, `0054:43`) e `orders.cancelado_por`; RPC **`sale_cancel(order, motivo, actor)`** (security definer, execute só `service_role` — `0054:228-229`). Ordem: trava o pedido → exige `etapa='venda'` e `origem='manual'` (PDV fica para depois: mexe em `caixa_movements`; `ORIGEM_NAO_SUPORTADA`) → recusa `VENDA_ENTREGUE`, `ENTREGA_EM_TRANSITO` e `NOTA_FISCAL_ATIVA: <n>` → cria uma liquidação `type='estorno'` por liquidação da venda (chave `cancelamento:<id da liquidação>` — o gatilho da 0022 lança o estorno caixa × título) → parcelas `cancelado` com `paid_amount=0` e título `cancelado` → `release_order_stock` → entrega que não saiu vira `devolvido` com evento → pedido `cancelado` + `cancelado_em/motivo/por` (o gatilho da 0023 estorna receita/CMV, chave `venda-estorno:<id>`) → `audit_log` `venda.cancelar`. **Idempotente e reparadora**: chamar de novo não duplica estorno, e numa venda já `cancelado` sem estorno de caixa (caso V-4268) ela completa só o que faltou (`ja_cancelada=true`).
3. **Teste**: `0054_test.sql` (estrutura, só leitura, roda nas duas bases) e `0054_smoke_staging.sql` (5 cenários com escrita + rollback — **só staging**). Os gatilhos do diário são `deferred`: o smoke força `set constraints all immediate` para conferir o diário e **volta para `deferred`** logo depois (o `immediate` vale até o fim da transação).
4. **App**: server action `cancelarVendaManual` (`src/app/vendas/actions.ts:758`, gestão, motivo 5–500, traduz os códigos de erro da RPC) e, na aba Vendas, botão **Cancelar venda** só para venda manual não cancelada (`ConsoleVendas.tsx:1165`) → linha com motivo obrigatório + Confirmar (travado com < 5 letras). O funil "Vendas a faturar" passou a excluir `status='cancelado'` (`vendas/page.tsx:106`) — antes só olhava `cancelado_em`, e a V-4268 (cancelada direto no banco, sem `cancelado_em`) continuava contando.
5. **Validado (17/11)**: staging — preflight ok, migration, `0054_test` 9/9, smoke 18/18; type-check 0, lint 0, build ok; **E2E `venda-manual.cjs` 38/38** (seção J nova, 10 checks: cancela pix pela tela, estoque volta, estorno 46,80 no caixa, título/parcela cancelados, diário `venda-estorno`, auditoria, sai de "a faturar", re-chamada não duplica). `vendas.cjs` 35/36 e `vendas-v5.cjs` 42/43 — as 2 falhas eram **anteriores** e foram resolvidas na branch `fix/cabecalho-mobile`: N9 era o teste desatualizado (ainda esperava o flutuante cinza; as cores foram invertidas em 10/11) e H1 era o espaçador vazio do cabeçalho (`span.header-espaco`), que empurrava a linha 4 px além dos 390 px — agora ele some abaixo de 769px.
6. **Produção (17/11)**: preflight 7/7 → migration → `0054_test` 9/9; a V-4268 foi reparada com `sale_cancel` (1 estorno de 2,60, `ja_cancelada=true`; o diário da venda ficou com saldo 0 em 1.1.1/1.1.2/1.1.3/4.1.1/5.1.1). Deploy pelo PR #44 (`976a2d3`), CI e Vercel success, `/vendas` 307→login.

## Lançamento de produto + catálogo admin por setores (0055 — 17/11/2026)

1. **Regra**: produto é "lançamento" enquanto `catalog_items.lancamento_ate >= hoje` (fuso America/Sao_Paulo, inclusive) e volta a ser produto normal **sozinho** no dia seguinte — calculado na leitura, sem cron. É **data, não boolean** (ao contrário de `em_oferta`/`em_destaque` da 0053): boolean esquecido ligado deixaria produto velho no carrossel para sempre. **Não deriva de `created_at`**: a importação do catálogo JQ cria centenas de itens no mesmo dia. Helper único `src/lib/lancamento.ts` (`PRAZO_LANCAMENTO_DIAS = 30`, `hojeBrasilia`, `lancamentoPadrao`, `ehLancamento`).
2. **Migration `0055_lancamento.sql`** (+preflight/rollback/test): só a coluna `lancamento_ate date` (nula, sem default, RLS/grants herdados de `catalog_items`). Teste = 6 checks + linha `FALHAS` (coluna, tipo, nula, sem default, anon/authenticated leem, comentário). A vitrine (`getStoreProducts`) lê a coluna no select, então **produção tem de receber a 0055 antes do merge** que deploya, senão a home quebra — foi o que aconteceu (item 6).
3. **Telas**: cadastro de produto ganhou checkbox `#ct-prod-lancamento` + data `#ct-prod-lancamento-ate` (marcar sugere hoje + 30, editável; lançamento vencido carrega desmarcado); `salvarProduto` valida e grava. Home: carrossel `section[aria-label="Lançamentos"]` (só aparece com item em lançamento); card: selo `[data-selo="novo"]`. Catálogo admin: filtro Situação "Lançamento" e etiqueta "Novo até dd/mm".
4. **Catálogo admin `/produtos` (equipe) abre por setores** (pedido do Joaquim: não despejar todos os SKUs na tela): sem busca/filtro ativo mostra só `table[aria-label="Setores"]` (ordem alfabética pt-BR, contagem por setor, "Sem setor" para categoria nula); clicar no setor grava `?setor=` com `history.pushState` (Voltar do navegador/do cabeçalho volta à lista) e abre a tabela/grade de sempre; busca e filtros mostram os produtos direto; Limpar volta aos setores. Tabela/Grade + "Novo produto" foram para o slot `meio` do `PageHeader`, na linha do Voltar. **Limite honesto**: o servidor ainda carrega todos os itens (`carregarCatalogoAdmin`) — só o DOM ficou menor; carga por setor no servidor fica para quando o volume pedir.
5. **Validado no staging (17/11)**: type-check 0, lint 0 (5 avisos `<img>` antigos), build ok, **E2E `e2e/lancamento.cjs` 18/18** (nova, no fim da chain: cadastro → home anônima → catálogo por setores → vencimento), `vendas.cjs` 36/36, `f2.cjs` 15/15. `catalogo-ia.cjs` C6 repontado para `/produtos/<sku>` (a descrição só aparece na página do produto desde a vitrine nova). **Pendência anterior a esta entrega**: `produtos.cjs` (P2, botão "Importar") e `catalogo-ia.cjs` (C2, aba "3. Descrição (IA)") quebraram em `68c905b` (09/11 — o importador virou o toggle "Busca web" e a aba virou "5. Descrição IA"); ver item 7.
6. **Produção (17/11)**: PR #47 (`5c23e7e`, merge `adf3ff7`) em `staging` com CI verde → 0055 em produção (`urlfwxeflxpdmmxkuuur`): preflight 4/4 → migration → teste 7/7 (`FALHAS = true`) → PR #48 em `main` (`403b4ed`), CI e Vercel Production success. Smoke: `/`, `/produtos`, `/produtos?setor=CADERNOS`, `/produtos/BLT40` e `/login` 200; `/crm` 307 → `/login?next=%2Fcrm`. O carrossel "Lançamentos" só aparece quando algum produto for marcado no cadastro (produção começou com 0). Conferido em 17/11 nos dois bancos: as colunas/tabelas/funções de 0035 a 0055 existem em staging e em produção.
7. **Testes realinhados com a tela atual (17/11)**: `e2e/produtos.cjs` **27/27** — o importador abre pelo botão "Busca web" (o atalho Ctrl+Shift+[ saiu em `68c905b`); o aviso do produto fica no cabeçalho, ao lado de Relatório (`.ct-feed-inline`, desde `ddaa2b2`; as outras telas seguem com o banner `ct-feed-topo`); o GTIN tributável não tem mais campo próprio (`#ct-prod-gtintrib` saiu em `ddaa2b2` — grava sempre igual ao código de barras); o P10c acha o card pelo link `a[href="/produtos/<sku>"]`. `e2e/catalogo-ia.cjs`: C0–C2 passam com a aba "5. Descrição IA"; o C3 caiu 2× seguidas com o Gemini em "high demand" (provedor, armadilha (i) da entrega 7) — C3–C6 ficam para nova rodada quando o provedor aliviar. Sem mudança de código de produção.

## Catálogo JQ — importador e bucket de fotos (0056 — 18/11/2026)

1. **O que é**: carga do catálogo do fornecedor JQ (pacote `jq_export_2026-11-16`: 764 SKUs, 3.820 fotos, 3.133 arquivos únicos ~168 MB) pelo script `scripts/importar-jq.cjs`. O pacote e as fotos ficam **fora do repo** (Downloads do Joaquim; `imagens.csv` aponta para `../jqcatalogo/<Setor>/<sku>_<slot>.jpg`). Contrato de captura: `PROMPT-JQ-para-Nuvem-de-Papel.md` (entregue ao dono).
2. **Migration `0056_bucket_produtos.sql`** (+preflight/rollback/test): bucket **público** `produtos` no Supabase Storage, teto 2 MB, só jpeg/png/webp, **sem policy** em `storage.objects` (só a service_role grava; a URL pública não depende de policy). Caminho por conteúdo `jq/<sha256>.jpg` — o mesmo arquivo em vários slots/SKUs sobe uma vez só e reimportar não duplica. A URL pública passa no `FOTO_REMOTA_OK` (`ProductImage.tsx`). Rollback: restaurar `item_images` pelo `before` do `audit_log`, esvaziar o bucket (API/painel) e só então apagar a linha de `storage.buckets`.
3. **Decisões do dono (16–18/11/2026)**: (a) slot N do JQ = `item_images.position` N-1 (0 = capa); (b) produto **novo entra INATIVO**, setor = `departamento_principal` em MAIÚSCULAS (casa sem acento com o setor existente; 43 setores, 36 novos); (c) **existente**: galeria + preço + nome pelo JQ — venda varejo = `preco_varejo`, custo (`preco_custo`) = `preco_atacado`; `cost_price` (custo médio) só acompanha enquanto o item não tem nota de entrada (mesma regra do `salvarProduto`); (d) SKU que vem **só com `preco_caixa`** (57 no pacote): venda = caixa × 1,30, custo = caixa × 1,15, calculado em centavos; (e) SKU do sistema fora do JQ fica **intocado** — nada é apagado.
4. **Uso**: `node scripts/importar-jq.cjs <pasta>` só **simula** (lê banco + bucket e imprime o plano; `--relatorio x.json` grava o plano completo). `--aplicar` grava: sobe as fotos primeiro (6 em paralelo, 3 tentativas) e **aborta antes de tocar o banco** se alguma falhar; depois produtos novos (fiscal padrão UN/origem 2/CSOSN 102, preço base, estoque 0 no CD, galeria), nomes/preços/custos, galerias e **uma** linha de `audit_log` `catalogo.importar_jq` com o estado anterior. Idempotente: rodar de novo só grava o que ainda difere. Trava de ambiente: sem `--producao` recusa `.env` que não aponte para o staging; com `--producao` exige o ref de produção (`--env <arquivo>` com a service_role de produção, arquivo `.env*` ignorado pelo git e apagado depois). Pegadinha: `storage.from(b).list()` **não dá erro** com bucket inexistente (volta vazio) — o script checa com `getBucket`.
5. **Staging (18/11)**: 0056 preflight 3/3 → migration → teste 5/5 (`FALHAS = true`); import aplicado (334 novos inativos, 84 nomes, 21 preços, 22 custos, 430 galerias, 3.133 fotos no bucket); simulação seguinte **toda zerada**; conferido no banco (334 com fiscal/comercial/preço/estoque, 764 capas no Storage, 1 linha de preço base por item) e na tela pelo Joaquim. **Pendente**: 286 dos 334 novos sem NCM (setor novo sem NCM de referência) — preencher antes de ativar/emitir nota.
6. **Produção (18/11)**: simulação antes de gravar (436 itens; mesmos números do staging, exceto 20 preços em vez de 21 e 6 SKUs fora do JQ em vez de 15 — o staging tem fixtures de E2E e a grade de teste BLT38) → 0056 preflight 3/3 → migration → teste 5/5 (`FALHAS = true`) → import aplicado (334 novos inativos, 84 nomes, 20 preços, 22 custos, 430 galerias, 3.133 fotos) → re-simulação **toda zerada**. Banco conferido: 770 itens (436 ativos), 3.820 imagens no Storage, 764 capas, 43 setores, 0 preço base duplicado, 0 item sem preço, 334 novos com fiscal/comercial/estoque no CD; foto pública HTTP 200. O arquivo temporário com a service_role de produção foi apagado no fim.

## Grupos de setores — catálogo em dois níveis (0057 — 18/11/2026)

1. **Pedido**: os 43 setores soltos do JQ viraram **GRUPO > SUBGRUPO**. O subgrupo é o setor de sempre (`catalog_items.category`), então nenhum leitor antigo quebra: checkout, PDV, relatórios e importador JQ continuam iguais. Desenho aprovado pelo Joaquim no artefato "Grupos de Setores" v4: 9 grupos, 49 setores, um ícone de linha fina por grupo.
2. **Migration `0057_grupos_setores.sql`** (+preflight/rollback/test):
   - `catalog_grupos`: slug, nome, `icone` (chave do desenho), ordem, ativo.
   - `catalog_setores`: PK `(tenant_id, nome)` = texto do `category` → `grupo_id`, com `on delete restrict`.
   - **Leitura pública**, porque o menu da loja roda anônimo. Escrita só pela service_role.
   - **Dados na mesma transação**: CADERNOS (176 itens) se divide pelo tipo lido do nome. Ordem do CASE: fichário > inteligente/disco > desenho > espiral > brochura > caderneta/mini > planner > decorativo. 11 produtos fora do lugar mudam de setor por SKU, conferindo a origem; rodar de novo não faz nada. POP IT ficou vazio e saiu do mapa.
3. **Código**:
   - `src/lib/gruposSetores.ts`: `carregarGrupos`, `mapaSetorGrupo`, `tituloGrupo` e `ICONES_GRUPO`, com os SVGs estilo Lucide em linha (sem biblioteca).
   - `src/components/catalogo/IconeGrupo.tsx`.
   - `src/lib/categoriasProdutos.ts` trocou os 7 setores fixos por regex por `agruparPorGrupo(produtos, grupos)`. Cor e descrição de cada grupo ficam no código, por slug.
   - Setor sem grupo vira **"Outros"** no fim da loja (fora do menu) e **"Sem grupo"** no painel. Hoje só caem aí os fixtures E2E (`category = 'E2E'` ou nulo), de propósito, porque as suítes procuram esses produtos na vitrine.
   - Home: carrosséis por grupo, e "Navegue por categoria" com o ícone do grupo no lugar das fotos Pexels emprestadas.
   - `/produtos` da loja: botão escuro **"Todas as Categorias"** (`SetoresMenu.tsx`, abre `nav[aria-label="Categorias"]` com ícone por grupo; fecha com Esc ou clique fora).
   - "Combina com" (`getCombinaCom`): só setores mapeados.
   - Catálogo admin: setores agrupados por grupo, com `optgroup` no filtro. Cadastro de produto: mostra o grupo do setor digitado.
4. **Setor novo**: digitado no cadastro, entra como "Sem grupo" até ganhar uma linha em `catalog_setores` (SQL por enquanto; não existe tela de gestão de grupos).
5. **Validado no staging (18/11)**:
   - preflight ok → migration → teste **17/17**.
   - type-check 0, lint 0 (só os 5 avisos `<img>` antigos), build ok.
   - E2E: `lancamento` **19/19** (A2 confere a ordem por grupo, A2b confere "Sem grupo"), `vendas` 36/36, `f2` 15/15, `produtos` 27/27.
   - **Falhas anteriores, sem relação com a 0057**:
     - `f6` passa de A a E e para no F: procura `button[aria-label="Adicionar Item E2E F6"]`, mas o botão real diz "… ao carrinho", e a lista de `/produtos` não tem botão de carrinho desde a vitrine nova.
     - `catalogo-ia` C3: Gemini em "high demand".
   - **Produção**: a 0057 entra **antes** do merge que deploya. A loja nova lê `catalog_grupos`; sem a tabela, `carregarGrupos` devolve vazio e a loja inteira cai em "Outros".
