-- 0055_lancamento.sql
-- Lancamento de produto (17/11/2026, pedido do Joaquim): produto novo fica
-- "lancamento" por um prazo e depois volta a ser produto normal SOZINHO.
-- Por isso e uma DATA (lancamento_ate), nao um boolean como em_oferta /
-- em_destaque (0053): boolean esquecido ligado deixaria produto velho no
-- carrossel "Lancamentos" para sempre.
-- Regra (calculada na leitura, sem cron): e lancamento enquanto
-- lancamento_ate >= data de hoje em America/Sao_Paulo (inclusive).
-- null = produto normal. O cadastro sugere hoje + 30 dias ao marcar (editavel).
-- NAO deriva de created_at: a importacao do catalogo JQ cria centenas de itens
-- no mesmo dia e todos virariam lancamento.
-- Idempotente. RLS e grants nao mudam (coluna herda o select de catalog_items).
-- Dependencia: a vitrine (getStoreProducts) le esta coluna no select, entao
-- precisa estar aplicada em producao ANTES do deploy que a usa.
alter table public.catalog_items add column if not exists lancamento_ate date;

comment on column public.catalog_items.lancamento_ate is
  'Lancamento: item aparece no carrossel Lancamentos e com selo Novo ate esta data (inclusive, fuso America/Sao_Paulo). null = produto normal.';
