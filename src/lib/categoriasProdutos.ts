// Fonte unica das 6 categorias fixas da loja (pedido do Joaquim, 09/11/2026):
// usado pelo CategoryShowcase (home, "Navegue por Categoria") e pela pagina
// /produtos (secoes fixas, uma por categoria). Clicar num icone da home leva
// pra /produtos#<slug> e aterrissa direto na secao correspondente.
export type CategoriaProduto = {
  slug: string;
  titulo: string;
  descricao: string;
  fotoId: number;
  // regex testada contra catalog_items.category (lowercase); a 1a que bater
  // decide o grupo. "Presentes e Colecoes" fica por ultimo e funciona como
  // catch-all pra produto sem categoria batendo em nenhuma das outras 5.
  match: RegExp;
};

export const CATEGORIAS_PRODUTOS: CategoriaProduto[] = [
  {
    slug: "cadernos",
    titulo: "Cadernos",
    descricao: "Cadernos criativos, inteligentes e com folhas decoradas para transformar sua rotina",
    fotoId: 7054755,
    match: /caderno|fichari|bloco|bloqu/,
  },
  {
    slug: "organizacao",
    titulo: "Organização",
    descricao: "Organização com charme: agendas, blocos e acessórios para uma rotina prática e criativa",
    fotoId: 30101194,
    match: /organiza|agenda|planner|clipe|etiqueta|marcador de p[aá]gina|pasta/,
  },
  {
    slug: "lapis-e-lapiseiras",
    titulo: "Lápis e Lapiseiras",
    descricao: "Lápis e lapiseiras criativas para escrever, destacar e presentear",
    fotoId: 6192765,
    match: /l[áa]pis|lapiseira/,
  },
  {
    slug: "canetas",
    titulo: "Canetas",
    descricao: "Canetas criativas, coloridas e fofas para escrever, decorar e presentear",
    fotoId: 6969285,
    match: /caneta|marca-?texto|highlighter/,
  },
  {
    slug: "estojos-e-necessaires",
    titulo: "Estojos e Nécessaires",
    descricao: "Estojos e nécessaires criativos para organizar com charme e personalidade",
    fotoId: 6193741,
    match: /estojo|n[eé]cessaire/,
  },
  {
    slug: "presentes-e-colecoes",
    titulo: "Presentes e Coleções",
    descricao: "Itens especiais de papelaria e presentes para inspirar sua rotina",
    fotoId: 28503362,
    match: /presente|cole[çc][ãa]o|kit|especial|adesiv|artesan/,
  },
];
