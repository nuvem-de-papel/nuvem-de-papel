-- 0026_marketplace_core.sql - Modulo 1: kernel de integracao com marketplaces.
--
-- Contexto (decisao do cliente 06/10/2026):
--   * integrar multi-marketplace por mordidas: 1 modulo validado com testes
--     na tela antes de abrir o proximo (M2 = Mercado Livre, M3 = Amazon/
--     Shopee, M4 = nichados);
--   * arquitetura pedida: (a) fila assincrona para respeitar rate limit de
--     cada API, (b) modulo central de autenticacao OAuth 2.0 com ciclo de
--     token, (c) produto-mestre normalizado no nosso lado e cada marketplace
--     como um ADAPTADOR que so mapeia campos - adicionar o 11o canal nao pode
--     mexer no core.
--
-- Tabelas (todas deny-all: RLS ligada + ZERO policies, acesso so via
-- service_role nas server actions - mesmo padrao do tenants no 0020):
--   * marketplace_channels  - catalogo GLOBAL dos 10 canais semeados aqui;
--   * marketplace_accounts   - conta por tenant/canal (tokens OAuth2);
--   * marketplace_listings   - 1 anuncio por (conta, item) - o adaptador
--                              preenche external_id quando publica;
--   * marketplace_jobs       - a FILA: status pendente->processando->
--                              concluido/falhou, tentativas, backoff
--                              exponencial e dedupe_key (unique parcial
--                              enquanto o job esta ativo);
--   * marketplace_orders     - pedido puxado do canal (idempotente por
--                              (conta, channel_order_id), compra-lo de novo
--                              nao duplica);
--   * marketplace_webhooks   - intake idempotente: unique (channel, event_id)
--                              - o replay do marketplace vira "ignorado".
--
-- Funcoes da fila (SECURITY DEFINER, revoke de public/anon/authenticated,
-- grant so para service_role - mesmo ritual do journal_post do 0021):
--   * marketplace_enqueue - enfileira com dedupe (job ativo = o mesmo id);
--   * marketplace_claim   - retira da fila com FOR UPDATE SKIP LOCKED (dois
--                           workers concorrentes nunca pegam o mesmo job);
--   * marketplace_finish  - conclui ou falha: attempts < max => pendente com
--                           backoff 2^attempts seg (cap 300s); atingiu o
--                           max => falhou (fica na tela ate reprocessar);
--   * marketplace_reprocess - falhou -> pendente de novo (attempts zerado).
--
-- Job "ping" e "processar_webhook" sao do KERNEL (sem rede: heartbeat da
-- conta e gravação do evento). Os demais tipos (publicar_item, atualizar_preco,
-- atualizar_estoque, puxar_pedidos, refresh_token) dependem do ADAPTADOR do
-- canal - o handler do kernel os falha com "adaptador pendente (Modulo 2)"
-- em vez de inventar resposta de API que nao foi chamada.

-- ---------------------------------------------------------------------------
-- 1. Catalogo global de canais
-- ---------------------------------------------------------------------------
create table public.marketplace_channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  segmento text not null check (segmento in ('generalista', 'nicho')),
  -- portal de API so quando o endereco e oficial e conhecido; null = "a
  -- confirmar" na tela (nada de link inventado).
  api_docs text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.marketplace_channels is
  'Catalogo global (sem tenant) dos marketplaces suportados pelo kernel.';

-- ---------------------------------------------------------------------------
-- 2. Contas (ciclo OAuth 2.0 por tenant/canal)
-- ---------------------------------------------------------------------------
create table public.marketplace_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  channel_id uuid not null references public.marketplace_channels (id),
  label text not null check (char_length(label) between 2 and 80),
  -- id do seller/vendedor no canal (client_ref): o que a API do canal devolve
  -- apos o OAuth; string opacica porque cada marketplace chama diferente.
  client_ref text,
  status text not null default 'desconectado'
    check (status in ('desconectado', 'conectado', 'erro')),
  auth_mode text not null default 'oauth2'
    check (auth_mode in ('oauth2', 'api_key')),
  -- ciclo de token: access curto (ML expira em 6h), refresh para renovar.
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  last_ping_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_id, label)
);

create index marketplace_accounts_tenant_idx
  on public.marketplace_accounts (tenant_id);

-- ---------------------------------------------------------------------------
-- 3. Anuncios (produto-mestre local x anuncio externo)
-- ---------------------------------------------------------------------------
create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  account_id uuid not null references public.marketplace_accounts (id) on delete cascade,
  item_id uuid not null references public.catalog_items (id) on delete cascade,
  -- preenchido pelo adaptador apos a publicacao real no canal
  external_id text,
  status text not null default 'pendente'
    check (status in ('pendente', 'publicado', 'erro', 'removido')),
  external_price numeric(12, 2),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- um anuncio por item por conta: o catalogo mestre e local, o canal e que
  -- recebe uma copia mapeada.
  unique (account_id, item_id)
);

create unique index marketplace_listings_externo_unico
  on public.marketplace_listings (account_id, external_id)
  where external_id is not null;

create index marketplace_listings_item_idx
  on public.marketplace_listings (item_id);

-- ---------------------------------------------------------------------------
-- 4. Fila de jobs
-- ---------------------------------------------------------------------------
create table public.marketplace_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  channel_id uuid not null references public.marketplace_channels (id),
  -- set null (nao cascade): apagar a conta preserva o historico da fila
  account_id uuid references public.marketplace_accounts (id) on delete set null,
  listing_id uuid references public.marketplace_listings (id) on delete set null,
  tipo text not null check (tipo in (
    'ping',              -- kernel: heartbeat local, sem rede
    'validar_item',      -- kernel: valida produto-mestre (sku/nome/preco)
    'publicar_item',     -- adaptador (M2)
    'atualizar_preco',   -- adaptador (M2)
    'atualizar_estoque', -- adaptador (M2)
    'puxar_pedidos',     -- adaptador (M2)
    'refresh_token',     -- adaptador (M2) - ciclo OAuth central
    'processar_webhook'  -- kernel grava, adaptador interpreta (M2)
  )),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'concluido', 'falhou')),
  attempts int not null default 0 check (attempts >= 0),
  max_attempts int not null default 5 check (max_attempts between 1 and 20),
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  result text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketplace_jobs_fila_idx
  on public.marketplace_jobs (status, next_run_at);

-- dedupe: enquanto existe job PENDENTE/PROCESSANDO com a mesma chave, o enqueue
-- devolve o job existente - clique duplo, webhook repetido e sync redundant nao
-- enchem a fila. Terminou (concluido/falhou) a chave libera para uma nova
-- execucao futura.
create unique index marketplace_jobs_dedupe_ativo
  on public.marketplace_jobs (tenant_id, dedupe_key)
  where dedupe_key is not null and status in ('pendente', 'processando');

-- ---------------------------------------------------------------------------
-- 5. Pedidos vindos dos canais
-- ---------------------------------------------------------------------------
create table public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  account_id uuid not null references public.marketplace_accounts (id) on delete cascade,
  channel_order_id text not null,
  status_externo text not null,
  status_local text not null default 'novo'
    check (status_local in ('novo', 'importado', 'ignorado')),
  -- null ate o adaptador importar/gerar o pedido interno
  order_id uuid references public.orders (id) on delete set null,
  -- minimizacao LGPD: so o nome exibido do comprador; endereco/doc ficam no
  -- payload bruto e sao sanitizados pelo adaptador antes de virar pedido.
  buyer_name text,
  total_amount numeric(12, 2),
  raw jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  -- puxar os pedidos de novo do mesmo canal nao duplica nada
  unique (account_id, channel_order_id)
);

create index marketplace_orders_tenant_idx
  on public.marketplace_orders (tenant_id, received_at desc);

-- ---------------------------------------------------------------------------
-- 6. Webhooks (intake idempotente)
-- ---------------------------------------------------------------------------
create table public.marketplace_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  channel_id uuid not null references public.marketplace_channels (id),
  event_id text not null,
  topic text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'recebido'
    check (status in ('recebido', 'processado', 'ignorado', 'erro')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  -- replay do marketplace = a MESMA linha, nao a segunda
  unique (channel_id, event_id)
);

create index marketplace_webhooks_tenant_idx
  on public.marketplace_webhooks (tenant_id, received_at desc);

-- ---------------------------------------------------------------------------
-- 7. RLS deny-all nas 6 tabelas (service_role le/escreve via server actions;
--    anon/authenticated nao veem nem uma linha - mesmo padrao do 0020)
-- ---------------------------------------------------------------------------
alter table public.marketplace_channels   enable row level security;
alter table public.marketplace_accounts   enable row level security;
alter table public.marketplace_listings   enable row level security;
alter table public.marketplace_jobs       enable row level security;
alter table public.marketplace_orders     enable row level security;
alter table public.marketplace_webhooks   enable row level security;

-- ---------------------------------------------------------------------------
-- 8. Semente dos 10 canais (7 generalistas + 3 nichados)
--    api_docs preenchido APENAS quando o endereco do portal e conhecido.
-- ---------------------------------------------------------------------------
insert into public.marketplace_channels (slug, name, segmento, api_docs) values
  ('mercado-livre',    'Mercado Livre',                          'generalista', 'https://developers.mercadolivre.com.br'),
  ('amazon-brasil',    'Amazon Brasil (SP-API)',                 'generalista', 'https://developer.sp-api.amazon.com'),
  ('shopee',           'Shopee',                                 'generalista', 'https://open.shopee.com'),
  ('magalu',           'Magazine Luiza',                         'generalista', 'https://developer.magazineluiza.com.br'),
  ('aliexpress',       'AliExpress (sellers locais)',            'generalista', 'https://open.aliexpress.com'),
  ('via-marketplace',  'Via Marketplace (Casas Bahia e Ponto)',  'generalista', null),
  ('shein',            'Shein (sellers locais)',                 'generalista', null),
  ('madeiramadeira',   'MadeiraMadeira',                         'nicho',       null),
  ('netshoes',         'Netshoes',                               'nicho',       null),
  ('dafiti',           'Dafiti',                                 'nicho',       null);

-- ---------------------------------------------------------------------------
-- 9. Funcoes da fila
-- ---------------------------------------------------------------------------
create or replace function public.marketplace_enqueue(
  p_tenant uuid,
  p_channel uuid,
  p_account uuid default null,
  p_listing uuid default null,
  p_tipo text default 'ping',
  p_payload jsonb default '{}'::jsonb,
  p_dedupe text default null,
  p_max_attempts int default 5
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- dedupe: job ativo com a mesma chave = devolve ele mesmo
  if p_dedupe is not null then
    select id into v_id
      from marketplace_jobs
     where tenant_id = p_tenant
       and dedupe_key = p_dedupe
       and status in ('pendente', 'processando');
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into marketplace_jobs
    (tenant_id, channel_id, account_id, listing_id, tipo, payload,
     dedupe_key, max_attempts)
  values
    (p_tenant, p_channel, p_account, p_listing, p_tipo,
     coalesce(p_payload, '{}'::jsonb), p_dedupe,
     greatest(1, least(p_max_attempts, 20)))
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.marketplace_claim(p_limit int default 10)
returns setof public.marketplace_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  with alvo as (
    select id
      from marketplace_jobs
     where status = 'pendente'
       and next_run_at <= now()
     order by next_run_at, created_at
     limit greatest(1, least(p_limit, 50))
       for update skip locked
  )
  update marketplace_jobs j
     set status = 'processando',
         attempts = j.attempts + 1,
         locked_at = now(),
         updated_at = now()
    from alvo
   where j.id = alvo.id
  returning j.*;
$$;

create or replace function public.marketplace_finish(
  p_job uuid,
  p_ok boolean,
  p_msg text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
begin
  select * into v from marketplace_jobs where id = p_job;
  if not found then
    return;
  end if;
  -- so o dono da execucao atual conclui (job que nao esta processando nao fecha)
  if v.status <> 'processando' then
    return;
  end if;

  if p_ok then
    update marketplace_jobs
       set status = 'concluido',
           result = left(coalesce(p_msg, 'ok'), 500),
           last_error = null,
           locked_at = null,
           updated_at = now()
     where id = p_job;
    return;
  end if;

  if v.attempts >= v.max_attempts then
    update marketplace_jobs
       set status = 'falhou',
           last_error = left(coalesce(p_msg, 'erro desconhecido'), 500),
           locked_at = null,
           updated_at = now()
     where id = p_job;
  else
    -- backoff exponencial 2^attempts segundos, cap 300s (5 min)
    update marketplace_jobs
       set status = 'pendente',
           last_error = left(coalesce(p_msg, 'erro desconhecido'), 500),
           locked_at = null,
           next_run_at = now() + (least(power(2, v.attempts), 300) * interval '1 second'),
           updated_at = now()
     where id = p_job;
  end if;
end $$;

create or replace function public.marketplace_reprocess(p_job uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update marketplace_jobs
     set status = 'pendente',
         attempts = 0,
         next_run_at = now(),
         locked_at = null,
         updated_at = now()
   where id = p_job
     and status = 'falhou';
  return found;
end $$;

-- So o service_role mexe na fila (as server actions usam o admin client).
revoke execute on function public.marketplace_enqueue(uuid, uuid, uuid, uuid, text, jsonb, text, int)
  from public, anon, authenticated;
revoke execute on function public.marketplace_claim(int)
  from public, anon, authenticated;
revoke execute on function public.marketplace_finish(uuid, boolean, text)
  from public, anon, authenticated;
revoke execute on function public.marketplace_reprocess(uuid)
  from public, anon, authenticated;

grant execute on function public.marketplace_enqueue(uuid, uuid, uuid, uuid, text, jsonb, text, int)
  to service_role;
grant execute on function public.marketplace_claim(int) to service_role;
grant execute on function public.marketplace_finish(uuid, boolean, text) to service_role;
grant execute on function public.marketplace_reprocess(uuid) to service_role;
