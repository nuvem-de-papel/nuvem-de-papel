-- 0048_test.sql -- pgTAP. Roda em begin;...rollback; (nada aqui persiste).
begin;
select plan(8);

select has_table('public', 'item_images', 'item_images deve existir apos 0048');
select has_table('public', 'product_reviews', 'product_reviews deve existir apos 0048');

select has_column('public', 'item_images', 'position',
  'item_images.position deve existir apos 0048');

select has_column('public', 'product_reviews', 'aprovado',
  'product_reviews.aprovado deve existir apos 0048');

select col_default_is('public', 'product_reviews', 'aprovado', 'false',
  'product_reviews.aprovado deve nascer false (moderacao antes de publicar)');

select throws_ok(
  $$ insert into product_reviews (tenant_id, item_id, nota)
     values ('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 6) $$,
  '23514',
  null,
  'nota fora de 1-5 deve falhar no check'
);

select col_is_unique('public', 'item_images', array['item_id','position'],
  'item_images deve ter unique(item_id, position) - sem 2 fotos na mesma posicao');

select ok(
  (select relrowsecurity from pg_class where relname = 'product_reviews'),
  'product_reviews deve ter RLS habilitado'
);

select * from finish();
rollback;
