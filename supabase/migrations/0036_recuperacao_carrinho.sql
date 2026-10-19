-- 0036_recuperacao_carrinho.sql - recuperação de carrinho abandonado.
--
-- Contexto (regra 19/10/2026 - staging primeiro):
--   * o checkout cria o pedido em `aguardando_pagamento` e manda o cliente pro
--     link do Mercado Pago (0006/0025). Quem não paga deixa o pedido PARADO
--     nesse status até alguém cancelar na mão (logistica/actions.ts:97);
--   * ninguem retoma essa venda: sem aviso de "ainda dá tempo de pagar".
--
-- Decisão: régua de recuperação por e-mail (Resend), espelhando a 0035.
--   * `cart_recovery_rules`  - os passos (+1, +3, +7 dias após o pedido), texto.
--   * `cart_recovery_sends`  - trilha com unique (order_id, rule_id) -> nunca
--                              manda o mesmo toque 2x (idempotência).
--   * `orders.mp_init_point` - passa a persistir a URL de pagamento do MP
--                              (antes só ficava em memoria no checkout, 0036
--                              checkout/actions.ts:455) pra o e-mail ter o link.
-- A régua PARA sozinha: so considera pedidos ainda em `aguardando_pagamento`
-- (ao virar `pago` pelo webhook 0007:97 ou `cancelado`, saem da consulta).
-- RLS so leitura master/gerente (mesmo padrao da 0035/0008:179-204).

begin;

alter table orders add column if not exists mp_init_point text;

create table if not exists cart_recovery_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  dias integer not null,
  ativo boolean not null default true,
  texto text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, dias)
);

create table if not exists cart_recovery_sends (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  rule_id uuid not null references cart_recovery_rules(id) on delete cascade,
  enviado_em timestamptz not null default now(),
  sucesso boolean not null,
  erro text,
  email_message_id uuid,
  unique (order_id, rule_id)
);

create index if not exists idx_cart_recovery_sends_order
  on cart_recovery_sends(order_id);

alter table cart_recovery_rules enable row level security;
alter table cart_recovery_sends enable row level security;

create policy "le cart_recovery_rules (gestao)"
  on cart_recovery_rules for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente')
      and p.status = 'ativo'
  ));

create policy "le cart_recovery_sends (gestao)"
  on cart_recovery_sends for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role in ('master','gerente')
      and p.status = 'ativo'
  ));

-- seed: 3 passos padrão (idempotente). {link} = URL de pagamento do MP.
insert into cart_recovery_rules (tenant_id, dias, texto)
select t.id, v.dias, v.texto
  from tenants t
  cross join (values
    (1, 'Oi {nome}! Tudo bem? Aqui é a Nuvem de Papel. Notei que o pedido {codigo} ainda está aguardando pagamento. Ficou alguma dúvida? Se quiser finalizar, o link de pagamento é este: {link}'),
    (3, 'Oi {nome}, tudo bem? O pedido {codigo}, no valor de {valor}, ainda está reservado pra você. Consegue finalizar? Se esbarrou em algum problema no pagamento, é só responder este e-mail que a gente ajuda.'),
    (7, 'Oi {nome}! Passando só pra avisar que a reserva do pedido {codigo} está prestes a expirar. Se ainda quiser, finalize por aqui: {link}. Se mudou de ideia, sem problema — é só nos avisar.')
  ) v(dias, texto)
 where not exists (
   select 1 from cart_recovery_rules r
   where r.tenant_id = t.id and r.dias = v.dias
 );

commit;
