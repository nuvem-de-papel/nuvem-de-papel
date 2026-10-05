import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import {
  CadastrosTelaUnica,
  type ClienteCad,
  type EmpresaCad,
  type FornecedorCad,
  type ProdutoCad,
  type RevendaCad,
} from "@/components/conta/CadastrosTelaUnica";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configurações - Cadastro - Nuvem de Papel",
  description: "Cadastro de cliente, produto, fornecedor, revenda e dados da empresa.",
};

function mascaraCnpj(d: string): string {
  const x = (d ?? "").replace(/\D/g, "");
  if (x.length !== 14) return d ?? "";
  return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function mascaraCep(d: string): string {
  const x = (d ?? "").replace(/\D/g, "");
  if (x.length !== 8) return d ?? "";
  return x.replace(/^(\d{5})(\d{3})$/, "$1-$2");
}

// A tela dentro de /configuracoes/cadastro é escolhida por ?tela=
// (sub-itens do menu lateral: cliente, produto, empresa, fornecedor, revenda).
export default async function CadastroPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/configuracoes/cadastro");

  const admin = createAdminClient();
  const [fornRes, revRes, meuRes, empRes, sefazRes, prodRes, cliRes] = await Promise.all([
    admin
      .from("suppliers")
      .select("id, name, contact_email, cnpj, active")
      .order("name", { ascending: true }),
    admin
      .from("profiles")
      .select("id, email, full_name, status, created_at")
      .eq("role", "revenda")
      .order("created_at", { ascending: false }),
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    admin
      .from("tenant_company")
      .select("*")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .maybeSingle(),
    admin
      .from("sefaz_config")
      .select("*")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .maybeSingle(),
    admin
      .from("catalog_items")
      .select(
        "id, sku, name, category, active, item_fiscal_data(gtin, ncm, cst_csosn, cest, origem, unit, icms_rate, ipi_rate, weight_kg, weight_gross_kg), item_commercial_data(cost_price, margin_percent, min_stock), item_prices(price, min_quantity, channel)"
      )
      .order("name", { ascending: true }),
    // Bloco 5 passo 3: clientes reais (antes os contadores e a ficha eram fixos)
    admin
      .from("customers")
      .select("id, name, email, documento, ie, uf, tier, points, created_at, orders(count)")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .order("name", { ascending: true })
      .limit(500),
  ]);

  const meu = meuRes.data;
  if (!meu || meu.status !== "ativo" || !PAPEIS_GESTAO.includes(meu.role)) {
    redirect("/crm");
  }

  const fornecedoresReais: FornecedorCad[] = (fornRes.data ?? []).map((f) => ({
    id: f.id,
    nome: f.name,
    contato: f.contact_email,
    cnpj: f.cnpj,
    ativo: f.active,
  }));

  const revendas: RevendaCad[] = (revRes.data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    status: r.status,
    created_at: r.created_at,
  }));

  // F8.1: emitente real (antes era formulário de exemplo)
  const emp = empRes.data;
  const sefaz = sefazRes.data;
  const empresa: EmpresaCad | null = emp
    ? {
        razaoSocial: emp.razao_social,
        fantasia: emp.fantasia ?? "",
        cnpj: mascaraCnpj(emp.cnpj),
        ie: emp.ie ?? "",
        im: emp.im ?? "",
        regime: emp.regime ?? "simples",
        email: emp.email ?? "",
        telefone: emp.telefone ?? "",
        cep: mascaraCep(emp.endereco?.cep ?? ""),
        uf: emp.endereco?.uf ?? "",
        cidade: emp.endereco?.cidade ?? "",
        logradouro: emp.endereco?.logradouro ?? "",
        numero: emp.endereco?.numero ?? "",
        bairro: (emp.endereco as { bairro?: string } | null)?.bairro ?? "",
        complemento: emp.endereco?.complemento ?? "",
        site: emp.site ?? "",
        ambiente: sefaz?.ambiente ?? "homologacao",
        serieNfe: String(sefaz?.serie_nfe ?? 1),
        serieNfce: String(sefaz?.serie_nfce ?? 1),
        cfopPadrao: sefaz?.cfop_padrao ?? "5102",
        pedirDocumento: sefaz?.pedir_documento ?? true,
      }
    : null;

  // F8.1: produtos reais com fiscal/comercial/preço em um passe só
  const produtos: ProdutoCad[] = (prodRes.data ?? []).map((p) => {
    const embF = p.item_fiscal_data as unknown;
    const f = (Array.isArray(embF) ? embF[0] : embF) as {
      gtin: string | null;
      ncm: string | null;
      cst_csosn: string | null;
      cest: string | null;
      origem: string | null;
      unit: string | null;
      icms_rate: number | null;
      ipi_rate: number | null;
      weight_kg: number | null;
      weight_gross_kg: number | null;
    } | null;
    const embC = p.item_commercial_data as unknown;
    const c = (Array.isArray(embC) ? embC[0] : embC) as {
      cost_price: number | null;
      margin_percent: number | null;
      min_stock: number | null;
    } | null;
    const precos = (Array.isArray(p.item_prices) ? p.item_prices : []) as {
      price: number;
      min_quantity: number;
      channel: string;
    }[];
    const preco =
      precos.find((x) => x.channel === "varejo" && x.min_quantity === 1)?.price ??
      precos.find((x) => x.channel === "varejo")?.price ??
      0;
    return {
      id: p.id,
      sku: p.sku,
      nome: p.name,
      categoria: p.category ?? "",
      ativo: p.active,
      gtin: f?.gtin ?? "",
      ncm: f?.ncm ?? "",
      csosn: f?.cst_csosn ?? "",
      cest: f?.cest ?? "",
      origem: f?.origem ?? "0",
      unit: f?.unit ?? "UN",
      icmsPct: Number(f?.icms_rate ?? 0),
      ipiPct: Number(f?.ipi_rate ?? 0),
      pesoLiquido: Number(f?.weight_kg ?? 0),
      pesoBruto: Number(f?.weight_gross_kg ?? 0),
      precoCusto: Number(c?.cost_price ?? 0),
      precoVenda: Number(preco),
      minStock: Number(c?.min_stock ?? 0),
      margemPct: Number(c?.margin_percent ?? 0),
    };
  });

  type BrutoCliente = {
    id: string;
    name: string;
    email: string;
    documento: string | null;
    ie: string | null;
    uf: string | null;
    tier: string;
    points: number | string;
    created_at: string;
    orders: { count: number }[] | null;
  };
  const clientes: ClienteCad[] = ((cliRes.data ?? []) as unknown as BrutoCliente[]).map((c) => ({
    id: c.id,
    nome: c.name,
    email: c.email,
    documento: c.documento ?? "",
    ie: c.ie ?? "",
    uf: c.uf ?? "",
    tier: c.tier,
    pontos: Number(c.points ?? 0),
    criadoEm: c.created_at,
    pedidos: Array.isArray(c.orders) ? Number(c.orders[0]?.count ?? 0) : 0,
  }));

  return (
    <CadastrosTelaUnica
      fornecedoresReais={fornecedoresReais}
      revendas={revendas}
      empresa={empresa}
      produtos={produtos}
      clientes={clientes}
    />
  );
}
