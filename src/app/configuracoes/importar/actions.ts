"use server";

// Rotinas da tela Exportar/Importar Dados (Configurações) + relatórios do
// cadastro de produtos (botão Relatório na tela de produto).
// Fontes: catalog_items (+ fiscais/comerciais) e o livro de estoque
// (item_stock / stock_movements, migration 0007).

import { PAPEIS_GESTAO } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

type RetornoCsv = { ok: boolean; csv?: string; arquivo?: string; erro?: string };

async function gestorAtual(): Promise<{ id: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "ativo" || !PAPEIS_GESTAO.includes(profile.role)) return null;
  return profile;
}

// Escapa um campo CSV (RFC 4180): aspas duplicadas e embrulha se tiver
// vírgula, aspa ou quebra de linha.
function campoCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Exporta os produtos cadastrados em CSV (mesma ordem alfabética da tela).
export async function exportarProdutosCsv(): Promise<RetornoCsv> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para exportar." };

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("catalog_items")
    .select(
      "sku, name, category, active, notes, foto_url, item_fiscal_data(gtin, ncm, unit, weight_kg), item_commercial_data(cost_price, margin_percent), item_prices(price, min_quantity, channel)"
    )
    .order("name", { ascending: true });

  if (error) return { ok: false, erro: `Falha ao ler produtos: ${error.message}` };

  const linhas: string[] = [];
  linhas.push(
    ["sku", "nome", "categoria", "ativo", "gtin", "ncm", "unidade", "peso_kg", "custo", "margem_pct", "observacoes", "foto_url", "preco_varejo"].join(",")
  );

  for (const p of (data ?? []) as Record<string, unknown>[]) {
    const fis = Array.isArray(p.item_fiscal_data) ? (p.item_fiscal_data[0] as Record<string, unknown> | undefined) : (p.item_fiscal_data as Record<string, unknown> | undefined);
    const com = Array.isArray(p.item_commercial_data) ? (p.item_commercial_data[0] as Record<string, unknown> | undefined) : (p.item_commercial_data as Record<string, unknown> | undefined);
    const precos = Array.isArray(p.item_prices) ? (p.item_prices as Record<string, unknown>[]) : [];
    const varejo = precos.find((x) => x.channel === "varejo");

    linhas.push(
      [
        campoCsv(p.sku),
        campoCsv(p.name),
        campoCsv(p.category),
        campoCsv(p.active ? "sim" : "nao"),
        campoCsv(fis?.gtin),
        campoCsv(fis?.ncm),
        campoCsv(fis?.unit),
        campoCsv(fis?.weight_kg),
        campoCsv(com?.cost_price),
        campoCsv(com?.margin_percent),
        campoCsv(p.notes),
        campoCsv(p.foto_url),
        campoCsv(varejo?.price),
      ].join(",")
    );
  }

  // BOM UTF-8 pro Excel abrir acentos corretamente.
  const csv = "\uFEFF" + linhas.join("\r\n") + "\r\n";
  const hoje = new Date().toISOString().slice(0, 10);
  return { ok: true, csv, arquivo: `produtos-${hoje}.csv` };
}

// ---------------------------------------------------------------- relatórios
// Botão "Relatório" da tela de cadastro de produtos. Todos saem do banco:
// livro de estoque (0007) + catálogo. Nada é estimado.

export type RelatorioProduto = "entradas" | "saidas" | "estoque" | "patrimonio" | "inventario";

function csvDe(colunas: string[], linhas: string[][]): string {
  return "\uFEFF" + [colunas.join(","), ...linhas.map((l) => l.join(","))].join("\r\n") + "\r\n";
}

function quando(iso: unknown): string {
  if (typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export async function gerarRelatorioProduto(tipo: RelatorioProduto): Promise<RetornoCsv> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para gerar relatório." };

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const hoje = new Date().toISOString().slice(0, 10);

  // ---- Entradas / Saídas (livro de estoque) --------------------------------
  // entra: entrada/devolucao/ajuste com sinal + ; sai: venda/ajuste com sinal −.
  // reserva/liberacao mexem só no disponível (reserva de pedido) e ficam de fora.
  if (tipo === "entradas" || tipo === "saidas") {
    const tipos = tipo === "entradas" ? ["entrada", "devolucao", "ajuste"] : ["venda", "ajuste"];
    let q = admin
      .from("stock_movements")
      .select(
        "created_at, movement_type, quantity, reference_type, notes, catalog_items(sku, name)"
      )
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .in("movement_type", tipos)
      .order("created_at", { ascending: false })
      .limit(5000);
    q = tipo === "entradas" ? q.gt("quantity", 0) : q.lt("quantity", 0);
    const { data, error } = await q;
    if (error) return { ok: false, erro: `Falha ao ler o livro de estoque: ${error.message}` };

    const linhas: string[][] = (data ?? []).map((m: Record<string, unknown>) => {
      const item = (m.catalog_items ?? {}) as Record<string, unknown>;
      return [
        campoCsv(quando(m.created_at)),
        campoCsv(item.sku),
        campoCsv(item.name),
        campoCsv(m.movement_type),
        campoCsv(m.quantity),
        campoCsv(m.reference_type),
        campoCsv(m.notes),
      ];
    });

    const cab = ["data", "sku", "produto", "tipo_movimento", "quantidade", "referencia", "observacoes"];
    return { ok: true, csv: csvDe(cab, linhas), arquivo: `relatorio-${tipo}-${hoje}.csv` };
  }

  // ---- Estoque / Patrimônio / Inventário -----------------------------------
  const { data, error } = await admin
    .from("item_stock")
    .select(
      "stock_available, stock_on_hand, updated_at, catalog_items(sku, name, category, active, item_commercial_data(cost_price))"
    )
    .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
    .order("updated_at", { ascending: false });

  if (error) return { ok: false, erro: `Falha ao ler o estoque: ${error.message}` };

  const linhas: string[][] = [];
  let totalPatrimonio = 0;

  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const item = (r.catalog_items ?? {}) as Record<string, unknown>;
    const comArr = item.item_commercial_data as unknown;
    const com = (Array.isArray(comArr) ? comArr[0] : comArr) as Record<string, unknown> | undefined;
    const custo = Number(com?.cost_price ?? 0) || 0;
    const fisico = Number(r.stock_on_hand ?? 0) || 0;
    const valor = custo * fisico;
    totalPatrimonio += valor;

    if (tipo === "estoque") {
      linhas.push([
        campoCsv(item.sku), campoCsv(item.name), campoCsv(item.category),
        campoCsv(item.active ? "sim" : "nao"),
        campoCsv(r.stock_available), campoCsv(fisico), campoCsv(quando(r.updated_at)),
      ]);
    } else if (tipo === "patrimonio") {
      linhas.push([
        campoCsv(item.sku), campoCsv(item.name), campoCsv(fisico),
        campoCsv(custo.toFixed(2)), campoCsv(valor.toFixed(2)),
      ]);
    } else {
      // inventário: folha de contagem física (coluna em branco pra anotar)
      linhas.push([
        campoCsv(item.sku), campoCsv(item.name), campoCsv(item.category),
        campoCsv(fisico), "", "",
      ]);
    }
  }

  let cab: string[];
  if (tipo === "estoque") {
    cab = ["sku", "produto", "setor", "ativo", "disponivel", "fisico", "atualizado_em"];
  } else if (tipo === "patrimonio") {
    cab = ["sku", "produto", "quantidade_fisica", "custo_unitario", "valor_total"];
    linhas.push(["", "TOTAL", "", "", totalPatrimonio.toFixed(2)]);
  } else {
    cab = ["sku", "produto", "setor", "quantidade_sistema", "contagem_fisica", "diferenca"];
  }

  return { ok: true, csv: csvDe(cab, linhas), arquivo: `relatorio-${tipo}-${hoje}.csv` };
}
