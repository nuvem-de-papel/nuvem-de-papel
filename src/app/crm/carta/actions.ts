"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { calcularIndicadores, gerarCarta } from "@/lib/insights";
import { enviarEmail, emailAvisos } from "@/lib/email";

// Server Actions da "carta de insights com IA" (entrega 6 — dashboard com IA).
// Disparo manual pelo botão "Gerar carta" (o agendador semanal via cron pode
// entrar depois; aqui fica o botão + listagem). A IA só escreve (regra de ouro
// de src/lib/insights.ts); os números vem do código.

export type CartaSalva = {
  id: string;
  tipo: string;
  periodo_inicio: string;
  periodo_fim: string;
  texto: {
    resumo: string;
    melhorou: string[];
    piorou: string[];
    atencao: string[];
    faltam_dados: string[];
    acoes: { texto: string; prazo: string }[];
  };
  status: string;
  created_at: string;
};

export type ResultadoCartaAcao =
  | { ok: true; msg: string; carta?: CartaSalva }
  | { ok: false; erro: string };

async function exigirGestor(): Promise<
  { erro: string } | { userId: string; admin: ReturnType<typeof createAdminClient> }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada. Entre novamente." };

  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil || perfil.status !== "ativo" || !PAPEIS_GESTAO.includes(perfil.role)) {
    return { erro: "Sem permissão para gerar a carta." };
  }
  return { userId: user.id, admin };
}

// períodos: semanal = última semana FECHADA (seg-dom); mensal = último mês fechado
function periodos(tipo: "semanal" | "mensal"): { inicio: Date; fim: Date } {
  const hoje = new Date();
  if (tipo === "mensal") {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { inicio, fim };
  }
  // dia da semana (0=seg ... 6=dom)
  const dow = (hoje.getDay() + 6) % 7;
  const segundaEstaSemana = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - dow);
  const fim = segundaEstaSemana;
  const inicio = new Date(segundaEstaSemana.getTime() - 7 * 86400000);
  return { inicio, fim };
}

const ddmm = (d: Date | string) =>
  new Date(d).toLocaleDateString("pt-BR");

export async function gerarCartaAgora(
  tipo: "semanal" | "mensal"
): Promise<ResultadoCartaAcao> {
  const gestor = await exigirGestor();
  if ("erro" in gestor) return { ok: false, erro: gestor.erro };

  const { inicio, fim } = periodos(tipo);
  const ind = await calcularIndicadores(inicio, fim);
  const r = await gerarCarta(ind, tipo);
  if (!r.ok) return { ok: false, erro: r.erro };

  const admin = createAdminClient();
  const { data: linha, error } = await admin
    .from("insight_cartas")
    .insert({
      tenant_id: NUVEM_DE_PAPEL_TENANT_ID,
      tipo,
      periodo_inicio: inicio.toISOString().slice(0, 10),
      periodo_fim: fim.toISOString().slice(0, 10),
      indicadores: ind.valores,
      texto: r.carta,
      status: r.status,
      enviada_em: null,
    })
    .select("id, tipo, periodo_inicio, periodo_fim, texto, status, created_at")
    .single();
  if (error || !linha) return { ok: false, erro: `Falha ao gravar a carta: ${error?.message}` };

  // e-mail best-effort (só se Resend configurado); não quebra a geração
  let emailMsg = "";
  try {
    const envio = await enviarEmail(emailAvisos(), cartaAssunto(tipo, inicio, fim), cartaHtml(r.carta, tipo, inicio, fim), {
      fonte: "system",
      relatedEntity: "insight_cartas",
      relatedId: linha.id,
    });
    emailMsg = envio.ok ? " E-mail enviado." : "";
    if (envio.ok) {
      await admin.from("insight_cartas").update({ enviada_em: new Date().toISOString() }).eq("id", linha.id);
    }
  } catch {
    emailMsg = "";
  }

  revalidatePath("/crm/carta");
  const carta: CartaSalva = {
    id: linha.id,
    tipo: linha.tipo,
    periodo_inicio: linha.periodo_inicio,
    periodo_fim: linha.periodo_fim,
    texto: linha.texto as CartaSalva["texto"],
    status: linha.status,
    created_at: linha.created_at,
  };
  return {
    ok: true,
    carta,
    msg: `Carta ${tipo} de ${ddmm(inicio)} a ${ddmm(fim)} gerada (${r.status}).${emailMsg}`,
  };
}

function cartaAssunto(tipo: string, inicio: Date, fim: Date): string {
  const rotulo = tipo === "mensal" ? "Carta do mês" : "Carta da semana";
  return `${rotulo}: ${ddmm(inicio)} a ${ddmm(fim)}`;
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function listaHtml(titulo: string, itens: string[]): string {
  if (!itens.length) return "";
  const li = itens.map((i) => `<li style="margin:4px 0">${esc(i)}</li>`).join("");
  return `<p style="margin:14px 0 4px;font-weight:700">${esc(titulo)}</p><ul style="margin:0;padding-left:18px">${li}</ul>`;
}

function cartaHtml(
  texto: CartaSalva["texto"],
  tipo: string,
  inicio: Date,
  fim: Date
): string {
  const acoes = texto.acoes.length
    ? "<p style=\"margin:14px 0 4px;font-weight:700\">Para esta semana</p><ul style=\"margin:0;padding-left:18px\">" +
      texto.acoes
        .map((a) => `<li style="margin:4px 0">${esc(a.texto)} <span style="color:#8A8296">(${esc(a.prazo)})</span></li>`)
        .join("") +
      "</ul>"
    : "";
  return [
    `<p style="font-size:12px;color:#8A8296">${tipo === "mensal" ? "Carta do mês" : "Carta da semana"} — ${ddmm(inicio)} a ${ddmm(fim)}</p>`,
    `<p style="font-size:16px;font-weight:700">${esc(texto.resumo)}</p>`,
    listaHtml("O que melhorou", texto.melhorou),
    listaHtml("O que piorou", texto.piorou),
    listaHtml("Atenção", texto.atencao),
    listaHtml("Faltam dados", texto.faltam_dados),
    acoes,
    '<p style="color:#8A8296;font-size:12px;margin-top:24px">Nuvem de Papel — mensagem automática. Os números vêm do seu painel; a IA só escreve o texto.</p>',
  ].join("");
}
