-- 0032_catalog_items_foto_url.sql - foto do produto (Bloco 2, follow-up).
--
-- Contexto (regra 15/10/2026 - staging primeiro):
--   * o importador por link ja extraia a URL da foto do Reval, mas o cadastro
--     de produto NAO tinha onde guarda-la - o unico foto_url que existia era o
--     do CLIENTE (migration 0029, em customers);
--   * a vitrine usava so a foto ilustrativa por categoria (src
--     components/ProductImage.tsx:13) - o cliente final nunca via a foto real
--     do produto;
--   * o Reval serve a foto principal em /imagem/produtos/{g|m|pp}/{codigo}
--     [sufixo].jpg ("g" = 1200px, "m" = media, "pp" = miniatura de 54px).
--
-- Decisao: guarda a URL como text (nao o arquivo) - nao existe upload de
-- imagem no cadastro, e a URL do fornecedor ja aponta pra imagem servida.
-- catalog_items fica com uma coluna a mais (mesma formula da 0031).

begin;

alter table catalog_items
  add column if not exists foto_url text;

-- valida so o formato: https + caminho de imagem conhecido do Reval. Nao
-- exige host fixo (o fornecedor pode mudar de dominio), so o esquema e o
-- caminho - evita gravar link de pagina ou javascript:.
alter table catalog_items drop constraint if exists catalog_items_foto_url_check;
alter table catalog_items add constraint catalog_items_foto_url_check
  check (
    foto_url is null
    or (foto_url ~ '^https://'
        and foto_url ~* '\.(jpg|jpeg|png|webp)(\?|$)')
  );

commit;
