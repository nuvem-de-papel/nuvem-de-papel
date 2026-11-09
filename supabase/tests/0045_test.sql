-- 0045_test.sql -- pgTAP. Roda em begin;...rollback; (nada aqui persiste).
begin;
select plan(2);

select has_column('public', 'catalog_items', 'detalhes_produto',
  'catalog_items.detalhes_produto deve existir apos 0045');

select ok(
  (select is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'catalog_items'
     and column_name = 'detalhes_produto') = 'YES',
  'detalhes_produto deve aceitar NULL (produto sem descricao de fornecedor)'
);

select * from finish();
rollback;
