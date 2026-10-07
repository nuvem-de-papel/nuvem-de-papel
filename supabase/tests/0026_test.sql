-- Teste da migration 0026 - roda dentro de begin;...rollback;
-- Cobre o Modulo 1 (kernel de marketplaces):
--   * 6 tabelas criadas, RLS ligado nas 6 e ZERO policies (deny-all);
--   * 10 canais semeados (7 generalistas / 3 nichados);
--   * fila: dedupe devolve o MESMO job enquanto ativo e libera apos concluir;
--   * claim: pendente -> processando com attempts+1 e locked_at; nao pega
--     job em backoff (next_run_at futuro);
--   * finish: ok -> concluido; erro com tentativas restantes -> pendente com
--     backoff; erro no ultimo attempt -> falhou; so fecha job processando;
--   * reprocess: falhou -> pendente com attempts zerado;
--   * unicidade: listing (conta, item), order (conta, id_externo) e webhook
--     (canal, event_id) recusam duplicata/replay;
--   * invariante global do 0020: nenhuma tabela de public sem RLS.
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas - entao cada assert e gravado em temp table e o gate final e
-- (asserts, falhas).
begin;
select plan(24);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;
create temp table _t (id uuid);
insert into _t select id from tenants limit 1;

-- estrutura ------------------------------------------------------------------
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind = 'r'
                and c.relname in ('marketplace_channels', 'marketplace_accounts',
                                  'marketplace_listings', 'marketplace_jobs',
                                  'marketplace_orders', 'marketplace_webhooks')),
            6::bigint, '6 tabelas de marketplace existem');

insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind = 'r'
                and c.relname in ('marketplace_channels', 'marketplace_accounts',
                                  'marketplace_listings', 'marketplace_jobs',
                                  'marketplace_orders', 'marketplace_webhooks')
                and c.relrowsecurity),
            6::bigint, 'RLS ligado nas 6 tabelas');

insert into _out
  select is((select count(*)
               from pg_policies
              where schemaname = 'public'
                and tablename in ('marketplace_channels', 'marketplace_accounts',
                                  'marketplace_listings', 'marketplace_jobs',
                                  'marketplace_orders', 'marketplace_webhooks')),
            0::bigint, 'zero policies (deny-all) nas 6 tabelas');

-- semente de canais ----------------------------------------------------------
insert into _out
  select is((select count(*) from marketplace_channels), 10::bigint,
            '10 canais semeados');

insert into _out
  select is((select count(*) from marketplace_channels where segmento = 'generalista'),
            7::bigint, '7 generalistas');

insert into _out
  select is((select count(*) from marketplace_channels where segmento = 'nicho'),
            3::bigint, '3 nichados');

-- dados de teste (tudo dentro do rollback) -----------------------------------
create temp table _ids (conta uuid, item uuid, jobA uuid, jobB uuid);
insert into _ids values (gen_random_uuid(), gen_random_uuid(),
                        gen_random_uuid(), gen_random_uuid());

create temp table _ch (id uuid);
insert into _ch select id from marketplace_channels where slug = 'mercado-livre';

insert into marketplace_accounts (id, tenant_id, channel_id, label)
select conta, (select id from _t), (select id from _ch), 'Conta Teste 0026'
  from _ids;

insert into catalog_items (id, tenant_id, sku, name)
select item, (select id from _t), 'SKU-MKT-0026', 'Item Teste 0026'
  from _ids;

-- fila: dedupe ---------------------------------------------------------------
update _ids set jobA = marketplace_enqueue(
  (select id from _t), (select id from _ch), (select conta from _ids),
  null, 'ping', '{}'::jsonb, 'dedupe-0026', 5);

update _ids set jobB = marketplace_enqueue(
  (select id from _t), (select id from _ch), (select conta from _ids),
  null, 'ping', '{}'::jsonb, 'dedupe-0026', 5);

insert into _out
  select is((select count(*) from marketplace_jobs where dedupe_key = 'dedupe-0026'),
            1::bigint, 'dedupe: enqueue repetido nao cria o segundo job');

insert into _out
  select is((select jobB from _ids), (select jobA from _ids),
            'dedupe: devolve o id do job ativo existente');

-- claim ----------------------------------------------------------------------
insert into _out
  select is((select count(*)::int from marketplace_claim(10)), 1,
            'claim retira exatamente o job pendente da fila');

insert into _out
  select is((select status || ':' || attempts || ':' ||
                    (case when locked_at is not null then 'lock' else 'sem-lock' end)
               from marketplace_jobs where id = (select jobA from _ids)),
            'processando:1:lock'::text,
            'claim marca processando, attempts=1 e locked_at');

-- claim nao pega job em backoff (proximo agendamento no futuro)
update marketplace_jobs
   set status = 'pendente', locked_at = null, next_run_at = now() + interval '1 hour'
 where id = (select jobA from _ids);

insert into _out
  select is((select count(*)::int from marketplace_claim(10)), 0,
            'claim ignora job agendado no futuro (backoff)');

-- finish: so fecha o que esta processando ------------------------------------
update marketplace_jobs set status = 'processando', attempts = 1
 where id = (select jobA from _ids);

select marketplace_finish((select jobA from _ids), false, 'boom');
insert into _out
  select is((select status from marketplace_jobs where id = (select jobA from _ids)),
            'pendente'::text,
            'erro com tentativas restantes volta para pendente (backoff)');

update marketplace_jobs set status = 'pendente' where id = (select jobA from _ids);
select marketplace_finish((select jobA from _ids), true, 'nao devia concluir');
insert into _out
  select is((select status from marketplace_jobs where id = (select jobA from _ids)),
            'pendente'::text,
            'finish ignora job que nao esta processando');

-- finish ok ------------------------------------------------------------------
update marketplace_jobs set status = 'processando' where id = (select jobA from _ids);
select marketplace_finish((select jobA from _ids), true, 'ping local ok');
insert into _out
  select is((select status || '|' || result from marketplace_jobs
              where id = (select jobA from _ids)),
            'concluido|ping local ok'::text,
            'finish ok conclui e grava o resultado');

-- dedupe libera depois de concluido ------------------------------------------
update _ids set jobB = marketplace_enqueue(
  (select id from _t), (select id from _ch), (select conta from _ids),
  null, 'ping', '{}'::jsonb, 'dedupe-0026', 5);
insert into _out
  select is((select count(*) from marketplace_jobs where dedupe_key = 'dedupe-0026'),
            2::bigint, 'chave dedupe libera quando o job anterior concluiu');

-- erro no ultimo attempt => falhou -------------------------------------------
update marketplace_jobs
   set status = 'pendente', attempts = 0, max_attempts = 1, next_run_at = now()
 where id = (select jobB from _ids);
select marketplace_claim(10);
insert into _out
  select is((select attempts from marketplace_jobs where id = (select jobB from _ids)),
            1::int, 'claim no job de max_attempts=1 deixa attempts=1');
select marketplace_finish((select jobB from _ids), false, 'adaptador pendente');
insert into _out
  select is((select status from marketplace_jobs where id = (select jobB from _ids)),
            'falhou'::text, 'erro no ultimo attempt marca falhou');

-- reprocess ------------------------------------------------------------------
insert into _out
  select is((select marketplace_reprocess((select jobB from _ids))), true,
            'reprocess aceita job falhou');
insert into _out
  select is((select status || ':' || attempts from marketplace_jobs
              where id = (select jobB from _ids)),
            'pendente:0'::text, 'reprocess volta para pendente com attempts zerado');

insert into _out
  select is((select marketplace_reprocess((select jobA from _ids))), false,
            'reprocess ignora job que nao esta falhou');

-- unicidade: linha primeira, duplicata recusada -------------------------------
insert into marketplace_listings (tenant_id, account_id, item_id)
select (select id from _t), conta, item from _ids;
insert into _out
  select throws_ok(
    $q$insert into marketplace_listings (tenant_id, account_id, item_id)
        select (select id from _t), conta, item from _ids$q$,
    '23505', null, 'anuncio duplicado (conta, item) recusado');

insert into marketplace_orders (tenant_id, account_id, channel_order_id, status_externo)
select (select id from _t), conta, 'PED-EXT-0026', 'paid' from _ids;
insert into _out
  select throws_ok(
    $q$insert into marketplace_orders (tenant_id, account_id, channel_order_id, status_externo)
        select (select id from _t), conta, 'PED-EXT-0026', 'paid' from _ids$q$,
    '23505', null, 'pedido duplicado (conta, id externo) recusado');

insert into marketplace_webhooks (tenant_id, channel_id, event_id, topic)
select (select id from _t), id, 'EVT-0026', 'orders' from _ch;
insert into _out
  select throws_ok(
    $q$insert into marketplace_webhooks (tenant_id, channel_id, event_id, topic)
        select (select id from _t), id, 'EVT-0026', 'orders' from _ch$q$,
    '23505', null, 'webhook repetido (canal, event_id) recusado');

-- invariante global do 0020 --------------------------------------------------
insert into _out
  select is((select count(*)
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and c.relkind in ('r', 'p')
                and not c.relrowsecurity),
            0::bigint, 'nenhuma tabela de public sem RLS');

select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas,
       coalesce(string_agg(case when line like 'not ok%' then line end, ' || '), '') as detalhes
from _out;
rollback;
