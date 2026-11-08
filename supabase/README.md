# Migrations — guia rápido

Governança: toda migration `NNNN_nome.sql` tem irmãs em `preflight/NNNN_preflight.sql`,
`rollback/NNNN_rollback.sql` e `tests/NNNN_test.sql` (pgTAP, roda em `begin;...rollback;`).

## Gap de numeração: `0030`

Não existe `0030_*.sql`. Confirmado em 08/11/2026: nunca existiu (não foi
deletada nem é uma migration perdida) — o número foi pulado na sequência.
Histórico de migrations nos dois projetos (staging `urlfwxeflxpdmmxkuuur` e
produção `cbnmnpnpioukbzircmzn`) reconciliado em 08/11/2026 sem o `0030`,
indo direto de `0029` pra `0031`. Não precisa de ação — só documentar pra
ninguém achar que é um erro.

## Reconciliação de histórico (08/11/2026)

Os dois projetos tinham `0001`-`0040` aplicadas no banco real mas não
registradas no histórico do Supabase (`supabase migration list` mostrava
`Remote` vazio) — reparado via `supabase migration repair --status applied
<versões>`. Staging reparou 39 versões (`0001`-`0029`, `0031`-`0040`),
produção reparou 37 (`0001`/`0002` já estavam corretas).

`0041` tem uma particularidade cosmética: foi aplicada via ferramenta MCP
(não via CLI), então o histórico do Supabase registra ela sob um ID
timestamp próprio (`202611072...`) em vez de `0041`. Sem impacto funcional
— a migration está aplicada e os testes pgTAP confirmam o comportamento.
Não foi corrigido (baixo risco, baixa prioridade).

## Comandos úteis

```powershell
supabase migration list                              # compara local vs remoto
supabase migration repair --status applied <versao>   # marca como aplicada sem rodar
supabase db dump -f schema.sql                         # backup de schema
supabase db dump --data-only -f data.sql               # backup de dados
```

Sempre `supabase link --project-ref <ref>` antes — staging primeiro
(`urlfwxeflxpdmmxkuuur`), produção só depois de validar
(`cbnmnpnpioukbzircmzn`). Relinkar de volta pra staging depois de mexer em
produção.
