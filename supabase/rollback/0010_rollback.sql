-- Rollback 0010 (destrutivo - laboratorio). Desfaz o modulo de e-mail:
-- caixa unica email_messages; anexos/bucket sao best-effort porque o
-- Supabase bloqueia DELETE direto em storage (trigger protect_delete).
-- Se o bucket nao for removivel via SQL, ele permanece vazio e a
-- reaplicacao continua segura: o insert usa on conflict do nothing e o
-- preflight 0010 so checa email_messages (remocao total, se necessaria:
-- Storage API admin.storage.deleteBucket('email-attachments')).
begin;

do $$
begin
  delete from storage.objects where bucket_id = 'email-attachments';
exception when others then
  raise notice 'rollback 0010: storage.objects nao removido via SQL (%)', sqlerrm;
end $$;

do $$
begin
  delete from storage.buckets where id = 'email-attachments';
exception when others then
  raise notice 'rollback 0010: bucket nao removido via SQL (%) - usar Storage API se necessario', sqlerrm;
end $$;

drop table if exists email_messages;

commit;
