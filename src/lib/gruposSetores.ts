// Grupos de setores (0057 - 18/11/2026): o catalogo fica em dois niveis,
// GRUPO (catalog_grupos, 9, com icone) > SETOR (= catalog_items.category).
// catalog_setores diz a qual grupo cada setor pertence; setor fora dele
// (ex.: setor novo digitado no cadastro) aparece como "Sem grupo".
//
// Os icones sao SVG em linha fina (estilo Lucide, sem biblioteca instalada),
// desenhados no artefato aprovado pelo Joaquim. A chave fica no banco
// (catalog_grupos.icone); trocar o desenho = editar ICONES_GRUPO.
import type { SupabaseClient } from "@supabase/supabase-js";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

export type GrupoCatalogo = {
  id: string;
  slug: string;
  nome: string;
  icone: string;
  ordem: number;
  /** Setores do grupo, na ordem de catalog_setores.ordem. */
  setores: string[];
};

export const SEM_GRUPO = "Sem grupo";

// viewBox 0 0 24 24, sem preenchimento, traco = currentColor.
export const ICONES_GRUPO: Record<string, string> = {
  caderno: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M3 7h4M3 12h4M3 17h4"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h3M8 17h6"/>',
  lapis: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  paleta:
    '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/>',
  mochila:
    '<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M8 10h8M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  maleta: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  presente:
    '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  livro:
    '<path d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  estrela: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};

const MINUSCULAS = new Set(["e", "de", "da", "do", "das", "dos"]);

/** "PAPÉIS E AGENDAS" -> "Papéis e Agendas" (o banco guarda em maiusculas). */
export function tituloGrupo(nome: string): string {
  return nome
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join(" ");
}

type LinhaGrupo = {
  id: string;
  slug: string;
  nome: string;
  icone: string;
  ordem: number;
  catalog_setores: { nome: string; ordem: number }[] | null;
};

/**
 * Grupos ativos com os setores de cada um, na ordem do menu. Falha = lista
 * vazia (a tela cai em "Sem grupo", nunca quebra).
 */
export async function carregarGrupos(supabase: SupabaseClient): Promise<GrupoCatalogo[]> {
  const { data, error } = await supabase
    .from("catalog_grupos")
    .select("id, slug, nome, icone, ordem, catalog_setores(nome, ordem)")
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .returns<LinhaGrupo[]>();
  if (error) {
    console.error("carregarGrupos:", error.message);
    return [];
  }
  return (data ?? []).map((g) => ({
    id: g.id,
    slug: g.slug,
    nome: g.nome,
    icone: g.icone,
    ordem: g.ordem,
    setores: [...(g.catalog_setores ?? [])].sort((a, b) => a.ordem - b.ordem).map((s) => s.nome),
  }));
}

/** setor -> grupo (para achar o grupo de um produto pelo category). */
export function mapaSetorGrupo(grupos: GrupoCatalogo[]): Map<string, GrupoCatalogo> {
  const mapa = new Map<string, GrupoCatalogo>();
  for (const g of grupos) for (const s of g.setores) mapa.set(s, g);
  return mapa;
}
