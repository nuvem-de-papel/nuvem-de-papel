-- Rollback 0014 (destrutivo - laboratorio). Desfaz a maquina de estados
-- da NF-e e as colunas do ciclo SEFAZ. Notas em estados novos voltam para
-- "emitida" (estado legado) - XML/chave/recibo de teste sao perdidos.
begin;
alter table nfe_emissoes drop constraint if exists nfe_emissoes_pendente_ok;
alter table nfe_emissoes drop constraint if exists nfe_emissoes_transmitida_ok;
alter table nfe_emissoes drop constraint if exists nfe_emissoes_autorizada_ok;
drop index if exists nfe_emissoes_chave_key;
alter table nfe_emissoes drop constraint if exists nfe_emissoes_chave_check;
alter table nfe_emissoes drop constraint if exists nfe_emissoes_modelo_check;
alter table nfe_emissoes drop constraint if exists nfe_emissoes_ambiente_check;

update nfe_emissoes set status = 'emitida'
  where status in ('pendente', 'transmitida', 'autorizada', 'rejeitada');
update nfe_emissoes set status = 'cancelada' where status = 'rejeitada';

alter table nfe_emissoes drop constraint if exists nfe_emissoes_status_check;
alter table nfe_emissoes alter column status set default 'emitida';
alter table nfe_emissoes add constraint nfe_emissoes_status_check
  check (status in ('emitida', 'cancelada'));

alter table nfe_emissoes
  drop column if exists ambiente,
  drop column if exists modelo,
  drop column if exists chave,
  drop column if exists recibo,
  drop column if exists protocolo,
  drop column if exists xml,
  drop column if exists motivo,
  drop column if exists transmitida_em,
  drop column if exists autorizada_em;
commit;
