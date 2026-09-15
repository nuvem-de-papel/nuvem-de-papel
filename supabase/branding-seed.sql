-- branding-seed.sql — colar no SQL Editor do Supabase (projeto STAGING,
-- wvdvyglbunsquauxdqxj), depois que a migration 0001 já estiver aplicada.
-- Tokens extraídos do DesignSystem.dc.html já aprovado.

insert into tenant_branding (tenant_id, branding_tokens)
values (
  '00000000-0000-0000-0000-000000000001',
  '{
    "palette": {
      "bg_cotton": "#FFFDFB",
      "bg_cloud": "#F8F6FE",
      "blue_100": "#DCEEF7", "blue_300": "#A8D4E8", "blue_600": "#5FA8C7",
      "pink_100": "#FBE4ED", "pink_300": "#F2B8CE", "pink_600": "#E084AC",
      "lilac_100": "#ECE6FB", "lilac_300": "#CBB8F0", "lilac_600": "#9B7FDE",
      "ink": "#4A4256", "ink_soft": "#8A8296", "ink_faint": "#C9C2D4", "ink_2": "#3A3346",
      "white": "#FFFFFF"
    },
    "typography": {
      "display": {"family": "Sniglet", "weight": 800, "usage": "titulos, headlines, precos, numeros do CRM"},
      "body": {"family": "Quicksand", "weights": [400, 500, 600, 700], "usage": "menus, paragrafos, botoes, formularios"}
    },
    "radius": { "card": 24, "pill": 999, "category_card": 28 },
    "shadow": {
      "soft": "0 10px 28px rgba(155,127,222,0.16)",
      "card": "0 4px 16px rgba(155,127,222,0.10)"
    },
    "cta_primary_token": "pink_600",
    "cta_secondary_token": "lilac_600",
    "admin_bg_token": "ink_2"
  }'::jsonb
)
on conflict (tenant_id) do update
  set branding_tokens = excluded.branding_tokens,
      updated_at = now();
