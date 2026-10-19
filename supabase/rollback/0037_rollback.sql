-- 0037_rollback.sql - desfaz reativação + avaliações.
--
-- ATENCAO: remove as tabelas customer_reactivation, review_requests e
-- marketing_config. NÃO mexe em customers nem orders (dados preservados).
-- Os e-mails já enviados permanecem em email_messages; cliques/notas em
-- review_requests são perdidos.

drop table if exists review_requests;
drop table if exists customer_reactivation;
drop table if exists marketing_config;
