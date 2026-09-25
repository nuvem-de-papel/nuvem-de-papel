-- crm-seed.sql — colar no SQL Editor do Supabase (staging primeiro),
-- depois que a migration 0003 estiver aplicada. Dados de demonstração
-- realistas (números pequenos de propósito — é o volume real de teste,
-- não os números arredondados do mockup).

insert into customers (tenant_id, name, email, tier, points) values
  ('00000000-0000-0000-0000-000000000001','Manuela Souza','manuela.souza@example.com','ouro',1240),
  ('00000000-0000-0000-0000-000000000001','Larissa Prado','larissa.prado@example.com','diamante',1980),
  ('00000000-0000-0000-0000-000000000001','Beatriz Alencar','beatriz.alencar@example.com','prata',420),
  ('00000000-0000-0000-0000-000000000001','Julia Ferreira','julia.ferreira@example.com','bronze',90)
on conflict (tenant_id, email) do nothing;

insert into orders (tenant_id, customer_id, channel, status, total_amount, created_at)
select '00000000-0000-0000-0000-000000000001', c.id, 'varejo', v.status, v.total, v.created_at
from customers c
join (values
  ('manuela.souza@example.com','entregue',194.14, now() - interval '2 days'),
  ('manuela.souza@example.com','entregue',96.80, now() - interval '18 days'),
  ('larissa.prado@example.com','em_rota',312.50, now() - interval '1 day'),
  ('larissa.prado@example.com','entregue',149.90, now() - interval '10 days'),
  ('beatriz.alencar@example.com','processando',89.90, now() - interval '3 hours'),
  ('julia.ferreira@example.com','cancelado',64.90, now() - interval '5 days')
) as v(email, status, total, created_at) on v.email = c.email
where c.tenant_id = '00000000-0000-0000-0000-000000000001';

insert into campaigns (tenant_id, name, status, info, starts_at) values
  ('00000000-0000-0000-0000-000000000001','Cupom Volta às Aulas -15%','ativa','Válido até 30/09',null),
  ('00000000-0000-0000-0000-000000000001','Aniversariantes do mês','ativa','E-mail + cupom automático',null),
  ('00000000-0000-0000-0000-000000000001','Black Friday Nuvem','agendada','Início em 20/11','2026-11-20T00:00:00Z');
