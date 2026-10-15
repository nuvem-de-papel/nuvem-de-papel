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
      "sku, name, category, active, notes, foto_url, item_fiscal_data(gtin, ncm, unit, weight_kg), item_commercial_data(preco_custo, cost_price, margin_percent), item_prices(price, min_quantity, channel)"
    )
    .order("name", { ascending: true });

  if (error) return { ok: false, erro: `Falha ao ler produtos: ${error.message}` };

  const linhas: string[] = [];
  linhas.push(
    ["sku", "nome", "categoria", "ativo", "gtin", "ncm", "unidade", "peso_kg", "custo", "custo_medio", "margem_pct", "observacoes", "foto_url", "preco_varejo"].join(",")
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
        // 0033: custo = preco digitado; custo_medio = media ponderada (Compras)
        campoCsv(com?.preco_custo ?? com?.cost_price),
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
// A action devolve DADOS (colunas + linhas); o PDF é montado no cliente
// (src/lib/relatorio-pdf.ts) porque o download acontece no browser.

export type RelatorioProduto = "entradas" | "saidas" | "estoque" | "patrimonio" | "inventario";

export type RelatorioDados = {
  ok: boolean;
  titulo?: string;
  subtitulo?: string;
  colunas?: string[];
  linhas?: string[][];
  // linha extra já pronta (ex.: TOTAL do patrimônio), desenhada em negrito
  resumo?: string[];
  arquivo?: string;
  erro?: string;
};

const ROTULOS: Record<RelatorioProduto, { titulo: string; subtitulo: string }> = {
  entradas: { titulo: "Relatório de Entradas", subtitulo: "Movimentos que entraram no estoque (entrada, devolução e ajuste positivo)." },
  saidas: { titulo: "Relatório de Saídas", subtitulo: "Movimentos que saíram do estoque (venda e ajuste negativo)." },
  estoque: { titulo: "Relatório de Estoque", subtitulo: "Saldo disponível e físico por produto." },
  patrimonio: { titulo: "Relatório de Patrimônio", subtitulo: "Valor do estoque apurado pelo custo unitário." },
  inventario: { titulo: "Relatório de Inventário", subtitulo: "Folha de contagem física — anote a contagem e a diferença." },
};

function quando(iso: unknown): string {
  if (typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// texto limpo pra célula de PDF: string simples, sem escape de CSV
function cel(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export async function gerarRelatorioProduto(tipo: RelatorioProduto): Promise<RelatorioDados> {
  const gestor = await gestorAtual();
  if (!gestor) return { ok: false, erro: "Sem permissão para gerar relatório." };

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const hoje = new Date().toISOString().slice(0, 10);
  const rot = ROTULOS[tipo];

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
        cel(quando(m.created_at)),
        cel(item.sku),
        cel(item.name),
        cel(m.movement_type),
        cel(m.quantity),
        cel(m.reference_type),
        cel(m.notes),
      ];
    });

    const colunas = ["Data", "SKU", "Produto", "Tipo", "Qtd.", "Referência", "Observações"];
    // subtotal: soma das quantidades do período
    const soma = (data ?? []).reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
    return {
      ok: true,
      titulo: rot.titulo,
      subtitulo: `${rot.subtitulo} Período: últimos ${linhas.length} movimentos.`,
      colunas,
      linhas,
      resumo: ["", "", "", "TOTAL", String(soma), "", ""],
      arquivo: `relatorio-${tipo}-${hoje}`,
    };
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
        cel(item.sku), cel(item.name), cel(item.category),
        cel(item.active ? "sim" : "não"),
        cel(r.stock_available), cel(fisico), cel(quando(r.updated_at)),
      ]);
    } else if (tipo === "patrimonio") {
      linhas.push([
        cel(item.sku), cel(item.name), cel(fisico),
        custo.toFixed(2).replace(".", ","), valor.toFixed(2).replace(".", ","),
      ]);
    } else {
      // inventário: folha de contagem física (colunas em branco pra anotar)
      linhas.push([cel(item.sku), cel(item.name), cel(item.category), cel(fisico), "", ""]);
    }
  }

  let colunas: string[];
  let resumo: string[] | undefined;
  if (tipo === "estoque") {
    colunas = ["SKU", "Produto", "Setor", "Ativo", "Disponível", "Físico", "Atualizado em"];
  } else if (tipo === "patrimonio") {
    colunas = ["SKU", "Produto", "Qtd. física", "Custo unit.", "Valor total"];
    resumo = ["", "TOTAL", "", "", totalPatrimonio.toFixed(2).replace(".", ",")];
  } else {
    colunas = ["SKU", "Produto", "Setor", "Qtd. sistema", "Contagem física", "Diferença"];
  }

  return {
    ok: true,
    titulo: rot.titulo,
    subtitulo: `${rot.subtitulo} ${linhas.length} produto(s) com estoque controlado.`,
    colunas,
    linhas,
    resumo,
    arquivo: `relatorio-${tipo}-${hoje}`,
  };
}
