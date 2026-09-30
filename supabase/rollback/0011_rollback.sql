-- Rollback 0011 (destrutivo - laboratorio). Desfaz o modulo de NF-e:
-- remove a tabela nfe_emissoes (documentos emitidos sao descartados).
begin;
drop table if exists nfe_emissoes;
commit;
