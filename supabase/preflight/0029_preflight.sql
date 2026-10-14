-- 0029_preflight.sql - Cadastro completo do cliente (contato + endereco + situacao).
-- Objetivo: garantir que o ciclo NAO roda duas vezes. Se alguma coluna da 0029
-- ja existe, a query devolve a lista e o ritual para antes de aplicar.

select
  case when count(*) = 0
    then 'PREFLIGHT OK: nenhuma coluna da 0029 existe - pode aplicar'
    else 'PREFLIGHT FALHOU - colunas ja existem: ' || string_agg(col, ', ' order by col)
  end as resultado
from (
  select column_name::text as col
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'customers'
     and column_name in (
       'telefone','whatsapp','nascimento','cep','logradouro','numero',
       'complemento','bairro','cidade','observacoes','limite_credito',
       'ativo','foto_url'
     )
) as existentes;
