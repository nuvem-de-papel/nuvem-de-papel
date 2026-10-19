-- 0035_cobranca_regua.sql - régua de cobrança automática (lembretes de títulos a receber).
--
-- Contexto (regra 19/10/2026 - staging primeiro):
--   * o ERP já tem títulos e parcelas a receber (financial_titles / financial_installments,
--     0008:111-150) com vencimento e status, mas NENHUM lembrete automático:
--     a baixa é manual (0025:21-22) e ninguém cobra o cliente atrasado;
--   * a régua manda e-mail (Resend, já integrado via src/lib/email.ts:72) nos dias
--     configurados (-3, 0, +3, +7, +15 em relação ao vencimento) e PARA sozinha
--     quando a parcela é liquidada (financial_settle vira 'liquidado', 0008:622-632);
--   * WhatsApp (Meta Cloud API) fica para a etapa 2 - por enquanto só e-mail.
--
-- Decisão: duas tabelas novas, sem mexer nas financeiras.
--   * `cobranca_reguas` - os passos configuráveis (dias, canal, texto), seed de 5.
--   * `cobranca_envios` - trilha de cada envio, com unique (installment_id, regua_id, canal)
--                         para NUNCA mandar a mesma etapa duas vezes (idempotência).
-- A régua roda por server action / cron route com admin client (service_role),
-- então RLS aqui é só leitura para master/gerente (mesmo padrão do financeiro 0008:179-204).

begin;

create table if not exists cobranca_reguas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  dias integer not null,
  canal text not null default 'email' check (canal in ('email', 'whatsapp', 'ambos')),
  ativo boolean not null default true,
  texto text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, dias)
);

create table if not exists cobranca_envios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  installment_id uuid not null references financial_installments(id) on delete cascade,
  regua_id uuid not null references cobranca_reguas(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp')),
  enviado_em timestamptz not null default now(),
  sucesso boolean not null,
  erro text,
  email_message_id uuid,
  unique (installment_id, regua_id, canal)
);

create index if not exists idx_cobranca_envios_inst
  on cobranca_envios(installment_id);

alter table cobranca_reguas enable row level security;
alter table cobranca_envios enable row level security;

create policy "le reguas (gestao)"
  on cobranca_reguas for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente')
      and p.status = 'ativo'
  ));

create policy "le envios (gestao)"
  on cobranca_envios for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente')
      and p.status = 'ativo'
  ));

-- seed: 5 passos padrão (idempotente - só insere se o dia não existir ainda)
insert into cobranca_reguas (tenant_id, dias, canal, texto)
select t.id, v.dias, 'email', v.texto
  from tenants t
  cross join (values
    (-3, 'Olá {nome}! Tudo bem? Aqui é a Nuvem de Papel. Passando para avisar que o pagamento {descricao}, no valor de {valor}, vence em {vencimento}. Se já programou o pagamento, pode desconsiderar esta mensagem. Qualquer dúvida, é só responder este e-mail.'),
    (0,  'Olá {nome}! A Nuvem de Papel lembra que o pagamento {descricao}, no valor de {valor}, vence hoje ({vencimento}). Se já pagou, muito obrigado! Se preferir combinar outra data, é só responder este e-mail.'),
    (3,  'Olá {nome}! O pagamento {descricao}, no valor de {valor}, venceu em {vencimento} e ainda não foi localizado. Se já pagou, pode desconsiderar esta mensagem. Se precisar combinar, é só responder - estamos à disposição.'),
    (7,  'Olá {nome}! Retomando o assunto: o pagamento {descricao}, no valor de {valor}, com vencimento em {vencimento}, ainda está em aberto. Se houver algum imprevisto, podemos combinar. Basta responder este e-mail.'),
    (15, 'Olá {nome}! Sobre o pagamento {descricao}, no valor de {valor}, com vencimento em {vencimento}: gostaríamos de saber se podemos ajudar com alguma questão. Se preferir negociar as condições, é só responder este e-mail.')
  ) v(dias, texto)
 where not exists (
   select 1 from cobranca_reguas r
   where r.tenant_id = t.id and r.dias = v.dias
 );

commit;
