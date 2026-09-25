-- branding-seed.sql — colar no SQL Editor do Supabase (staging =
-- urlfwxeflxpdmmxkuuur), depois que a migration 0001 já estiver aplicada.
-- REBRAND 2026-09-23: identidade corporativa — "fofo" removido do projeto
-- por decisão do cliente. Chaves do JSON mantidas (pink_*/lilac_*/blue_* etc.)
-- por compatibilidade com src/lib/branding.ts e todos os componentes que já
-- consomem var(--pink-600) etc. — só o VALOR de cada tom mudou de sentido.

insert into tenant_branding (tenant_id, branding_tokens)
values (
  '00000000-0000-0000-0000-000000000001',
  '{
    "palette": {
      "bg_cotton": "#1E1A29",
      "bg_cloud": "#252131",
      "blue_100": "rgba(180,212,204,0.16)", "blue_300": "#8FC9B8", "blue_600": "#B4D4CC",
      "pink_100": "rgba(226,187,233,0.15)", "pink_300": "#C79ED1", "pink_600": "#E2BBE9",
      "lilac_100": "rgba(246,194,167,0.15)", "lilac_300": "#E0A688", "lilac_600": "#F6C2A7",
      "ink": "#EAE6F2", "ink_soft": "#AFA7BC", "ink_faint": "#2C2638", "ink_2": "#171420",
      "white": "#FFFFFF", "on_accent": "#1E1A29"
    },
    "typography": {
      "display": {"family": "Montserrat", "weight": 700, "usage": "titulos, headlines, precos, numeros do CRM"},
      "body": {"family": "Open Sans", "weights": [400, 500, 600, 700], "usage": "menus, paragrafos, botoes, formularios"}
    },
    "radius": { "card": 20, "control": 999, "chip": 999 },
    "shadow": {
      "soft": "0 20px 45px rgba(0,0,0,0.35)",
      "card": "0 10px 24px rgba(0,0,0,0.30)"
    },
    "cta_primary_token": "pink_600",
    "cta_secondary_token": "lilac_600",
    "admin_bg_token": "ink_2"
  }'::jsonb
)
on conflict (tenant_id) do update
  set branding_tokens = excluded.branding_tokens,
      updated_at = now();
