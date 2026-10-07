-- 0026_rollback.sql - desfaz o Modulo 1 (kernel de marketplaces).
-- Ordem: funcoes primeiro, depois as tabelas (filhas antes das pais via
-- cascade - channels e tenants sao preservados; CASCADE aqui apaga apenas as
-- referencias das proprias tabelas de marketplace).
--
-- ATENCAO: apaga fila, anuncios, pedidos e webhooks de marketplace. Rodar so
-- se a 0026 precisar ser retirada; em staging e indolor, em producao perde o
-- historico do modulo.

drop function if exists public.marketplace_reprocess(uuid);
drop function if exists public.marketplace_finish(uuid, boolean, text);
drop function if exists public.marketplace_claim(int);
drop function if exists public.marketplace_enqueue(uuid, uuid, uuid, uuid, text, jsonb, text, int);

drop table if exists public.marketplace_webhooks cascade;
drop table if exists public.marketplace_orders cascade;
drop table if exists public.marketplace_jobs cascade;
drop table if exists public.marketplace_listings cascade;
drop table if exists public.marketplace_accounts cascade;
drop table if exists public.marketplace_channels cascade;
