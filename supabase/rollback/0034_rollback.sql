-- 0034_rollback.sql - Zeragem de dados fictícios.
--
-- ATENCAO: a 0034 APAGA dados operacionais (pedidos, títulos, diário, estoque,
-- clientes, produtos, etc.). Não há como desfazer isso via SQL - os dados são
-- perdidos. Se precisar restaurar, use um backup do Supabase (Point-in-Time
-- Recovery ou snapshot manual antes de rodar a migration).
--
-- Este arquivo existe só para documentar o risco e não faz nada.

select 'ROLLBACK NAO E POSSIVEL: a 0034 apaga dados operacionais definitivamente. Restaure de backup se necessario.' as aviso;
