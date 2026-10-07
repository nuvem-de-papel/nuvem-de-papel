-- Rollback 0025 - devolve orders/financial_* ao estado anterior a 0025.
--
-- Desfaz o gatilho, as duas funcoes e os titulos que a propria 0025 criou.
-- A limpeza e pela CHAVE dela ('web:' || id do pedido): os titulos da semente
-- de demonstracao (10 em producao, chave propria) e os do pdv_register_sale
-- ficam intactos - apagar esses seria apagar dado de negocio de outra origem.
-- Os titulos removidos sao recriados pelo backfill da migration quando ela
-- rodar de novo (agora pulando pedidos que ja tem titulo de qualquer origem).
begin;

drop trigger if exists trg_orders_titulo_web on orders;
drop function if exists orders_titulo_web();
drop function if exists garantir_titulo_web(uuid, uuid, text, text, numeric, uuid);

delete from public.financial_installments i
 using public.financial_titles t
 where i.title_id = t.id
   and t.source_type = 'web'
   and t.idempotency_key = 'web:' || t.source_id::text;

delete from public.financial_titles
 where source_type = 'web'
   and idempotency_key = 'web:' || source_id::text;

commit;
