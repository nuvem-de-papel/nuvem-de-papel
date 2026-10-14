-- 0029_rollback.sql - desfaz o cadastro completo do cliente.
--
-- ATENCAO: apaga telefone, whatsapp, nascimento, endereco (cep..cidade),
-- observacoes, limite_credito, ativo e foto_url de TODOS os clientes. A tela
-- de cliente volta ao formato enxuto (nome/email/doc/ie/uf/tier/pontos) e os
-- contadores Ativos/Inativos somem. Nenhuma outra tabela e afetada.

alter table customers
  drop column if exists telefone,
  drop column if exists whatsapp,
  drop column if exists nascimento,
  drop column if exists cep,
  drop column if exists logradouro,
  drop column if exists numero,
  drop column if exists complemento,
  drop column if exists bairro,
  drop column if exists cidade,
  drop column if exists observacoes,
  drop column if exists limite_credito,
  drop column if exists ativo,
  drop column if exists foto_url;

alter table customers drop constraint if exists customers_telefone_check;
alter table customers drop constraint if exists customers_whatsapp_check;
alter table customers drop constraint if exists customers_cep_check;
alter table customers drop constraint if exists customers_limite_credito_check;
