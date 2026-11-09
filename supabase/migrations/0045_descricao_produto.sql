-- 0045_descricao_produto.sql
-- Separa o texto de "Detalhes do Produto" (vem do fornecedor via import por
-- link, ou digitado a mao) das Observacoes internas (catalog_items.notes).
-- Antes, o importador do Reval jogava esse texto em notes por engano -
-- agora ganha coluna propria, usada tambem como fonte extra pro gerador de
-- descricao com IA (gerarDescricaoProduto) quando presente.

alter table catalog_items add column if not exists detalhes_produto text;

comment on column catalog_items.detalhes_produto is
  'Texto descritivo do produto (ex.: "Detalhes do Produto" do site do fornecedor, ou digitado a mao). Diferente de notes (observacoes internas) e de description (texto final da vitrine). Fonte extra para gerarDescricaoProduto quando preenchido.';
