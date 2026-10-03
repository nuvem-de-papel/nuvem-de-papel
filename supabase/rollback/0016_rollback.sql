-- Rollback 0016 (destrutivo - laboratorio). Remove dados fiscais do cliente,
-- as tabelas de expedicao e desfaz o backfill do funil (etapa/convertido_em
-- dos documentos erp/pdvo voltam para null). Numeros P-/V- ja gerados em
-- orders nao sao afetados (colunas vieram da 0015).
begin;

drop policy if exists "le eventos de entrega (operacao)" on entrega_eventos;
drop policy if exists "le entregas (operacao)" on entregas;
drop table if exists entrega_eventos;
drop table if exists entregas;

update orders
   set etapa = null,
       convertido_em = null
 where origem in ('erp', 'pdv')
   and etapa = 'venda';

alter table customers drop constraint if exists customers_documento_check;
alter table customers drop constraint if exists customers_uf_check;
alter table customers
  drop column if exists documento,
  drop column if exists ie,
  drop column if exists uf;
commit;
