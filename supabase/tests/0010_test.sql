-- Teste estrutural 0010 - roda dentro de begin;...rollback;
-- Cobre: email_messages (estrutura, checks de direcao/status, dedupe de
-- inbound por Message-ID, unicidade do resend_id), bucket privado de
-- anexos, RLS deny-all de escrita (anon/authenticated) e leitura restrita
-- a gestao ativo (master|gerente).
-- Formato _out: a API de query do Supabase devolve so o ultimo result set
-- com linhas e finish() emite so notices — entao cada assert e gravado em
-- temp table e o gate final e (asserts, falhas).
begin;
select plan(33);

create temp table _out (line text);
grant insert, select on _out to anon, authenticated;

insert into _out select has_table('email_messages');
insert into _out select has_column('email_messages', 'tenant_id');
insert into _out select has_column('email_messages', 'direction');
insert into _out select has_column('email_messages', 'status');
insert into _out select has_column('email_messages', 'source');
insert into _out select has_column('email_messages', 'from_email');
insert into _out select has_column('email_messages', 'to_emails');
insert into _out select has_column('email_messages', 'subject');
insert into _out select has_column('email_messages', 'html');
insert into _out select has_column('email_messages', 'text');
insert into _out select has_column('email_messages', 'headers');
insert into _out select has_column('email_messages', 'resend_id');
insert into _out select has_column('email_messages', 'external_message_id');
insert into _out select has_column('email_messages', 'thread_id');
insert into _out select has_column('email_messages', 'in_reply_to');
insert into _out select has_column('email_messages', 'attachments');
insert into _out select has_column('email_messages', 'read_at');
insert into _out select has_column('email_messages', 'error');
insert into _out select has_column('email_messages', 'actor_user_id');
insert into _out select has_column('email_messages', 'related_entity');
insert into _out select has_column('email_messages', 'updated_at');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'email_messages'::regclass
        and conname = 'email_messages_direction_check'
        and pg_get_constraintdef(oid) like '%outbound%'
        and pg_get_constraintdef(oid) like '%inbound%'),
    1::bigint, 'direction aceita outbound e inbound');
insert into _out
  select is(
    (select count(*) from pg_constraint
      where conrelid = 'email_messages'::regclass
        and conname = 'email_messages_status_check'
        and pg_get_constraintdef(oid) like '%received%'
        and pg_get_constraintdef(oid) like '%bounced%'
        and pg_get_constraintdef(oid) like '%delivered%'),
    1::bigint, 'status cobre delivered/bounced/received');
insert into _out
  select is(
    (select count(*) from pg_index x
       join pg_class c on c.oid = x.indexrelid
      where c.relname = 'uq_email_messages_dedupe_inbound'
        and x.indisunique),
    1::bigint, 'dedupe unico de inbound por tenant + Message-ID');
insert into _out
  select is(
    (select count(*) from pg_index x
       join pg_class c on c.oid = x.indexrelid
      where c.relname = 'uq_email_messages_resend_id'
        and x.indisunique),
    1::bigint, 'resend_id do outbound e unico');
insert into _out
  select is(
    (select count(*) from storage.buckets
      where id = 'email-attachments' and public = false),
    1::bigint, 'bucket email-attachments existe e e privado');
insert into _out select policies_are('email_messages',
  array['leitura da caixa (gestao)']);
insert into _out
  select ok(
    (select relrowsecurity from pg_class
      where oid = 'email_messages'::regclass),
    'RLS ativo em email_messages');

-- seed ---------------------------------------------------------------------
insert into email_messages
  (tenant_id, direction, status, from_email, to_emails, subject,
   external_message_id)
values
  ('00000000-0000-0000-0000-000000000001', 'inbound', 'received',
   'cliente@exemplo.com', '["contatos@nuvemdepapel.com.br"]'::jsonb,
   'Mensagem de teste', '<msg-0010@teste.local>');

insert into _out
  select throws_ok(
    $q$insert into email_messages
         (tenant_id, direction, status, from_email, to_emails, subject,
          external_message_id)
       values
         ('00000000-0000-0000-0000-000000000001', 'inbound', 'received',
          'cliente@exemplo.com', '[]'::jsonb, 'duplicada',
          '<msg-0010@teste.local>')$q$,
    '23505', null, 'Message-ID duplicado do inbound e bloqueado');

-- deny-all de escrita --------------------------------------------------------
set local role anon;
insert into _out
  select throws_ok(
    $q$insert into email_messages (tenant_id, direction, from_email)
       values (gen_random_uuid(), 'outbound', 'anon@exemplo.com')$q$,
    '42501', null, 'anon nao escreve em email_messages'
  );
reset role;

set local role authenticated;
insert into _out
  select throws_ok(
    $q$insert into email_messages (tenant_id, direction, from_email)
       values (gen_random_uuid(), 'outbound', 'auth@exemplo.com')$q$,
    '42501', null, 'authenticated nao escreve em email_messages'
  );
insert into _out
  select is(
    (select count(*) from email_messages), 0::bigint,
    'authenticated sem papel nao le a caixa'
  );
reset role;

-- leitura de gestao (seed de usuario + perfil) --------------------------------
insert into auth.users (id, email)
values ('30000000-0000-4000-8000-000000000001',
        'gestao-email-teste@e2e.local');
insert into profiles (id, tenant_id, email, full_name, role, status)
values ('30000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        'gestao-email-teste@e2e.local', 'Gestor Teste Email', 'master',
        'ativo');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true);
insert into _out
  select is(
    (select count(*) from email_messages), 1::bigint,
    'gestao ativo le a caixa'
  );
select set_config('request.jwt.claims', '', true);
reset role;

-- gate: total de asserts e falhas (o helper mostra o ultimo com linhas) ------
select count(*) as asserts,
       count(*) filter (where line like 'not ok%') as falhas
  from _out;
select line from _out where line like 'not ok%';
rollback;
