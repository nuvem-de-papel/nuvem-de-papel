-- 0043_test.sql -- pgTAP. Roda em begin;...rollback; (nada aqui persiste).
begin;
select plan(2);

select has_column('public', 'catalog_items', 'group_name',
  'catalog_items.group_name deve existir apos 0043');

select has_column('public', 'catalog_items', 'subgroup_name',
  'catalog_items.subgroup_name deve existir apos 0043');

select * from finish();
rollback;
