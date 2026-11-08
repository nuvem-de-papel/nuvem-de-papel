-- 0040_test.sql - venda manual (telefone/balcao).
-- Padrao do projeto: devolve UMA linha; gate = falhas = 0.
select
  ( (case when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname='manual_register_sale') then 0 else 1 end)
  + (case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname='manual_register_sale') = 1 then 0 else 1 end)
  + (case when exists (
        select 1 from pg_constraint
        where conrelid='orders'::regclass and conname='orders_origem_check'
          and pg_get_constraintdef(oid) like '%manual%') then 0 else 1 end)
  + (case when exists (
        select 1 from pg_constraint
        where conrelid='orders'::regclass and conname='orders_payment_method_check'
          and pg_get_constraintdef(oid) like '%fiado%') then 0 else 1 end)
  + (case when exists (
        select 1 from pg_constraint
        where conrelid='orders'::regclass and conname='orders_condicao_check'
          and pg_get_constraintdef(oid) like '%[0-9]{1,2}x%') then 0 else 1 end)
  + (case when exists (
        select 1 from pg_constraint
        where conrelid='financial_titles'::regclass and conname='financial_titles_source_type_check'
          and pg_get_constraintdef(oid) like '%manual%') then 0 else 1 end)
  + (case when not has_function_privilege('anon',
        'public.manual_register_sale(jsonb,text,sales_channel,integer,numeric,uuid,jsonb,jsonb,text)','EXECUTE')
      then 0 else 1 end)
  + (case when not has_function_privilege('authenticated',
        'public.manual_register_sale(jsonb,text,sales_channel,integer,numeric,uuid,jsonb,jsonb,text)','EXECUTE')
      then 0 else 1 end)
  + (case when has_function_privilege('service_role',
        'public.manual_register_sale(jsonb,text,sales_channel,integer,numeric,uuid,jsonb,jsonb,text)','EXECUTE')
      then 0 else 1 end)
  ) as falhas;
