import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import { SolicitarCorporativoForm } from "@/components/corporativo/SolicitarCorporativoForm";
import {
  PedidoCorporativoForm,
  type EnderecoPadrao,
  type ProdutoCorporativo,
} from "@/components/corporativo/PedidoCorporativoForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corporativo — Nuvem de Papel",
  description: "Atendimento a empresas com compras recorrentes.",
};

// Corporativo (0059 - 20/11/2026): conta PJ. Desde 20/11/2026 a empresa nasce
// 'ativa' (limite R$ 1.000, prazo 30 dias) sem fila de aprovacao; a gestao
// ajusta limite/prazo ou bloqueia em Cadastros > Revenda.
// Etapa 3 (0060 - 20/11/2026): conta ativa ganha o painel do comprador -
// credito (limite, em aberto, disponivel, vencido), pedidos da empresa e
// novo pedido no atacado (corporate_place_order decide preco/credito/estoque).

type Empresa = {
  id: string;
  customer_id: string;
  razao_social: string;
  status: string;
  limite_credito: number;
  prazo_dias: number;
  motivo: string | null;
};
type Credito = { limite: number; em_aberto: number; disponivel: number; vencido: number; prazo_dias: number };
type PedidoEmpresa = {
  id: string;
  venda_numero: string | null;
  created_at: string;
  total_amount: number | string;
  status: string;
  condicao: string | null;
};

const TEXTO_STATUS: Record<string, string> = {
  ativa: "Conta ativa. Faça pedidos no atacado com faturamento no prazo da empresa.",
  bloqueada: "Conta bloqueada. Fale com nosso atendimento pelo botão do canto da tela.",
  recusada: "Conta recusada. Fale com nosso atendimento pelo botão do canto da tela.",
};

const STATUS_PEDIDO: Record<string, string> = {
  aguardando_pagamento: "aguardando pagamento",
  pago: "faturado",
  processando: "em separação",
  em_rota: "enviado",
  entregue: "entregue",
  cancelado: "cancelado",
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

type LinhaItem = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  description: string | null;
  foto_url: string | null;
  item_images: { url: string; position: number }[] | null;
  item_stock: unknown;
  item_prices: { channel: string; price: number | string; min_quantity: number; valid_from: string | null; valid_until: string | null }[] | null;
};

// mesma regra do PDV / venda manual: base vigente por canal, atacado cai no varejo
function produtosAtacado(linhas: LinhaItem[]): ProdutoCorporativo[] {
  const agora = Date.now();
  const out: ProdutoCorporativo[] = [];
  for (const r of linhas) {
    const precos = r.item_prices ?? [];
    const vigente = (p: (typeof precos)[number]) => {
      const vf = p.valid_from ? Date.parse(p.valid_from) : 0;
      const vt = p.valid_until ? Date.parse(p.valid_until) : Number.POSITIVE_INFINITY;
      return vf <= agora && vt > agora;
    };
    const base = (canal: string) =>
      precos.filter((p) => p.channel === canal && vigente(p)).sort((a, b) => a.min_quantity - b.min_quantity)[0] ?? null;
    const preco = base("atacado") ?? base("varejo");
    if (!preco) continue;
    const est = (Array.isArray(r.item_stock) ? r.item_stock[0] : r.item_stock) as { stock_available?: number } | null;
    out.push({
      id: r.id,
      sku: r.sku,
      nome: r.name,
      categoria: r.category,
      descricao: r.description,
      // foto principal = posicao 0 da galeria (0048), senao a foto_url antiga (0032)
      foto: (r.item_images ?? []).find((i) => i.position === 0)?.url ?? r.foto_url ?? null,
      preco: Number(preco.price),
      estoque: est?.stock_available ?? null,
    });
  }
  return out;
}

async function painel(admin: ReturnType<typeof createAdminClient>, empresa: Empresa) {
  const [credRes, pedRes, itensRes, cliRes, parcRes] = await Promise.all([
    admin.rpc("corporate_credit", { p_account: empresa.id }),
    admin
      .from("orders")
      .select("id, venda_numero, created_at, total_amount, status, condicao")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("corporate_account_id", empresa.id)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("catalog_items")
      .select("id, sku, name, category, description, foto_url, item_images(url, position), item_stock(stock_available), item_prices(channel, price, min_quantity, valid_from, valid_until)")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("active", true)
      .order("name", { ascending: true }),
    admin
      .from("customers")
      .select("cep, logradouro, numero, complemento, bairro, cidade, uf")
      .eq("id", empresa.customer_id)
      .maybeSingle(),
    admin
      .from("financial_titles")
      .select("source_id, financial_installments(due_date, amount, paid_amount, status)")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("source_type", "corporativo")
      .eq("customer_id", empresa.customer_id),
  ]);
  const c = (credRes.data ?? null) as Partial<Credito> | null;
  const credito: Credito = {
    limite: Number(c?.limite ?? 0),
    em_aberto: Number(c?.em_aberto ?? 0),
    disponivel: Number(c?.disponivel ?? 0),
    vencido: Number(c?.vencido ?? 0),
    prazo_dias: Number(c?.prazo_dias ?? empresa.prazo_dias),
  };
  const vencPorPedido = new Map<string, string>();
  for (const t of (parcRes.data ?? []) as { source_id: string; financial_installments: { due_date: string }[] | null }[]) {
    const d = (t.financial_installments ?? []).map((p) => p.due_date).sort()[0];
    if (d) vencPorPedido.set(t.source_id, d);
  }
  const cli = (cliRes.data ?? {}) as Partial<EnderecoPadrao>;
  const endereco: EnderecoPadrao = {
    cep: cli.cep ?? "",
    logradouro: cli.logradouro ?? "",
    numero: cli.numero ?? "",
    complemento: cli.complemento ?? "",
    bairro: cli.bairro ?? "",
    cidade: cli.cidade ?? "",
    uf: cli.uf ?? "",
  };
  return {
    credito,
    pedidos: (pedRes.data ?? []) as PedidoEmpresa[],
    vencPorPedido,
    produtos: produtosAtacado((itensRes.data ?? []) as unknown as LinhaItem[]),
    endereco,
  };
}

export default async function CorporativoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  let empresa: Empresa | null = null;
  let papel = "";
  let equipe = false;
  let nomeCliente = "";
  if (user) {
    const [{ data: vinculo }, { data: perfil }, { data: cli }] = await Promise.all([
      admin
        .from("corporate_buyers")
        .select(
          "papel, ativo, account:corporate_accounts!inner(id, customer_id, razao_social, status, limite_credito, prazo_dias, motivo)"
        )
        .eq("auth_user_id", user.id)
        .maybeSingle(),
      admin.from("profiles").select("id").eq("id", user.id).maybeSingle(),
      admin
        .from("customers")
        .select("name")
        .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
        .eq("auth_user_id", user.id)
        .maybeSingle(),
    ]);
    nomeCliente = (cli as { name?: string } | null)?.name ?? "";
    const v = vinculo as { papel?: string; ativo?: boolean; account?: Empresa | Empresa[] } | null;
    const conta = v?.account;
    empresa = (Array.isArray(conta) ? conta[0] : conta) ?? null;
    papel = v?.ativo === false ? "inativo" : (v?.papel ?? "");
    equipe = !!perfil;
  }

  const dados = empresa?.status === "ativa" ? await painel(admin, empresa) : null;
  const hoje = new Date().toISOString().slice(0, 10);
  const bloqueio =
    papel === "inativo"
      ? "Seu acesso à empresa está desativado. Fale com o administrador da conta."
      : papel === "financeiro"
        ? "Seu acesso é do financeiro: você acompanha crédito e pedidos, mas não faz pedidos."
        : dados && dados.credito.vencido > 0
          ? `A empresa tem ${brl(dados.credito.vencido)} em parcelas vencidas. Regularize para fazer pedidos novos.`
          : null;

  return (
    <main className="conta-shell">
      {empresa ? (
        <>
          <section className="conta-secao" aria-label="Situação da conta corporativa">
            <h1 className="corp-titulo">{empresa.razao_social}</h1>
            <p>
              <span className={`ct-pill-corp ct-pill-corp-${empresa.status}`}>{empresa.status}</span>
            </p>
            <p>{TEXTO_STATUS[empresa.status] ?? ""}</p>
            {empresa.motivo && empresa.status !== "ativa" && <p>Motivo: {empresa.motivo}</p>}
            {dados && (
              <div className="inicio-kpis" aria-label="Crédito da empresa">
                <div>
                  <small>Limite de crédito</small>
                  <b>{brl(dados.credito.limite)}</b>
                </div>
                <div>
                  <small>Em aberto</small>
                  <b>{brl(dados.credito.em_aberto)}</b>
                </div>
                <div>
                  <small>Disponível</small>
                  <b aria-label="Crédito disponível">{brl(dados.credito.disponivel)}</b>
                </div>
                <div>
                  <small>Prazo · vencido</small>
                  <b>
                    {dados.credito.prazo_dias > 0 ? `${dados.credito.prazo_dias} dias` : "à vista"} ·{" "}
                    {brl(dados.credito.vencido)}
                  </b>
                </div>
              </div>
            )}
            <p>
              <Link href="/conta">Ir para minha conta</Link>
            </p>
          </section>

          {dados && (
            <section className="conta-secao" aria-label="Novo pedido da empresa">
              <h2>Novo pedido</h2>
              <p className="inicio-sub">
                Preço de atacado. O valor final, o crédito e o estoque são conferidos na hora de registrar.
              </p>
              <PedidoCorporativoForm
                produtos={dados.produtos}
                disponivel={dados.credito.disponivel}
                bloqueado={bloqueio}
                endereco={dados.endereco}
              />
            </section>
          )}

          {dados && (
            <section className="conta-secao" aria-label="Pedidos da empresa">
              <h2>Pedidos da empresa</h2>
              {dados.pedidos.length === 0 ? (
                <p className="inicio-sub">Nenhum pedido ainda.</p>
              ) : (
                <table className="corp-tabela">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Data</th>
                      <th>Total</th>
                      <th>Situação</th>
                      <th>Vencimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.pedidos.map((p) => {
                      const venc = dados.vencPorPedido.get(p.id);
                      return (
                        <tr key={p.id}>
                          <td>{p.venda_numero ?? p.id.slice(0, 8).toUpperCase()}</td>
                          <td>{new Date(p.created_at).toLocaleDateString("pt-BR")}</td>
                          <td>{brl(Number(p.total_amount))}</td>
                          <td>{STATUS_PEDIDO[p.status] ?? p.status}</td>
                          <td className={venc && venc < hoje && p.status !== "cancelado" ? "corp-vencido" : undefined}>
                            {venc ? new Date(`${venc}T12:00:00`).toLocaleDateString("pt-BR") : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </>
      ) : equipe ? (
        <section className="conta-secao">
          <h1 className="corp-titulo">Atendimento corporativo</h1>
          <p>Você está logado com um acesso da equipe. As contas corporativas são geridas em Cadastros → Revenda.</p>
        </section>
      ) : (
        <SolicitarCorporativoForm logadoComo={user ? { nome: nomeCliente, email: user.email ?? "" } : null} />
      )}
    </main>
  );
}
