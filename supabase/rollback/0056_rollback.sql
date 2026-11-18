-- 0056_rollback.sql - remove o bucket `produtos`.
-- ATENCAO, nesta ordem:
--  1. devolver item_images para as URLs anteriores (o importador grava o
--     estado de antes em audit_log, action 'catalogo.importar_jq', coluna
--     `before`) - senao a vitrine fica com foto quebrada (cai na ilustrativa);
--  2. esvaziar o bucket pela API do Storage (painel > Storage > produtos >
--     selecionar tudo > Delete). O Supabase recusa DELETE direto em
--     storage.objects por SQL;
--  3. so entao rodar o bloco abaixo (falha se ainda houver objeto).
begin;
delete from storage.buckets where id = 'produtos';
commit;
