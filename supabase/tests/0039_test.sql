-- 0039_test.sql - carta de insights com IA.
-- Padrao do projeto: devolve UMA linha; gate = falhas = 0.
select
  ( (case when exists (
        select 1 from information_schema.tables
        where table_schema='public' and table_name='insight_cartas') then 0 else 1 end)
  + (case when (select count(*) from information_schema.columns
        where table_schema='public' and table_name='insight_cartas'
          and column_name in ('indicadores','texto','status','periodo_inicio','periodo_fim','tipo')) = 6
      then 0 else 1 end)
  + (case when exists (
        select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname='insight_cartas' and c.relrowsecurity)
      then 0 else 1 end)
  ) as falhas;
