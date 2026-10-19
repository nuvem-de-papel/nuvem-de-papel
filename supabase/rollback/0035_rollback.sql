-- 0035_rollback.sql - desfaz a régua de cobrança automática.
--
-- ATENCAO: remove as tabelas cobranca_reguas e cobranca_envios (regras e
-- histórico de envios). NÃO mexe em financial_installments / financial_titles
-- (o financeiro continua íntegro). Os e-mails já enviados permanecem na
-- caixa email_messages - só a trilha da régua é removida.

drop table if exists cobranca_envios;
drop table if exists cobranca_reguas;
