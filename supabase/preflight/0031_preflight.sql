-- 0031_preflight.sql - Produtos completos + importacao por link (Bloco 2).
-- Objetivo: garantir que o ciclo NAO roda duas vezes. Se alguma coluna/tabela
-- da 0031 ja existe, a query devolve a lista e o ritual para antes de aplicar.

select
  case when count(*) = 0
    then 'PREFLIGHT OK: nada da 0031 existe - pode aplicar'
    else 'PREFLIGHT FALHOU - ja existe: ' || string_agg(alvo, ', ' order by alvo)
  end as resultado
from (
  -- tabela nova
  select ('tabela:'||table_name)::text as alvo
    from information_schema.tables
   where table_schema = 'public' and table_name = 'item_supplier_data'
  union all
  -- colunas novas em catalog_items
  select ('catalog_items.'||column_name)::text
    from information_schema.columns
   where table_schema = 'public' and table_name = 'catalog_items'
     and column_name in ('fabricante','notes','hide_price_table','last_adjusted_at')
  union all
  -- colunas novas em item_fiscal_data
  select ('item_fiscal_data.'||column_name)::text
    from information_schema.columns
   where table_schema = 'public' and table_name = 'item_fiscal_data'
     and column_name in ('cst_pis','cst_cofins','icms_base_pct','cst_ibscbs','cclass_trib','gtin_tributavel')
) as existentes;
