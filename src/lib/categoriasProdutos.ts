// Grupos da loja (0057 - 18/11/2026). A vitrine passou dos 7 setores fixos
// por regex para os GRUPOS do banco (catalog_grupos > catalog_setores >
// catalog_items.category). Usado pela home (Hero, "Navegue por categoria",
// carrosseis por grupo), por /produtos (secoes + menu "Todas as Categorias")
// e pelo "Combina com" da pagina do produto.
//
// Grupo sem produto ativo nao aparece. Produto cujo setor ainda nao foi
// mapeado num grupo (setor novo digitado no cadastro, fixtures E2E) cai na
// secao "Outros", no fim, fora do menu de grupos.
//
// Aqui fica so o VISUAL de cada grupo (cor de fundo, cor do titulo,
// descricao), por slug. Grupo novo no banco sem visual aqui usa o padrao.
import type { VarejoProduct } from "@/lib/products";
import { tituloGrupo, type GrupoCatalogo } from "@/lib/gruposSetores";

export const SLUG_OUTROS = "outros";

type VisualGrupo = { cor: string; corTitulo: string; descricao: string };

const VISUAL_PADRAO: VisualGrupo = {
  cor: "#E9761C",
  corTitulo: "#100D0D",
  descricao: "Mais itens da papelaria para o dia a dia",
};

const VISUAL: Record<string, VisualGrupo> = {
  cadernos: { cor: "#0CCAFD", corTitulo: "#006BE1", descricao: "Cadernos inteligentes, espirais, brochuras, fichários e planners" },
  "papeis-e-agendas": { cor: "#24F1FC", corTitulo: "#100D0D", descricao: "Agendas, blocos, post-its e papéis para organizar a rotina" },
  "lapis-e-canetas": { cor: "#006BE1", corTitulo: "#E9761C", descricao: "Canetas, lápis, marca-textos e borrachas para escrever e decorar" },
  "arte-e-pintura": { cor: "#FC99D3", corTitulo: "#006BE1", descricao: "Tintas, pincéis e materiais para colorir e criar" },
  "material-escolar": { cor: "#FECD01", corTitulo: "#100D0D", descricao: "Estojos, mochilas, réguas e tudo para o ano letivo" },
  "escritorio-e-organizacao": { cor: "#03BF01", corTitulo: "#E9761C", descricao: "Organizadores, pastas e acessórios para a mesa de trabalho" },
  "adesivos-e-presentes": { cor: "#FC99D3", corTitulo: "#100D0D", descricao: "Adesivos, chaveiros e mimos fofos para presentear" },
  "infantil-e-livros": { cor: "#24F1FC", corTitulo: "#006BE1", descricao: "Livros, brinquedos e atividades para os pequenos" },
  "datas-comemorativas": { cor: "#E9761C", corTitulo: "#100D0D", descricao: "Natal, Páscoa e itens de época" },
};

export type GrupoSetor = {
  slug: string;
  title: string;
  icone: string;
  cor: string;
  corTitulo: string;
  descricao: string;
  items: VarejoProduct[];
};

const chave = (s: string) => s.trim().toLocaleUpperCase("pt-BR");

/**
 * Produtos da vitrine por grupo, na ordem do menu. So grupos com produto;
 * "Outros" (setor sem grupo) por ultimo e so se tiver item.
 */
export function agruparPorGrupo(produtos: VarejoProduct[], grupos: GrupoCatalogo[]): GrupoSetor[] {
  const saida: GrupoSetor[] = grupos.map((g) => {
    const v = VISUAL[g.slug] ?? VISUAL_PADRAO;
    return { slug: g.slug, title: tituloGrupo(g.nome), icone: g.icone, cor: v.cor, corTitulo: v.corTitulo, descricao: v.descricao, items: [] };
  });
  const outros: GrupoSetor = { slug: SLUG_OUTROS, title: "Outros", icone: "menu", ...VISUAL_PADRAO, items: [] };

  const indice = new Map<string, number>();
  grupos.forEach((g, i) => g.setores.forEach((s) => indice.set(chave(s), i)));

  for (const p of produtos) {
    const i = p.category ? indice.get(chave(p.category)) : undefined;
    (i === undefined ? outros : saida[i]).items.push(p);
  }
  return [...saida, outros].filter((g) => g.items.length > 0);
}

/** Grupos que entram no menu "Todas as Categorias" (sem "Outros"). */
export function gruposDoMenu(grupos: GrupoSetor[]): GrupoSetor[] {
  return grupos.filter((g) => g.slug !== SLUG_OUTROS);
}
