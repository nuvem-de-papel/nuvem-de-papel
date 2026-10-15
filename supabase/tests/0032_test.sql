-- Teste da migration 0032 - roda dentro de begin;...rollback;
-- Foto do produto (Bloco 2, follow-up):
--   * catalog_items ganhou 1 coluna (foto_url);
--   * catalog_items_foto_url_check: so aceita https + .jpg|.png|.webp;
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
     where table_schema = 'public' and table_name = 'catalog_items'
       and column_name = 'foto_url'
  ), 'catalog_items.foto_url existe');

-- 2) constraint existe ---------------------------------------------------------
insert into _out
  select ok(exists(
    select 1 from pg_constraint
     where conname = 'catalog_items_foto_url_check'
  ), 'catalog_items_foto_url_check existe');

-- 3) aceita URL https de imagem ------------------------------------------------
insert into catalog_items (tenant_id, sku, name, foto_url)
select t.id, 'T0032-FOTO', 'Produto 0032',
       'https://www.reval.net/imagem/produtos/m/080000.jpg'
  from tenants t limit 1;

insert into _out
  select ok(exists(
    select 1 from catalog_items where sku = 'T0032-FOTO'
      and foto_url like 'https://%.jpg'
  ), 'aceita URL https .jpg');

-- 4) recusa http (fora de https) -----------------------------------------------
insert into _out
  select throws_ok(
    $$update catalog_items set foto_url = 'http://www.reval.net/imagem/produtos/m/080000.jpg'
       where sku = 'T0032-FOTO'$$,
    '23514', null, 'recusa http (fora de https)'
  );

-- 5) recusa extensao nao-imagem -------------------------------------------------
insert into _out
  select throws_ok(
    $$update catalog_items set foto_url = 'https://www.reval.net/produto/pagina.html'
       where sku = 'T0032-FOTO'$$,
    '23514', null, 'recusa extensao nao-imagem'
  );

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
delete from catalog_items where sku = 'T0032-FOTO';

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas,
       coalesce(string_agg(line, ' | ' order by line), '') as linhas
  from _out;

rollback;
