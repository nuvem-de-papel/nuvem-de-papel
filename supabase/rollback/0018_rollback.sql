-- Rollback 0018 - desfaz a migration 0018 (so funcoes; nenhum dado alterado
-- por aqui; conversoes/importacoes ja feitas permanecem).
begin;
drop function if exists vendas_convert_to_sale(uuid);
drop function if exists vendas_import_loja(uuid[]);
commit;
