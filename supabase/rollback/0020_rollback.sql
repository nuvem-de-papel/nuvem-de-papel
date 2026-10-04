-- Rollback 0020 - devolve public.tenants ao estado anterior a 0020.
--
-- ATENCAO: antes da 0020 a producao estava com RLS DESLIGADA (vulneravel) e o
-- staging com RLS LIGADA manualmente (fora do versionamento). Este rollback
-- iguala os dois em "vulneravel" - por isso deve ser usado apenas se a 0020
-- estiver causando dano, o que e improvavel: a migration e idempotente, nao
-- mexe em dado e nenhum codigo lê `tenants` (grep em src/ = 0).
--
-- Preferivel na duvida: nao rodar nada e investigar.
begin;
alter table public.tenants disable row level security;
commit;
