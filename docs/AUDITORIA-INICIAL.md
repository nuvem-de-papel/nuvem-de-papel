# Auditoria inicial — Nuvem de Papel

Data: 24/10/2026. Escopo: leitura do checkout de produção em `F:\Projetos\nuvem-de-papel` e da cópia de staging, sem SQL, migration, commit, push, deploy ou escrita em banco. Não há valores de segredo neste documento.

## Resumo para decisão (10 linhas)

1. O projeto usa Next.js 14, TypeScript, Supabase e Vercel.
2. A cópia auditada de produção está limpa e na branch `main`.
3. Há staging separado, mas sua cópia local está 33 commits atrás e tem alterações locais.
4. O CI verifica lint, TypeScript e build em push e pull request.
5. Nesta execução, TypeScript e lint terminaram sem erros nem avisos.
6. As migrations têm uma lacuna no número 0030 e não possuem README de estado.
7. Há quatro funções privilegiadas sem `search_path` explícito no SQL versionado.
8. Não foi encontrada rotina versionada de backup/restauração.
9. PRs, proteção remota de branch e `npm audit` não foram verificáveis por falha DNS.
10. Prioridade: recuperar staging confiável e instituir backup validado.

## Mapa do projeto

| Item | Evidência verificada |
|---|---|
| Stack | `package.json`: Next 14.2.16, React 18.3.1, TypeScript 5.6.3, Supabase SSR/JS, Mercado Pago, Resend. |
| Estrutura | `src/app`, `src/components`, `src/lib`, `supabase/{migrations,preflight,tests,rollback}`, `e2e`, `scripts`, `.github/workflows/ci.yml`. |
| Executar | `npm run dev`; produção local: `npm run build` e `npm run start`. |
| Validar | `npm run type-check`, `npm run lint`, `npm run build`, `npm run e2e`. E2E não foi executado porque os scripts manipulam dados de banco. |
| Deploy | CI roda em push e PR. O `AGENTS.md` declara Vercel Production em `main` e Preview fora de `main`; a configuração remota não foi consultada. |
| Variáveis (só nomes) | Exemplo: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`, `NGROK_AUTHTOKEN`. Local também declara `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `VERCEL_OIDC_TOKEN`. |

## Ambientes e versionamento

O `AGENTS.md` existente descreve produção em `F:\Projetos\nuvem-de-papel`, branch `main`, e staging em `F:\Projetos\nuvem-de-papel-staging`, branch `staging`, com bancos Supabase distintos. Produção está em `main...origin/main` e limpa. Staging está em `staging...origin/staging`, 33 commits atrás de `origin/staging`, com `.gitignore` modificado e `nuvem-de-papel.code-workspace` não rastreado.

O histórico local mostra commits diretos no primeiro pai de `main`, sem merges recentes. PRs abertos e proteção de branch não foram verificados: `gh` não alcançou `api.github.com` por DNS. Portanto, não há evidência verificada de proteção por PR.

## Banco

Há 33 migrations, de 0001 a 0034, sem 0030; a lacuna se repete em testes e preflight. Não há README em `supabase/` com estado real por ambiente. No SQL versionado foram encontrados 60 `create table`, 62 `enable row level security` e 51 `create policy`. A busca estática não encontrou policy que consulte diretamente a própria tabela.

Não foi feita consulta ao banco. Assim, tabelas sem RLS, grants e funções efetivos em staging/produção são **não verificados**; os dados desta seção são apenas do Git.

## Segurança e qualidade

- `src/lib/supabase/admin.ts` usa `SUPABASE_SERVICE_ROLE_KEY` no servidor; a busca não encontrou import desse cliente em componentes.
- Os webhooks Mercado Pago, marketplace e Resend verificam segredo/assinatura antes do cliente administrativo.
- A busca não confirmou valor completo de chave em código. O `AGENTS.md` versionado contém detalhes parciais de credenciais temporárias e requer higienização.
- `npm run type-check`: 0 erros. `npm run lint`: 0 erros e 0 avisos.
- `npm audit` falhou ao resolver `registry.npmjs.org`; não existe resultado de vulnerabilidades.
- Arquivos grandes: `ConsoleVendas.tsx` (2.691 linhas), `ConsoleCompras.tsx` (2.588), `CadastrosTelaUnica.tsx` (2.150), `compras/actions.ts` (1.741) e `ConsolePdv.tsx` (1.283). Há TODO em `src/components/vendas/ConsoleVendas.tsx:980`.

## Backup

Não foi encontrada rotina versionada de dump, backup de Storage, checksum, cópia criptografada ou registro da última execução. `supabase/rollback/0034_rollback.sql:5-10` informa que não há rollback automático. Existência, local e data do último backup são **não verificados**. Recomenda-se backup lógico do banco + inventário/exportação de Storage + cópia externa criptografada + SHA-256 + teste de restauração antes de qualquer escrita no banco.

## Achados

| Severidade | Onde | Evidência | Risco | Correção sugerida |
|---|---|---|---|---|
| Crítica | Backup / 0034 | Sem rotina versionada; rollback 0034 informa reversão impossível. | Perda irrecuperável em nova falha ou migration destrutiva. | Instituir backup de banco e Storage, cópia externa criptografada, checksum e restore testado. |
| Alta | Staging | 33 commits atrás e duas alterações locais. | Validação em código antigo/contaminado. | Preservar alterações, atualizar staging controladamente e comprovar paridade. |
| Alta | Funções privilegiadas | `0007_stock_core.sql:8`, `0009_f6_revenda_fornecedor.sql:16`, `0022_lancamentos_automaticos.sql:395`, `0026_marketplace_core.sql:29`: `SECURITY DEFINER` sem `SET search_path` no bloco verificado. | Resolução de objeto influenciável pelo search path. | Migration com `SET search_path = public, pg_temp`, revogação pública e menor privilégio. |
| Alta | Governança Git | Commits diretos no primeiro pai de main; proteção não verificável por DNS. | Produção pode receber mudança sem revisão/gate confirmado. | Exigir PR, CI obrigatório e bloquear push direto quando a rede voltar. |
| Média | Migrations | Sem 0030 e sem README. | Sequência e estado por ambiente ambíguos. | Documentar ausência de 0030 e criar README de estado/backup. |
| Média | Segredos/documentação | `AGENTS.md:27` e `AGENTS.md:163` contêm detalhes parciais e localização de credenciais temporárias. | Exposição operacional no Git. | Higienizar, avaliar rotação e usar referências sem identificadores parciais. |
| Média | Dependências | `npm audit` sem resultado por DNS. | Vulnerabilidades podem ficar desconhecidas. | Reexecutar com rede e tratar críticas/altas. |
| Média | Banco efetivo | Catálogo dos dois bancos não foi lido. | RLS, grants e funções efetivos desconhecidos. | Rodar auditoria somente leitura nos dois bancos. |
| Baixa | Manutenibilidade | Arquivos de 1.283–2.691 linhas e TODO visível. | Maior risco de regressão. | Extrair módulos após segurança/ambientes. |

## O que manter

- TypeScript estrito e CI com lint, type-check e build.
- Preflight, testes e rollback para a maioria das migrations.
- RLS/policies extensamente declarados no SQL versionado.
- Cliente administrativo centralizado.
- Webhooks fail-closed e idempotentes.
- E2E organizados por domínio.

## Ordem recomendada

1. Preservar e regularizar staging antes de qualquer validação.
2. Criar e testar backup/restauração de banco e Storage.
3. Auditar por leitura RLS, grants, policies e funções nos dois bancos.
4. Corrigir funções SECURITY DEFINER e testar RLS com papéis simulados.
5. Verificar proteção de main/PR/CI e depois sanar migrations e manutenção.

## Decisões necessárias

1. Autorizar a recuperação controlada de staging após decidir o destino das duas alterações locais.
2. Definir destino externo criptografado, retenção e responsável pelo restore de backup.
3. Confirmar se o `AGENTS.md` existente deve ser preservado/atualizado ou substituído pelo template solicitado.

## Limites

PRs, proteção de branch, `npm audit`, backups externos e estado efetivo dos bancos não foram verificados: a rede falhou ou não havia acesso de auditoria somente leitura configurado.

