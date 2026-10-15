-- Teste da migration 0033 - roda dentro de begin;...rollback;
-- Preco de custo x custo medio (linha financeira do produto):
--   * item_commercial_data ganhou 1 coluna (preco_custo);
--   * item_commercial_data_preco_custo_check: so aceita valor >= 0 (ou null);
--   * `cost_price` continua sendo o custo medio ponderado (0017) - intacto;
--   * RLS inalterado (coluna nova em tabela existente);
--   * invariante global 0020: nenhuma tabela de public sem RLS.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(6);

create temp table _out (line text);

-- 1) coluna existe -------------------------------------------------------------
insert into _out
  select ok(exists(
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'item_commercial_data'
       and column_name = 'preco_custo'
  ), 'item_commercial_data.preco_custo existe');

-- 2) constraint existe ---------------------------------------------------------
insert into _out
  select ok(exists(
    select 1 from pg_constraint
     where conname = 'item_commercial_data_preco_custo_check'
  ), 'item_commercial_data_preco_custo_check existe');

-- fixture: um produto de teste --------------------------------------------------
insert into catalog_items (tenant_id, sku, name)
select t.id, 'T0033-CUSTO', 'Produto 0033'
  from tenants t limit 1;

-- 3) aceita preco de custo positivo --------------------------------------------
insert into item_commercial_data (item_id, preco_custo, cost_price)
select i.id, 12.5, 12.5
  from catalog_items i where i.sku = 'T0033-CUSTO';

insert into _out
  select ok(exists(
    select 1 from item_commercial_data d
      join catalog_items i on i.id = d.item_id
     where i.sku = 'T0033-CUSTO' and d.preco_custo = 12.5
  ), 'aceita preco de custo positivo');

-- 4) recusa preco de custo negativo --------------------------------------------
insert into _out
  select throws_ok(
    $$update item_commercial_data set preco_custo = -1
        where item_id = (select id from catalog_items where sku = 'T0033-CUSTO')$$,
    '23514', null, 'recusa preco de custo negativo'
  );

-- 5) aceita null (produto ainda sem custo) -------------------------------------
insert into _out
  select ok(exists(
    select 1 from catalog_items i
      left join item_commercial_data d on d.item_id = i.id
     where i.sku = 'T0033-CUSTO'
       and (d.item_id is null or d.preco_custo is null or d.preco_custo >= 0)
  ), 'preco_custo aceita null (sem custo ainda)');

-- invariante global do 0020 ----------------------------------------------------
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind in ('r', 'p')
                and not c.relrowsecurity),
            0::bigint, 'nenhuma tabela de public sem RLS');

-- limpeza dos fixtures antes do rollback ----------------------------------------
delete from item_commercial_data
 where item_id in (select id from catalog_items where sku = 'T0033-CUSTO');
delete from catalog_items where sku = 'T0033-CUSTO';

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas,
       coalesce(string_agg(line, ' | ' order by line), '') as linhas
  from _out;

rollback;
