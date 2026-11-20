-- 0060 - preflight: 0059 aplicada, funcoes novas ainda nao, dados atuais cabem nos checks novos.
select
  to_regclass('public.corporate_accounts') is not null as base_0059_ok,
  to_regprocedure('public.corporate_place_order(uuid,jsonb,jsonb,text,text)') is null as rpc_nova,
  to_regprocedure('public.corporate_credit(uuid)') is null as credito_novo,
  not exists (select 1 from public.orders o where o.condicao is not null
               and not (o.condicao in ('À vista','30 dias','30/60','30/60/90')
                        or o.condicao ~ '^[0-9]{1,2}x$' or o.condicao ~ '^[0-9]{1,3} dias$')) as condicoes_ok,
  not exists (select 1 from public.financial_titles
               where source_type not in ('pdv','web','purchase_receipt','manual','corporativo')) as origens_titulo_ok;
