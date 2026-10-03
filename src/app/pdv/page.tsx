import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_OPERACIONAIS } from "@/lib/rbac";
import {
  ConsolePdv,
  type ItemPdv,
  type SessaoCaixa,
  type MovimentoCaixa,
  type ResumoCaixa,
  type UltimoTurno,
} from "@/components/pdv/ConsolePdv";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PDV — Nuvem de Papel",
  description: "Frente de caixa: abertura, vendas, suprimento/sangria e fechamento.",
};

export default async function PdvPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/pdv");

  const admin = createAdminClient();
  const [sessaoRes, itensRes, meuRes, ultimoRes] = await Promise.all([
    admin
      .from("caixa_sessions")
      .select("id, opening_amount, opened_at, operator_id")
      .eq("status", "aberto")
      .maybeSingle(),
    admin
      .from("catalog_items")
      .select(
        "id, sku, name, item_stock(stock_available), item_prices(channel, price, min_quantity, valid_from, valid_until)"
      )
      .eq("active", true)
      .order("name", { ascending: true }),
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    // CX-09: resumo do último turno fechado para o formulário de abertura
    admin
      .from("caixa_sessions")
      .select("id, closed_at, expected_amount, counted_amount, difference_amount")
      .eq("status", "fechado")
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_OPERACIONAIS.includes(meu.role)) {
    redirect("/crm");
  }

  const sessaoBruta = sessaoRes.data;
  const sessao: SessaoCaixa | null = sessaoBruta
    ? {
        id: sessaoBruta.id,
        abertura: Number(sessaoBruta.opening_amount),
        aberta_em: sessaoBruta.opened_at,
        operador: "",
      }
    : null;

  // 2ª rodada: movimentos da sessão (resumo CX-10 + lista), totais por
  // pagamento (quadro de fechamento) e vendas do último turno (CX-09).
  let movimentos: MovimentoCaixa[] = [];
  let resumo: ResumoCaixa | null = null;
  let ultimo: UltimoTurno | null = null;

  if (sessao && sessaoBruta) {
    const [movRes, ordRes, opRes] = await Promise.all([
      admin
        .from("caixa_movements")
        .select("id, movement_type, direction, amount, reason, created_at")
        .eq("session_id", sessao.id)
        .order("created_at", { ascending: false }),
      admin
        .from("orders")
        .select("payment_method, total_amount")
        .eq("caixa_sessao_id", sessao.id),
      admin
        .from("profiles")
        .select("full_name")
        .eq("id", sessaoBruta.operator_id)
        .maybeSingle(),
    ]);
    sessao.operador = String(opRes.data?.full_name ?? "");
    movimentos = (movRes.data ?? []).map((m) => ({
      id: m.id,
      tipo: m.movement_type,
      direcao: m.direction,
      valor: Number(m.amount),
      motivo: m.reason ?? null,
      criado_em: m.created_at,
    }));

    const soma = (tipo: string) =>
      movimentos.filter((m) => m.tipo === tipo).reduce((a, m) => a + m.valor, 0);
    const porPagamento = new Map<string, number>();
    for (const o of ordRes.data ?? []) {
      const met = String(o.payment_method ?? "—");
      porPagamento.set(met, (porPagamento.get(met) ?? 0) + Number(o.total_amount));
    }
    resumo = {
      abertura: sessao.abertura,
      vendasQtd: movimentos.filter((m) => m.tipo === "venda").length,
      vendasTotal: soma("venda"),
      suprimentos: soma("suprimento"),
      sangrias: soma("sangria"),
      gaveta: movimentos.reduce((a, m) => a + (m.direcao === "in" ? m.valor : -m.valor), 0),
      porPagamento: [...porPagamento.entries()].map(([metodo, total]) => ({ metodo, total })),
    };
  } else {
    movimentos = [];
  }

  if (ultimoRes.data) {
    const { data: movUlt } = await admin
      .from("caixa_movements")
      .select("movement_type, amount")
      .eq("session_id", ultimoRes.data.id);
    const vendas = (movUlt ?? []).filter((m) => m.movement_type === "venda");
    ultimo = {
      fechada_em: String(ultimoRes.data.closed_at ?? ""),
      esperado: Number(ultimoRes.data.expected_amount ?? 0),
      contado: Number(ultimoRes.data.counted_amount ?? 0),
      diferenca: Number(ultimoRes.data.difference_amount ?? 0),
      vendasQtd: vendas.length,
      vendasTotal: vendas.reduce((a, m) => a + Number(m.amount), 0),
    };
  }

  const agoraMs = Date.now();
  const itens: ItemPdv[] = (itensRes.data ?? [])
    .map((r) => {
      const estRaw = r.item_stock as unknown;
      const est = (Array.isArray(estRaw) ? estRaw[0] : estRaw) as { stock_available: number } | null;
      const precos = (r.item_prices ?? []) as {
        channel: string;
        price: number | string;
        min_quantity: number;
        valid_from: string | null;
        valid_until: string | null;
      }[];
      // com faixas por canal (F6) cada canal tem N linhas: escolhe a base
      // vigente (menor min_quantity) — as faixas por qtd no PDV ficam p/ depois
      const vigente = (p: (typeof precos)[number]) => {
        const vf = p.valid_from ? Date.parse(p.valid_from) : 0;
        const vt = p.valid_until ? Date.parse(p.valid_until) : Number.POSITIVE_INFINITY;
        return vf <= agoraMs && vt > agoraMs;
      };
      const base = (canal: string) =>
        precos
          .filter((p) => p.channel === canal && vigente(p))
          .sort((a, b) => a.min_quantity - b.min_quantity)[0] ?? null;
      const varejo = base("varejo");
      const atacado = base("atacado");
      const pVarejo = varejo ? Number(varejo.price) : null;
      const pAtacado = atacado ? Number(atacado.price) : pVarejo;
      if (pVarejo === null && pAtacado === null) return null;
      return {
        id: r.id,
        sku: r.sku,
        name: r.name,
        precoVarejo: pVarejo ?? pAtacado!,
        precoAtacado: pAtacado,
        estoque: est ? Number(est.stock_available) : null,
      };
    })
    .filter((i): i is ItemPdv => i !== null);

  return (
    <ConsolePdv
      sessao={sessao}
      itens={itens}
      movimentos={movimentos}
      papel={meu.role}
      resumo={resumo}
      ultimo={ultimo}
    />
  );
}
