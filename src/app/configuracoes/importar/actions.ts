"use server";

// Rotinas da tela Exportar/Importar Dados (Configurações).
// Hoje só a exportação de produtos em CSV; as rotinas de importação de XML
// entram por etapas (cada formato = uma rotina nova).

import { PAPEIS_GESTAO } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";

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
