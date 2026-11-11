// Fonte unica dos setores da loja: usado pelo CategoryShowcase (home,
// "Navegue por Categoria") e pela pagina /produtos (secoes fixas, uma por
// setor). Clicar num icone da home leva pra /produtos#<slug> e aterrissa
// direto na secao correspondente.
//
// 2026-11-10: trocado de 6 categorias por PALAVRA-CHAVE do nome do produto
// (regra antiga, pre-migracao) pros 7 SETORES REAIS do catalogo migrado
// (catalog_items.category), que o cadastro ja usa 1:1 (ADESIVOS, BORRACHAS,
// CADERNOS, CANETAS, MARCADORES, ORGANIZADORES, POST-IT). Produto que caia
// fora dos 7 (erro de digitacao futuro) cai no ultimo grupo (catch-all),
// mesmo padrao de antes - ver groupProducts em app/produtos/page.tsx.
//
// fotoId = ID de foto no Pexels (licenca livre), usado só pro icone redondo
// da home. ADESIVOS/BORRACHAS/MARCADORES/POST-IT ainda usam foto EMPRESTADA
// de outro setor (placeholder) - pedir pro Joaquim escolher a foto definitiva
// de cada um quando quiser.
import type { VarejoProduct } from "@/lib/products";

export type CategoriaProduto = {
  slug: string;
  titulo: string;
  // cor do fundo do setor (paleta) e cor do titulo (diferente do fundo)
  cor: string;
  corTitulo: string;
  descricao: string;
  fotoId: number;
  // regex testada contra catalog_items.category (lowercase) - match EXATO
  // com o setor real, nao mais palavra-chave do nome do produto.
  match: RegExp;
};

export const CATEGORIAS_PRODUTOS: CategoriaProduto[] = [
  {
    slug: "cadernos",
    cor: "#0CCAFD",
    corTitulo: "#006BE1",
    titulo: "Cadernos",
    descricao: "Cadernos criativos, inteligentes e com folhas decoradas para transformar sua rotina",
    fotoId: 7054755,
    match: /^cadernos$/,
  },
  {
    slug: "organizadores",
    cor: "#24F1FC",
    corTitulo: "#100D0D",
    titulo: "Organizadores",
    descricao: "Agendas, planners, pastas e acessórios para uma rotina prática e organizada",
    fotoId: 30101194,
    match: /^organizadores$/,
  },
  {
    slug: "canetas",
    cor: "#006BE1",
    corTitulo: "#E9761C",
    titulo: "Canetas",
    descricao: "Canetas criativas, coloridas e fofas para escrever, decorar e presentear",
    fotoId: 6969285,
    match: /^canetas$/,
  },
  {
    slug: "adesivos",
    cor: "#FC99D3",
    corTitulo: "#006BE1",
    titulo: "Adesivos",
    // placeholder: foto emprestada de "presentes e colecoes" (28503362) ate
    // escolher a foto definitiva deste setor.
    descricao: "Adesivos e stickers fofos para decorar cadernos, agendas e muito mais",
    fotoId: 28503362,
    match: /^adesivos$/,
  },
  {
    slug: "borrachas",
    cor: "#FECD01",
    corTitulo: "#100D0D",
    titulo: "Borrachas",
    // placeholder: foto emprestada de "lápis e lapiseiras" (6192765) ate
    // escolher a foto definitiva deste setor.
    descricao: "Borrachas fofas e divertidas para apagar sem estragar a folha",
    fotoId: 6192765,
    match: /^borrachas$/,
  },
  {
    slug: "marcadores",
    cor: "#03BF01",
    corTitulo: "#E9761C",
    titulo: "Marcadores",
    // placeholder: foto emprestada de "estojos e nécessaires" (6193741) ate
    // escolher a foto definitiva deste setor.
    descricao: "Marca-textos e marcadores coloridos para destacar o que importa",
    fotoId: 6193741,
    match: /^marcadores$/,
  },
  {
    slug: "post-it",
    cor: "#E9761C",
    corTitulo: "#100D0D",
    titulo: "Post-it",
    // placeholder: mesma foto de "adesivos" (28503362) ate escolher a foto
    // definitiva deste setor. Tambem funciona como catch-all (ultimo grupo).
    descricao: "Blocos de notas adesivas para lembretes, recados e organização rápida",
    fotoId: 28503362,
    match: /^post-it$/,
  },
];

// Agrupa produtos pelos setores fixos (CATEGORIAS_PRODUTOS). Usado por
// /produtos e pela home. Produto fora dos setores cai no ultimo grupo.
export type GrupoSetor = { slug: string; title: string; cor: string; corTitulo: string; items: VarejoProduct[] };

export function agruparPorSetor(produtos: VarejoProduct[]): GrupoSetor[] {
  const grupos: GrupoSetor[] = CATEGORIAS_PRODUTOS.map((c) => ({ slug: c.slug, title: c.titulo, cor: c.cor, corTitulo: c.corTitulo, items: [] }));
  const catchAllIdx = grupos.length - 1;
  for (const p of produtos) {
    const key = (p.category ?? "").toLowerCase();
    const idx = CATEGORIAS_PRODUTOS.findIndex((c) => c.match.test(key));
    grupos[idx >= 0 ? idx : catchAllIdx].items.push(p);
  }
  return grupos;
}
