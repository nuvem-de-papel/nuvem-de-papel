// Motor da régua de cobrança automática (0035). Roda por server action
// (disparo manual do painel) ou pela cron route /api/cron/cobranca. Para
// cada parcela em aberto, acha a etapa da régua cujo dia já chegou e que
// ainda não foi enviada — e manda SÓ a mais recente (nunca três atrasadas
// de uma vez). Idempotência: unique (installment_id, regua_id, canal) em
// cobranca_envios. Para sozinha quando a parcela é liquidada (financial_settle).
// WhatsApp fica para a etapa 2 — por enquanto só email via Resend.

import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { enviarEmail } from "@/lib/email";

export type ResumoRegua = {
  ok: boolean;
  avaliadas: number;
  enviadas: number;
  falhas: number;
  puladasSemEmail: number;
  detalhe: string[];
};

type Regua = { id: string; dias: number; canal: string; ativo: boolean; texto: string };

const EMPRESA = "Nuvem de Papel";

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function diasEntre(hoje: Date, vencimentoISO: string): number {
  const venc = new Date(vencimentoISO + "T00:00:00");
  return Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
}

// preenche {nome} {empresa} {descricao} {valor} {vencimento} {link}
function preencher(
  texto: string,
  vars: Record<string, string>
): string {
  return texto.replace(/\{(\w+)\}/g, (_m, chave: string) => vars[chave] ?? "");
}

function montarHtml(corpo: string): string {
  const linhas = escaparHtml(corpo).replace(/\n/g, "<br>");
  return (
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#2D2A32">' +
    `<p>${linhas}</p>` +
    '<p style="color:#8A8296;font-size:12px;margin-top:24px">' +
    `${EMPRESA} — esta é uma mensagem automática. Para falar com uma pessoa, responda este e-mail.</p>` +
    "</div>"
  );
}

export async function executarReguaCobranca(): Promise<ResumoRegua> {
  const admin = createAdminClient();
  const tenantId = NUVEM_DE_PAPEL_TENANT_ID;
  const hoje = new Date();

  const resumo: ResumoRegua = {
    ok: true,
    avaliadas: 0,
    enviadas: 0,
    falhas: 0,
    puladasSemEmail: 0,
    detalhe: [],
  };

  // 1. régua ativa
  const { data: regras, error: erroRegras } = await admin
    .from("cobranca_reguas")
    .select("id, dias, canal, ativo, texto")
    .eq("tenant_id", tenantId)
    .eq("ativo", true)
    .order("dias", { ascending: true });

  if (erroRegras) {
    return { ...resumo, ok: false, detalhe: [`regua: ${erroRegras.message}`] };
  }
  const reguas: Regua[] = regras ?? [];
  if (reguas.length === 0) {
    return { ...resumo, detalhe: ["regua vazia - nada a fazer"] };
  }

  // 2. parcelas em aberto com título e cliente (join manual: customer_id sem FK)
  const { data: parcelas, error: erroParcelas } = await admin
    .from("financial_installments")
    .select(
      `id, due_date, principal_amount, paid_amount, title_id,
       financial_titles!inner(code, customer_id, status)`
    )
    .eq("tenant_id", tenantId)
    .eq("status", "aberto");

  if (erroParcelas) {
    return { ...resumo, ok: false, detalhe: [`parcelas: ${erroParcelas.message}`] };
  }

  const linhas = (parcelas ?? []) as unknown as {
    id: string;
    due_date: string;
    principal_amount: number;
    paid_amount: number;
    title_id: string;
    financial_titles: { code: string; customer_id: string | null; status: string };
  }[];

  // 3. carrega clientes citados (para email/nome)
  const idsClientes = [
    ...new Set(linhas.map((l) => l.financial_titles.customer_id).filter(Boolean) as string[]),
  ];
  let clientes = new Map<string, { name: string; email: string | null }>();
  if (idsClientes.length > 0) {
    const { data } = await admin
      .from("customers")
      .select("id, name, email")
      .in("id", idsClientes);
    clientes = new Map(
      (data ?? []).map((c) => [c.id, { name: c.name, email: c.email }])
    );
  }

  // 4. envios já existentes (para só mandar a etapa mais recente que falta)
  const idsParcelas = linhas.map((l) => l.id);
  let enviados = new Set<string>();
  if (idsParcelas.length > 0) {
    const { data } = await admin
      .from("cobranca_envios")
      .select("installment_id, regua_id, canal")
      .in("installment_id", idsParcelas)
      .eq("canal", "email");
    enviados = new Set(
      (data ?? []).map((e) => `${e.installment_id}|${e.regua_id}`)
    );
  }

  // 5. para cada parcela, decide a etapa e manda
  for (const l of linhas) {
    resumo.avaliadas++;
    const dias = diasEntre(hoje, l.due_date);

    // etapas cujo dia já chegou e que ainda NÃO foram enviadas
    const candidatas = reguas.filter(
      (r) => r.dias <= dias && !enviados.has(`${l.id}|${r.id}`)
    );
    if (candidatas.length === 0) continue;

    // só a mais recente (maior dias = mais perto do vencimento/pós)
    const etapa = candidatas.reduce((a, b) => (b.dias > a.dias ? b : a));

    const cliente = l.financial_titles.customer_id
      ? clientes.get(l.financial_titles.customer_id)
      : undefined;
    if (!cliente?.email) {
      resumo.puladasSemEmail++;
      resumo.detalhe.push(`${l.financial_titles.code}: sem email do cliente`);
      continue;
    }

    const saldo = Number(l.principal_amount) - Number(l.paid_amount);
    const vars = {
      nome: cliente.name || "cliente",
      empresa: EMPRESA,
      descricao: `referente ao documento ${l.financial_titles.code}`,
      valor: brl(saldo),
      vencimento: new Date(l.due_date + "T00:00:00").toLocaleDateString("pt-BR"),
      link: "", // link de pagamento entra na etapa com Mercado Pago
    };
    const corpo = preencher(etapa.texto, vars);
    const assunto = `${EMPRESA} — ${vars.descricao}, ${vars.valor}`;

    const r = await enviarEmail(cliente.email, assunto, montarHtml(corpo), {
      fonte: "system",
      relatedEntity: "financial_installments",
      relatedId: l.id,
    });

    // registra na trilha (mesmo em falha, para auditoria e retry na próxima hora)
    await admin.from("cobranca_envios").insert({
      tenant_id: tenantId,
      installment_id: l.id,
      regua_id: etapa.id,
      canal: "email",
      sucesso: r.ok,
      erro: r.motivo ?? null,
      email_message_id: r.id ?? null,
    });

    if (r.ok) {
      resumo.enviadas++;
      resumo.detalhe.push(
        `${l.financial_titles.code}: etapa ${etapa.dias}d → ${cliente.email}`
      );
    } else {
      resumo.falhas++;
      resumo.detalhe.push(`${l.financial_titles.code}: falhou (${r.motivo})`);
    }
  }

  return resumo;
}
