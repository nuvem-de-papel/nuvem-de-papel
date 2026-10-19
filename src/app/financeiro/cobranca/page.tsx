import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import {
  ConsoleCobranca,
  type CobrancaLinha,
  type EnvioLinha,
  type ReguaPasso,
} from "@/components/financeiro/ConsoleCobranca";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cobrança automática — Nuvem de Papel",
  description: "Régua de lembretes de títulos a receber por e-mail.",
};

const TENANT = "00000000-0000-0000-0000-000000000001";

export default async function CobrancaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/financeiro/cobranca");

  const admin = createAdminClient();
  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const janelaInicio = iso(new Date(hoje.getTime() - 15 * 86400000));
  const janelaFim = iso(new Date(hoje.getTime() + 3 * 86400000));

  const [meuRes, reguasRes, parcelasRes, enviosRes] = await Promise.all([
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    admin
      .from("cobranca_reguas")
      .select("id, dias, canal, ativo, texto")
      .eq("tenant_id", TENANT)
      .order("dias", { ascending: true }),
    admin
      .from("financial_installments")
      .select(
        "id, due_date, principal_amount, paid_amount, status, title_id, titulo:financial_titles!inner(code, customer_id)"
      )
      .eq("tenant_id", TENANT)
      .eq("status", "aberto")
      .gte("due_date", janelaInicio)
      .lte("due_date", janelaFim)
      .order("due_date", { ascending: true })
      .limit(300),
    admin
      .from("cobranca_envios")
      .select(
        "id, canal, enviado_em, sucesso, erro, etapa_dias:cobranca_reguas(dias), installment_id"
      )
      .eq("tenant_id", TENANT)
      .order("enviado_em", { ascending: false })
      .limit(200),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const reguas: ReguaPasso[] = (reguasRes.data ?? []).map((r) => ({
    id: r.id,
    dias: r.dias,
    canal: r.canal as ReguaPasso["canal"],
    ativo: r.ativo,
    texto: r.texto,
  }));

  // clientes das parcelas (customer_id sem FK — join manual)
  const parcelas = parcelasRes.data ?? [];
  const idsClientes = [
    ...new Set(
      parcelas
        .map((p) => (p.titulo as unknown as { customer_id: string | null })?.customer_id)
        .filter(Boolean) as string[]
    ),
  ];
  const clientes = new Map<string, { name: string; email: string | null }>();
  if (idsClientes.length > 0) {
    const { data } = await admin
      .from("customers")
      .select("id, name, email")
      .in("id", idsClientes);
    for (const c of data ?? []) clientes.set(c.id, { name: c.name, email: c.email });
  }

  // último envio por parcela (para mostrar "etapa X enviada")
  const ultimoEnvio = new Map<string, { dias: number | null; sucesso: boolean }>();
  for (const e of enviosRes.data ?? []) {
    if (!ultimoEnvio.has(e.installment_id)) {
      ultimoEnvio.set(e.installment_id, {
        dias: (e.etapa_dias as unknown as { dias: number } | null)?.dias ?? null,
        sucesso: e.sucesso,
      });
    }
  }

  const linhas: CobrancaLinha[] = parcelas.map((p) => {
    const t = p.titulo as unknown as { code: string; customer_id: string | null };
    const cli = t.customer_id ? clientes.get(t.customer_id) : undefined;
    const venc = new Date(p.due_date + "T00:00:00");
    return {
      id: p.id,
      codigo: t.code,
      cliente: cli?.name ?? "—",
      email: cli?.email ?? null,
      valor: Number(p.principal_amount) - Number(p.paid_amount),
      vencimento: String(p.due_date).slice(0, 10),
      diasAtraso: Math.floor((hoje.getTime() - venc.getTime()) / 86400000),
      ultimaEtapa: ultimoEnvio.get(p.id)?.dias ?? null,
      ultimoSucesso: ultimoEnvio.get(p.id)?.sucesso ?? null,
    };
  });

  const envios: EnvioLinha[] = (enviosRes.data ?? []).map((e) => ({
    id: e.id,
    canal: e.canal as EnvioLinha["canal"],
    enviadoEm: e.enviado_em,
    sucesso: e.sucesso,
    erro: e.erro,
    etapaDias: (e.etapa_dias as unknown as { dias: number } | null)?.dias ?? null,
  }));

  return <ConsoleCobranca linhas={linhas} reguas={reguas} envios={envios} />;
}
