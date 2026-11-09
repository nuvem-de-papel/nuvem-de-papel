-- 0046_test.sql -- pgTAP. Roda em begin;...rollback; (nada aqui persiste).
begin;
select plan(4);

select has_table('public', 'ncm_referencia', 'tabela ncm_referencia deve existir apos 0046');

select ok(
  (select count(*) from ncm_referencia) >= 20,
  'ncm_referencia deve ter pelo menos 20 categorias cadastradas no seed'
);

select ok(
  (select ncm from ncm_referencia where categoria_papelaria = 'cadernos') = '4820.20.00',
  'cadernos deve apontar para NCM 4820.20.00'
);

select ok(
  (select confianca from ncm_referencia where categoria_papelaria = 'papel_crepom') = 'nao_confirmado',
  'papel_crepom deve estar marcado como nao_confirmado (nenhuma fonte direta encontrada)'
);

select * from finish();
rollback;
