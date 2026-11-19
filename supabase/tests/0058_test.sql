-- 0058 - teste (so leitura). Ultima linha: FALHAS = true quando tudo passou.
with c as (
  select
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='catalog_grupos'
               and column_name='na_barra' and is_nullable='NO') as coluna_ok,
    (select count(*) from public.catalog_grupos where na_barra) between 1 and 9 as algum_na_barra,
    has_column_privilege('anon', 'public.catalog_grupos', 'na_barra', 'select') as anon_le
)
select coluna_ok, algum_na_barra, anon_le, (coluna_ok and algum_na_barra and anon_le) as "FALHAS"
from c;
