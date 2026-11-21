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

// 21/11/2026 (pedido do Joaquim): UMA cor por grupo, sem repetir. O titulo,
// o icone, as setas e o vidro do carrossel usam essa mesma cor (corTitulo =
// cor). Tons escuros o bastante para o titulo ser lido sobre o vidro claro.
const VISUAL_PADRAO: VisualGrupo = {
  cor: "#5A6B7B",
  corTitulo: "#5A6B7B",
  descricao: "Mais itens da papelaria para o dia a dia",
};

const visual = (cor: string, descricao: string): VisualGrupo => ({ cor, corTitulo: cor, descricao });

const VISUAL: Record<string, VisualGrupo> = {
  cadernos: visual("#006BE1", "Cadernos inteligentes, espirais, brochuras, fichários e planners"),
  "papeis-e-agendas": visual("#00939E", "Agendas, blocos, post-its e papéis para organizar a rotina"),
  "lapis-e-canetas": visual("#E9761C", "Canetas, lápis, marca-textos e borrachas para escrever e decorar"),
  "arte-e-pintura": visual("#D6338A", "Tintas, pincéis e materiais para colorir e criar"),
  "material-escolar": visual("#B88A00", "Estojos, mochilas, réguas e tudo para o ano letivo"),
  "escritorio-e-organizacao": visual("#1E9E2E", "Organizadores, pastas e acessórios para a mesa de trabalho"),
  "adesivos-e-presentes": visual("#8A4FD8", "Adesivos, chaveiros e mimos fofos para presentear"),
  "infantil-e-livros": visual("#E5484D", "Livros, brinquedos e atividades para os pequenos"),
  "datas-comemorativas": visual("#100D0D", "Natal, Páscoa e itens de época"),
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
