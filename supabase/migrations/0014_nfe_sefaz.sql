-- 0014_nfe_sefaz.sql - maquina de estados da NF-e e colunas do ciclo SEFAZ
-- (F8.2: motor SEFAZ com A1+CSC).
-- Contexto (roadmap F8.2):
--   * a nota nascia "emitida" direto (registro interno, nunca transmitido);
--     agora ela nasce "pendente" e so vira "autorizada" apos transmitir ->
--     consultar na SEFAZ (maquina M13: pendente | transmitida | autorizada |
--     rejeitada | cancelada);
--   * colunas do ciclo: ambiente (homologacao|producao - vem de sefaz_config
--     na transmissao), modelo (55 NF-e | 65 NFC-e), chave de acesso (44),
--     recibo, protocolo, XML autorizado, motivo de rejeicao e timestamps;
--   * notas antigas "emitida" migram para "pendente" (nenhuma delas foi
--     transmitida a SEFAZ);
--   * transporte: src/lib/sefaz.ts usa SEFAZ_MOCK=1 em dev/E2E; em producao
--     sem certificado A1 + CSC, transmitir falha fechado (fail-closed) -
--     nunca emite nota real sem credencial.
-- RLS: sem mudanca (0011 ja tem leitura gestao + escrita deny-all).
-- Regra 2: todo dado carrega tenant_id. begin/commit igual ao 0009-0013.

begin;

-- colunas do ciclo SEFAZ -----------------------------------------------------
alter table nfe_emissoes
  add column if not exists ambiente text not null default 'homologacao',
  add column if not exists modelo smallint not null default 55,
  add column if not exists chave text,
  add column if not exists recibo text,
  add column if not exists protocolo text,
  add column if not exists xml text,
  add column if not exists motivo text,
  add column if not exists transmitida_em timestamptz,
  add column if not exists autorizada_em timestamptz;

-- novo conjunto de estados: drop do check ANTES do update (senao a migracao
-- emitida -> pendente viola o check antigo), depois o default novo.
alter table nfe_emissoes drop constraint if exists nfe_emissoes_status_check;
update nfe_emissoes set status = 'pendente' where status = 'emitida';
alter table nfe_emissoes alter column status set default 'pendente';

alter table nfe_emissoes add constraint nfe_emissoes_status_check
  check (status in ('pendente', 'transmitida', 'autorizada', 'rejeitada', 'cancelada'));

alter table nfe_emissoes drop constraint if exists nfe_emissoes_ambiente_check;
alter table nfe_emissoes add constraint nfe_emissoes_ambiente_check
  check (ambiente in ('homologacao', 'producao'));

alter table nfe_emissoes drop constraint if exists nfe_emissoes_modelo_check;
alter table nfe_emissoes add constraint nfe_emissoes_modelo_check
  check (modelo in (55, 65));

alter table nfe_emissoes drop constraint if exists nfe_emissoes_chave_check;
alter table nfe_emissoes add constraint nfe_emissoes_chave_check
  check (chave is null or chave ~ '^[0-9]{44}$');

-- invariantes por estado -----------------------------------------------------
alter table nfe_emissoes
  drop constraint if exists nfe_emissoes_autorizada_ok;
alter table nfe_emissoes add constraint nfe_emissoes_autorizada_ok
  check (status <> 'autorizada'
         or (chave is not null and protocolo is not null and autorizada_em is not null));

alter table nfe_emissoes
  drop constraint if exists nfe_emissoes_transmitida_ok;
alter table nfe_emissoes add constraint nfe_emissoes_transmitida_ok
  check (status <> 'transmitida' or recibo is not null);

alter table nfe_emissoes
  drop constraint if exists nfe_emissoes_pendente_ok;
alter table nfe_emissoes add constraint nfe_emissoes_pendente_ok
  check (status <> 'pendente' or (recibo is null and transmitida_em is null));

-- chave de acesso unica por tenant (evita retransmissao da mesma nota) -------
create unique index if not exists nfe_emissoes_chave_key
  on nfe_emissoes (tenant_id, chave) where chave is not null;

commit;
