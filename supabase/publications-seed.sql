-- publications-seed.sql — colar no SQL Editor do Supabase (staging), depois
-- que a migration 0002 estiver aplicada. 3 posts reais do canvas de design.

insert into publications (tenant_id, slug, title, category, excerpt, reading_minutes, published_at)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'ideias-de-bullet-journal-outubro',
    '5 ideias de bullet journal para outubro',
    'Dica de organização',
    'Layouts simples e práticos para organizar outubro sem perder tempo.',
    4,
    '2026-10-03T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'colecao-nuvem-de-algodao-2026',
    'Chegou a coleção Nuvem de Algodão 2026',
    'Lançamento',
    'Nova linha de cadernos e acessórios em tons pastel, direto da fábrica pra sua casa.',
    3,
    '2026-09-28T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'kit-perfeito-volta-as-aulas',
    'Como montar o kit perfeito de volta às aulas',
    'Novidade',
    'Guia rápido pra montar o kit ideal sem gastar mais do que precisa.',
    5,
    '2026-09-15T00:00:00Z'
  )
on conflict (tenant_id, slug) do nothing;
