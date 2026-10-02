-- Preflight 0014 - confirma pre-requisitos antes de aplicar.
do $$
begin
  if to_regclass('public.nfe_emissoes') is null then
    raise exception 'preflight 0014: public.nfe_emissoes ausente (0011 nao aplicada)';
  end if;
  if to_regclass('public.sefaz_config') is null then
    raise exception 'preflight 0014: public.sefaz_config ausente (0013 nao aplicada)';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'nfe_emissoes'
               and column_name = 'chave') then
    raise exception 'preflight 0014: nfe_emissoes.chave ja existe (migracao ja aplicada?)';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'nfe_emissoes'::regclass
                   and conname = 'nfe_emissoes_status_check') then
    raise exception 'preflight 0014: nfe_emissoes_status_check ausente (0011 integra?)';
  end if;
  if not exists (select 1 from tenants where id = '00000000-0000-0000-0000-000000000001') then
    raise exception 'preflight 0014: tenant padrao 00000000-0000-0000-0000-000000000001 ausente';
  end if;
end $$;
