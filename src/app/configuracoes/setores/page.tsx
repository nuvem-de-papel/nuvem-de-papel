import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsoleSetores, type GrupoTela, type SetorTela } from "@/components/catalogo/ConsoleSetores";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { tituloGrupo } from "@/lib/gruposSetores";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configurações - Setores e menu - Nuvem de Papel",
};

export default async function SetoresPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/configuracoes/setores");
  const { data: profile } = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "ativo" || !PAPEIS_GESTAO.includes(profile.role)) redirect("/crm");

  const admin = createAdminClient();
  const t = NUVEM_DE_PAPEL_TENANT_ID;
  const [{ data: grupos }, { data: mapa }, { data: itens }] = await Promise.all([
    admin.from("catalog_grupos").select("id, slug, nome, icone, ordem, na_barra, ativo").eq("tenant_id", t).order("ordem"),
    admin.from("catalog_setores").select("nome, grupo_id").eq("tenant_id", t),
    admin.from("catalog_items").select("category, active").eq("tenant_id", t).limit(10000),
  ]);

  // contagem por setor (todos e ativos) a partir do proprio catalogo
  const cont = new Map<string, { total: number; ativos: number }>();
  for (const i of itens ?? []) {
    const nome = (i.category ?? "").trim();
    if (!nome) continue;
    const c = cont.get(nome) ?? { total: 0, ativos: 0 };
    c.total++;
    if (i.active) c.ativos++;
    cont.set(nome, c);
  }
  const grupoDe = new Map((mapa ?? []).map((m) => [m.nome, m.grupo_id as string]));
  const nomes = new Set<string>([...cont.keys(), ...grupoDe.keys()]);
  const setores: SetorTela[] = [...nomes]
    .map((nome) => ({ nome, grupoId: grupoDe.get(nome) ?? null, ...(cont.get(nome) ?? { total: 0, ativos: 0 }) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const lista: GrupoTela[] = (grupos ?? []).map((g) => {
    const doGrupo = setores.filter((s) => s.grupoId === g.id);
    return {
      id: g.id,
      slug: g.slug,
      titulo: tituloGrupo(g.nome),
      icone: g.icone,
      naBarra: !!g.na_barra,
      ativo: g.ativo,
      ativos: doGrupo.reduce((s, x) => s + x.ativos, 0),
    };
  });

  return <ConsoleSetores grupos={lista} setores={setores} />;
}
