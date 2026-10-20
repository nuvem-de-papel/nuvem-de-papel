-- 0038_catalog_description.sql - descrição de produto com IA (entrega 5).
--
-- Contexto (regra 19/10/2026 - staging primeiro):
--   * escopo acordado com o cliente: IA (Gemini) gera a descrição dos produtos
--     do catálogo EXISTENTE (catalog_items), o dono aprova/edita e salva, e ela
--     aparece na vitrine. Sem WhatsApp (fica pra fase 2, precisa da API da Meta).
--   * catalog_items nao tinha campo de descrição — só name/category/fabricante/
--     notes. `notes` é anotação interna; cria-se `description` público.
--
-- Coluna:
--   * catalog_items.description (text, nullable) - descrição pública exibida
--     na vitrine. Gerada pela IA (rota server action) mas SALVA só após
--     aprovação do dono (a IA nunca grava direto).
-- RLS nao muda: a vitrine e o painel ja leem catalog_items com as politicas
-- existentes; a coluna nova herda o mesmo acesso.

begin;

alter table catalog_items add column if not exists description text;

commit;
