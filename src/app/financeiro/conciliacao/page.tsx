import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import {
  ConsoleConciliacao,
  type CandidatoConciliacao,
  type ExtratoResumo,
  type LinhaExtrato,
} from "@/components/financeiro/ConsoleConciliacao";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conciliação bancária — Nuvem de Papel",
  description: "Importação de extrato (OFX/CSV) e conciliação linha a linha.",
};

export default async function ConciliacaoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/financeiro/conciliacao");

  const admin = createAdminClient();
  const limiteCandidatos = new Date(Date.now() - 200 * 86400000).toISOString();
  const [meuRes, linhasRes, extratosRes, liqRes, despRes] = await Promise.all([
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    admin
      .from("bank_linhas")
      .select("id, data, descricao, valor, status, ref_tipo, ref_id")
      .eq("tenant_id", "00000000-0000-0000-0000-000000000001")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("bank_extratos")
      .select("id, fonte, arquivo_nome, competencia, linhas_total, linhas_novas, created_at")
      .eq("tenant_id", "00000000-0000-0000-0000-000000000001")
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("financial_settlements")
      .select(
        "id, amount, method, type, created_at, parcela:financial_installments!inner(number, titulo:financial_titles!inner(code, direction))"
      )
      .eq("tenant_id", "00000000-0000-0000-0000-000000000001")
      .eq("type", "liquidacao")
      .neq("method", "dinheiro")
      .gte("created_at", limiteCandidatos)
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("expenses")
      .select("id, description, amount, paid_at")
      .eq("tenant_id", "00000000-0000-0000-0000-000000000001")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(300),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const linhas: LinhaExtrato[] = (linhasRes.data ?? []).map((l) => ({
    id: l.id,
    data: String(l.data).slice(0, 10),
    descricao: l.descricao,
    valor: Number(l.valor),
    status: l.status as LinhaExtrato["status"],
    refTipo: (l.ref_tipo as LinhaExtrato["refTipo"]) ?? null,
    refId: l.ref_id ?? null,
  }));

  const extratos: ExtratoResumo[] = (extratosRes.data ?? []).map((e) => ({
    id: e.id,
    fonte: e.fonte,
    arquivoNome: e.arquivo_nome,
    competencia: String(e.competencia).slice(0, 10),
    linhasTotal: Number(e.linhas_total),
    linhasNovas: Number(e.linhas_novas),
    criadoEm: e.created_at,
  }));

  // candidatos = dinheiro que já se moveu fora do caixa físico:
  // liquidações (exceto dinheiro, que é gaveta) e despesas pagas.
  // Os embeds PostgREST vêm como objeto (to-one); a tipagem infere lista em
  // alguns casos — serve para os dois com o cast abaixo.
  type EmbTitulo = { code?: string; direction?: string };
  type EmbParcela = { number?: number; titulo?: EmbTitulo | EmbTitulo[] } | null;

  const candidatos: CandidatoConciliacao[] = [];
  for (const l of liqRes.data ?? []) {
    const parcela = (Array.isArray(l.parcela) ? l.parcela[0] : l.parcela) as EmbParcela;
    const tituloBruto = parcela?.titulo ?? null;
    const titulo = (Array.isArray(tituloBruto) ? tituloBruto[0] : tituloBruto) as EmbTitulo | null;
    const dir = String(titulo?.direction ?? "receivable");
    const numero = parcela?.number ?? "";
    const codigo = titulo?.code ?? "";
    candidatos.push({
      ref: `liquidacao:${l.id}`,
      tipo: "liquidacao",
      data: String(l.created_at).slice(0, 10),
      descricao: `Liquidação ${codigo}/${numero} — ${l.method}`,
      valor: dir === "receivable" ? Number(l.amount) : -Number(l.amount),
    });
  }
  for (const d of despRes.data ?? []) {
    candidatos.push({
      ref: `despesa:${d.id}`,
      tipo: "despesa",
      data: String(d.paid_at).slice(0, 10),
      descricao: `Despesa — ${d.description}`,
      valor: -Number(d.amount),
    });
  }
  candidatos.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));

  return <ConsoleConciliacao linhas={linhas} candidatos={candidatos} extratos={extratos} />;
}
