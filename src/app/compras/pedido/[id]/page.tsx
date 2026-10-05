import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_GESTAO } from "@/lib/rbac";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";
import BotaoImprimir from "@/components/compras/BotaoImprimir";

// Bloco 4 - PDF do pedido de compra. Antes o pedido so existia como texto de
// e-mail (templatePedidoCompra, src/lib/email.ts:267); agora ele tem pagina
// propria em A4, pronta para Ctrl+P -> "Salvar como PDF". Rota protegida pelo
// middleware (/compras/:path*, src/middleware.ts:76) e de novo pela checagem
// de papel aqui dentro - fail-closed.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedido de compra — Nuvem de Papel",
  robots: { index: false, follow: false },
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function comoObjeto(valor: unknown): Record<string, unknown> | null {
  if (Array.isArray(valor)) return (valor[0] as Record<string, unknown>) ?? null;
  return (valor as Record<string, unknown>) ?? null;
}

const rotuloStatus: Record<string, string> = {
  aberto: "Aberto",
  aguardando: "Aguardando",
  producao: "Em produção",
  transito: "Em trânsito",
  desembaraco: "Em desembaraço",
  chegou: "Chegou",
  parcial: "Recebido parcialmente",
  recebido: "Recebido",
  concluido: "Concluído",
  cancelado: "Cancelado",
  aguardando_nota: "Aguardando nota",
  aguardando_nfe: "Aguardando nota",
};

const rotuloOrigem: Record<string, string> = {
  nacional: "Nacional (compra no mercado interno)",
  importacao: "Importação (compra no exterior)",
};

type LinhaItem = {
  sku_snapshot: string;
  name_snapshot: string;
  quantity: number;
  unit_cost: number | string;
  line_total: number | string;
  qtd_recebida: number | null;
};

export default async function PedidoCompraPdf({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/compras");

  const admin = createAdminClient();
  // O select com embed faz o supabase-js devolver GenericStringError no parser;
  // a linha crua e tratada aqui com tipo proprio (mesma leitura de
  // src/app/compras/page.tsx:33).
  type LinhaPo = {
    id: string;
    code: string;
    status: string;
    total: number | string;
    notes: string | null;
    created_at: string;
    expected_at: string | null;
    origem: string;
    tipo: string;
    frete: number | string | null;
    desconto: number | string | null;
    condicao: string | null;
    suppliers: unknown;
    purchase_order_items: unknown;
  };
  const [{ data: perfil }, poRes, { data: emp }] = await Promise.all([
    admin.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
    admin
      .from("purchase_orders")
      .select(
        "id, code, status, total, notes, created_at, expected_at, origem, tipo, frete, desconto, condicao, " +
          "suppliers(id, name, cnpj, uf, pais, contact_email), " +
          "purchase_order_items(sku_snapshot, name_snapshot, quantity, unit_cost, line_total, qtd_recebida)"
      )
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .eq("id", params.id)
      .maybeSingle(),
    admin
      .from("tenant_company")
      .select("razao_social, fantasia, cnpj, ie, email, telefone, endereco")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID)
      .maybeSingle(),
  ]);

  const po = poRes.data ? ((poRes.data as unknown) as LinhaPo) : null;

  if (!perfil || perfil.status !== "ativo" || !PAPEIS_GESTAO.includes(perfil.role)) {
    redirect("/crm");
  }
  if (!po) notFound();

  const fornRaw = comoObjeto(po.suppliers);
  const forn = fornRaw
    ? {
        nome: String(fornRaw.name ?? "—"),
        cnpj: (fornRaw.cnpj as string | null) ?? null,
        uf: (fornRaw.uf as string | null) ?? null,
        pais: (fornRaw.pais as string | null) ?? "Brasil",
        contato: (fornRaw.contact_email as string | null) ?? null,
      }
    : { nome: "—", cnpj: null, uf: null, pais: "Brasil", contato: null };

  const end = (emp?.endereco ?? {}) as Record<string, string>;
  const emitente = {
    razao: emp?.razao_social ?? "—",
    fantasia: emp?.fantasia ?? "",
    cnpj: emp?.cnpj ?? "",
    ie: emp?.ie ?? "",
    email: emp?.email ?? "",
    telefone: emp?.telefone ?? "",
    endereco: [
      end.logradouro,
      end.numero ? `nº ${end.numero}` : null,
      end.complemento,
      end.bairro,
      end.cidade && end.uf ? `${end.cidade}/${end.uf}` : end.cidade ?? end.uf,
      end.cep ? `CEP ${end.cep}` : null,
    ]
      .filter(Boolean)
      .join(", "),
  };

  const itens = (po.purchase_order_items ?? []) as unknown as LinhaItem[];
  const frete = Number(po.frete ?? 0);
  const desconto = Number(po.desconto ?? 0);
  const total = Number(po.total ?? 0);
  const subtotal = itens.reduce((s, i) => s + Number(i.line_total ?? 0), 0);

  const dataEmissao = new Date(po.created_at).toLocaleDateString("pt-BR");
  const previsao = po.expected_at
    ? new Date(po.expected_at).toLocaleDateString("pt-BR")
    : "—";

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "7px 9px",
    borderBottom: "1.5px solid #333",
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };
  const td: React.CSSProperties = {
    padding: "7px 9px",
    borderBottom: "1px solid #d7dbe3",
    fontSize: 12,
    verticalAlign: "top",
  };
  const rotulo: React.CSSProperties = {
    fontSize: 9.5,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 800,
    marginBottom: 3,
  };

  return (
    <main className="doc-print" style={{ background: "#fff", minHeight: "100vh" }}>
      <div
        data-no-print
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          padding: "14px 18px",
          background: "var(--bg-cloud, #f4f6fa)",
          borderBottom: "1px solid var(--border, #e3e7ef)",
        }}
      >
        <a
          href="/compras"
          style={{
            border: "1px solid var(--border, #e3e7ef)",
            borderRadius: 10,
            background: "#fff",
            color: "var(--navy, #0b2b3d)",
            fontWeight: 800,
            fontSize: 13,
            padding: "8px 14px",
            textDecoration: "none",
          }}
        >
          Voltar
        </a>
        <BotaoImprimir rotulo="Imprimir / Salvar PDF" />
      </div>

      <div style={{ padding: "22px 26px 40px", maxWidth: 860, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 24,
            alignItems: "flex-start",
            borderBottom: "2px solid #111",
            paddingBottom: 14,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{emitente.razao}</div>
            {emitente.fantasia && (
              <div style={{ fontSize: 13, fontWeight: 700 }}>{emitente.fantasia}</div>
            )}
            <div style={{ fontSize: 11.5, marginTop: 4 }}>
              CNPJ {emitente.cnpj}
              {emitente.ie ? ` · IE ${emitente.ie}` : ""}
            </div>
            <div style={{ fontSize: 11.5 }}>{emitente.endereco}</div>
            {emitente.telefone && <div style={{ fontSize: 11.5 }}>{emitente.telefone}</div>}
            {emitente.email && <div style={{ fontSize: 11.5 }}>{emitente.email}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.04em" }}>
              PEDIDO DE COMPRA
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{po.code}</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Emissão: {dataEmissao}
              <br />
              Previsão de chegada: {previsao}
              <br />
              Situação: {rotuloStatus[po.status] ?? po.status}
            </div>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
          <div style={{ border: "1px solid #d7dbe3", borderRadius: 8, padding: "11px 13px" }}>
            <div style={{ ...rotulo, color: "#555" }}>Fornecedor</div>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>{forn.nome}</div>
            <div style={{ fontSize: 12 }}>
              {forn.cnpj ? `CNPJ ${forn.cnpj}` : "CNPJ não informado"}
              {forn.uf ? ` · ${forn.uf}` : ""}
              {forn.pais && forn.pais !== "Brasil" ? ` · ${forn.pais}` : ""}
            </div>
            {forn.contato && <div style={{ fontSize: 12 }}>{forn.contato}</div>}
          </div>
          <div style={{ border: "1px solid #d7dbe3", borderRadius: 8, padding: "11px 13px" }}>
            <div style={{ ...rotulo, color: "#555" }}>Condições</div>
            <div style={{ fontSize: 12.5 }}>
              <strong>Origem:</strong>{" "}
              {rotuloOrigem[po.origem] ?? po.origem}
              <br />
              <strong>Condição de pagamento:</strong> {po.condicao ?? "—"}
              <br />
              <strong>Tipo:</strong>{" "}
              {po.tipo === "entrada_direta" ? "Entrada direta" : "Pedido de compra"}
              <br />
              <strong>Frete:</strong> {brl(frete)} · <strong>Desconto:</strong> {brl(desconto)}
            </div>
          </div>
        </section>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "15%" }}>SKU</th>
              <th style={th}>Descrição</th>
              <th style={{ ...th, textAlign: "right", width: "10%" }}>Qtd</th>
              <th style={{ ...th, textAlign: "right", width: "14%" }}>Custo unit.</th>
              <th style={{ ...th, textAlign: "right", width: "16%" }}>Total</th>
              <th style={{ ...th, textAlign: "right", width: "12%" }}>Recebido</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i, idx) => (
              <tr key={idx}>
                <td style={td}>{i.sku_snapshot}</td>
                <td style={td}>{i.name_snapshot}</td>
                <td style={{ ...td, textAlign: "right" }}>{i.quantity}</td>
                <td style={{ ...td, textAlign: "right" }}>{brl(Number(i.unit_cost))}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                  {brl(Number(i.line_total))}
                </td>
                <td style={{ ...td, textAlign: "right" }}>{i.qtd_recebida ?? 0}</td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td style={{ ...td, textAlign: "center", padding: 18 }} colSpan={6}>
                  Este pedido não tem itens.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
          <table style={{ borderCollapse: "collapse", minWidth: 280 }}>
            <tbody>
              <tr>
                <td style={{ ...td, border: 0, fontSize: 12.5 }}>Subtotal dos itens</td>
                <td style={{ ...td, border: 0, textAlign: "right", fontSize: 12.5 }}>
                  {brl(subtotal)}
                </td>
              </tr>
              <tr>
                <td style={{ ...td, border: 0, fontSize: 12.5 }}>Frete</td>
                <td style={{ ...td, border: 0, textAlign: "right", fontSize: 12.5 }}>
                  {brl(frete)}
                </td>
              </tr>
              <tr>
                <td style={{ ...td, border: 0, fontSize: 12.5 }}>Desconto</td>
                <td style={{ ...td, border: 0, textAlign: "right", fontSize: 12.5 }}>
                  −{brl(desconto)}
                </td>
              </tr>
              <tr>
                <td style={{ ...td, borderTop: "1.5px solid #333", fontSize: 14, fontWeight: 800 }}>
                  Total do pedido
                </td>
                <td
                  style={{
                    ...td,
                    borderTop: "1.5px solid #333",
                    textAlign: "right",
                    fontSize: 14,
                    fontWeight: 800,
                  }}
                >
                  {brl(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {po.notes && (
          <div style={{ border: "1px solid #d7dbe3", borderRadius: 8, padding: "11px 13px", marginBottom: 22 }}>
            <div style={{ ...rotulo, color: "#555" }}>Observações</div>
            <div style={{ fontSize: 12.5 }}>{po.notes}</div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 48,
            marginTop: 46,
            fontSize: 11.5,
          }}
        >
          <div style={{ borderTop: "1px solid #333", paddingTop: 6, textAlign: "center" }}>
            Emitido por {emitente.razao}
          </div>
          <div style={{ borderTop: "1px solid #333", paddingTop: 6, textAlign: "center" }}>
            De acordo — {forn.nome}
          </div>
        </div>

        <div style={{ marginTop: 26, fontSize: 10, textAlign: "center" }}>
          Documento gerado pelo sistema Nuvem de Papel · pedido {po.code} · página 1
        </div>
      </div>
    </main>
  );
}
