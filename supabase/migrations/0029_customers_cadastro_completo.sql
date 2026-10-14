-- 0029_customers_cadastro_completo.sql - tela unica de cadastros (cliente).
-- Contexto (gap do CadastrosTelaUnica vs. tela-alvo):
--   * a tela de cliente mostrava so nome/email/doc/ie/uf/tier/pontos; endereco
--     e telefone NAO existiam como coluna (a propria status-bar dizia isso);
--   * esta migration abre as colunas de CONTATO, ENDERECO e SITUACAO para o
--     cadastro virar ficha completa (mesmo desenho das telas de produto/empresa);
--   * 'ativo' nasce true para o contador Ativos/Inativos (flag de bloqueio de
--     atendimento) - clientes existentes continuam ativos;
--   * telefone/whatsapp/cep guardam SO digitos (mesma convencao de 'documento',
--     0016) - a mascara e aplicada na tela;
--   * RLS continua deny-all (0003): nada muda em policy, so schema.
-- begin/commit igual ao 0009-0028.

begin;

alter table customers
  add column if not exists telefone text,
  add column if not exists whatsapp text,
  add column if not exists nascimento date,
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists observacoes text,
  add column if not exists limite_credito numeric(10,2) not null default 0,
  add column if not exists ativo boolean not null default true,
  add column if not exists foto_url text;

alter table customers drop constraint if exists customers_telefone_check;
alter table customers add constraint customers_telefone_check
  check (telefone is null or telefone ~ '^[0-9]{10,11}$');

alter table customers drop constraint if exists customers_whatsapp_check;
alter table customers add constraint customers_whatsapp_check
  check (whatsapp is null or whatsapp ~ '^[0-9]{11}$');

alter table customers drop constraint if exists customers_cep_check;
alter table customers add constraint customers_cep_check
  check (cep is null or cep ~ '^[0-9]{8}$');

alter table customers drop constraint if exists customers_limite_credito_check;
alter table customers add constraint customers_limite_credito_check
  check (limite_credito >= 0);

commit;
