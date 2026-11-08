import { getCrmSummary } from "@/lib/crm";
import { PageHeader } from "@/components/admin/PageHeader";
import { PainelBanners } from "@/components/admin/PainelBanners";

export const dynamic = "force-dynamic";

// Home do painel — console de balcao (entrega 8): 4 indicadores vivos,
// tile dominante "Efetuar venda" com o estado do caixa, grade de modulos
// com badge de estado, banners colapsaveis e faixa de status. H1 so com a
// sigla "CRM" e sem subtitulo (pedido do cliente 20/10); a faixa de acoes
// rapidas tambem saiu. Contratos E2E preservados: heading "CRM" + Voltar,
// nenhum <footer> na pagina (o rodapé so existe na loja publica) e o menu
// lateral continua sendo o AdminShell.

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatHora(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const STATUS_LABEL: Record<string, string> = {
  entregue: "Entregue",
  em_rota: "Em rota",
  processando: "Processando",
  cancelado: "Cancelado",
  aguardando_pagamento: "Aguardando pgto",
  pago: "Pago",
};

const STATUS_COLOR: Record<string, string> = {
  entregue: "var(--pink-600)",
  em_rota: "var(--navy)",
  processando: "var(--lilac-600)",
  cancelado: "var(--ink-faint)",
  aguardando_pagamento: "var(--ink-soft)",
  pago: "var(--navy)",
};

// Nota: --pink-600 e o accent corporativo (rosa) — nome mantido por
// compatibilidade com globals.css (ver rebrand 2026-09-23).

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  ouro: { bg: "var(--pink-100)", color: "var(--pink-600)" },
  diamante: { bg: "var(--lilac-100)", color: "var(--lilac-600)" },
  prata: { bg: "var(--blue-100)", color: "var(--blue-600)" },
  bronze: { bg: "var(--bg-cloud)", color: "var(--ink-soft)" },
};

const ICO = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const ICO_GRANDE = { ...ICO, width: 24, height: 24, strokeWidth: 1.7 } as const;

const ICONES = {
  caixa: (
    <>
      <rect x="3" y="9" width="18" height="11" rx="2" />
      <path d="M7 9V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" />
      <path d="M8 14h.01M12 14h.01M16 14h.01" />
    </>
  ),
  recibo: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 5" />
      <path d="M17.5 14.5A6.5 6.5 0 0 1 21.5 20" />
    </>
  ),
  pacote: (
    <>
      <path d="M12 2.5 3.5 7v10L12 21.5 20.5 17V7z" />
      <path d="M3.5 7 12 11.5 20.5 7" />
      <path d="M12 11.5v10" />
    </>
  ),
  caminhao: (
    <>
      <path d="M2.5 6h11.5v10H2.5z" />
      <path d="M14 9.5h3.6L21.5 13v3H14" />
      <circle cx="7" cy="18.5" r="2" />
      <circle cx="17.5" cy="18.5" r="2" />
    </>
  ),
  carteira: (
    <>
      <rect x="2.5" y="6" width="19" height="13.5" rx="2.5" />
      <path d="M2.5 10.5h19" />
      <circle cx="17.5" cy="15" r="1.3" />
    </>
  ),
  lembrete: (
    <>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  documento: (
    <>
      <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
      <path d="M14 2.5V8h5.5" />
      <path d="M12 11v6M9.5 14.5h5" />
    </>
  ),
  conciliacao: (
    <>
      <path d="M4 8.5h13m0 0-3-3m3 3-3 3" />
      <path d="M20 15.5H7m0 0 3-3m-3 3 3 3" />
    </>
  ),
  carrinho: (
    <>
      <circle cx="9.5" cy="19.5" r="1.6" />
      <circle cx="17.5" cy="19.5" r="1.6" />
      <path d="M2.5 3.5h3l2.5 11.5h10L21 7H6" />
    </>
  ),
  megafone: (
    <>
      <path d="M3.5 10.5v3A1.5 1.5 0 0 0 5 15h2l7 4V5l-7 4H5a1.5 1.5 0 0 0-1.5 1.5z" />
      <path d="M17.5 8.5a5 5 0 0 1 0 7" />
    </>
  ),
  carta: (
    <>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  globo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.8 3 2.8 15 0 18-2.8-3-2.8-15 0-18z" />
    </>
  ),
  envelope: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 7 12 13l9.5-6" />
    </>
  ),
} as const;

type Tom = "ok" | "info" | "atencao";

type Tile = {
  href: string;
  nome: string;
  desc: string;
  ico: keyof typeof ICONES;
  badge?: { txt: string; tom: Tom };
};

const CARD = {
  background: "#fff",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
} as const;

export default async function CrmPage() {
  const data = await getCrmSummary();
  const maxStatusCount = Math.max(1, ...data.pedidosPorStatus.map((s) => s.count));

  const agora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date()
  );
  const deltaOntem =
    data.vendasHoje.totalOntem > 0
      ? Math.round(
          ((data.vendasHoje.total - data.vendasHoje.totalOntem) / data.vendasHoje.totalOntem) * 100
        )
      : null;

  const indicadores: {
    lbl: string;
    val: string;
    sub: string;
    pill?: { txt: string; tom: Tom };
  }[] = [
    {
      lbl: "Vendas hoje",
      val: formatBRL(data.vendasHoje.total),
      sub: `${data.vendasHoje.pedidos} pedidos · mês ${formatBRL(data.receitaMes)} · ticket ${formatBRL(data.ticketMedio)}`,
      pill:
        deltaOntem !== null
          ? { txt: `${deltaOntem >= 0 ? "+" : ""}${deltaOntem}% vs ontem`, tom: deltaOntem >= 0 ? "ok" : "atencao" }
          : undefined,
    },
    {
      lbl: "A receber — 7 dias",
      val: formatBRL(data.receber7d.valor),
      sub: `${data.receber7d.qtd} títulos · vencidos ${formatBRL(data.vencidos.valor)} (${data.vencidos.qtd})`,
      pill:
        data.vencidos.qtd > 0
          ? { txt: "vencidos", tom: "atencao" }
          : { txt: "em dia", tom: "ok" },
    },
    {
      lbl: "Expedição e estoque",
      val: `${data.entregas.abertas} entregas`,
      sub: `${data.entregas.prazoHoje} com prazo hoje · ${data.estoque.semSaldo} SKUs sem saldo${
        data.estoque.baixo > 0 ? ` · ${data.estoque.baixo} no mínimo` : ""
      }`,
      pill:
        data.estoque.semSaldo > 0
          ? { txt: "sem saldo", tom: "atencao" }
          : data.entregas.abertas > 0
            ? { txt: "em aberto", tom: "info" }
            : undefined,
    },
    {
      lbl: "Clientes",
      val: String(data.clientesAtivos),
      sub: `${data.novosClientesMes} novos no mês · ${data.novosClientesSemana} na semana`,
    },
  ];

  const tiles: Tile[] = [
    {
      href: "/vendas",
      nome: "Vendas",
      desc: "Pedidos, recuperação e conversão",
      ico: "recibo",
      badge: data.vendasHoje.pedidos > 0 ? { txt: `${data.vendasHoje.pedidos} hoje`, tom: "ok" } : undefined,
    },
    {
      href: "/configuracoes/cadastro?tela=cliente",
      nome: "Clientes",
      desc: `${data.clientesAtivos} ativos · cadastros e situação`,
      ico: "usuarios",
    },
    {
      href: "/produtos",
      nome: "Catálogo",
      desc: `${data.skusAtivos} SKUs · preços e etiquetas`,
      ico: "pacote",
    },
    {
      href: "/logistica",
      nome: "Logística",
      desc: "Entregas, estoque e transportadora",
      ico: "caminhao",
      badge: data.entregas.abertas > 0 ? { txt: `${data.entregas.abertas} abertas`, tom: "info" } : undefined,
    },
    {
      href: "/financeiro",
      nome: "Financeiro",
      desc: "A pagar, a receber e diário",
      ico: "carteira",
      badge: data.vencidos.qtd > 0 ? { txt: `${data.vencidos.qtd} vencidos`, tom: "atencao" } : undefined,
    },
    {
      href: "/financeiro/cobranca",
      nome: "Cobrança",
      desc: "Régua de lembretes automáticos",
      ico: "lembrete",
    },
    {
      href: "/financeiro/despesas",
      nome: "Despesas",
      desc: "Contas a pagar e rateio",
      ico: "documento",
    },
    {
      href: "/financeiro/conciliacao",
      nome: "Conciliação",
      desc: "Extratos bancários e lançamentos",
      ico: "conciliacao",
    },
    {
      href: "/compras",
      nome: "Compras",
      desc: "Cotações e pedidos de compra",
      ico: "carrinho",
    },
    {
      href: "/crm/marketing",
      nome: "Marketing",
      desc: "Campanhas e reativação",
      ico: "megafone",
      badge: { txt: "IA", tom: "ok" },
    },
    {
      href: "/crm/carta",
      nome: "Carta com IA",
      desc: "Insights do negócio",
      ico: "carta",
      badge: { txt: "IA", tom: "ok" },
    },
    {
      href: "/publicacoes",
      nome: "Publicações",
      desc: "Materiais e conteúdo da loja",
      ico: "globo",
    },
    {
      href: "/email",
      nome: "E-mail",
      desc: "Caixa de e-mail da loja",
      ico: "envelope",
    },
  ];

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 32px 40px" }}>
      <PageHeader titulo="CRM" subtitulo={null} voltarPara="/" />

      <section className="painel-stats" aria-label="Indicadores do negócio">
        {indicadores.map((ind) => (
          <div key={ind.lbl} className="painel-stat">
            {ind.pill && (
              <span className={`painel-pill painel-pill--${ind.pill.tom}`}>{ind.pill.txt}</span>
            )}
            <div className="painel-stat-lbl">{ind.lbl}</div>
            <div className="painel-stat-val">{ind.val}</div>
            <div className="painel-stat-sub">{ind.sub}</div>
          </div>
        ))}
      </section>

      <section className="painel-grid" aria-label="Módulos do sistema">
        <div className="painel-tile painel-tile--destaque">
          <div>
            <span className="painel-ico painel-ico--claro">
              <svg {...ICO_GRANDE}>{ICONES.caixa}</svg>
            </span>
            <h2>Efetuar venda</h2>
            <p>
              PDV com caixa aberto ou venda de telefone/balcão — PF ou PJ, entrega ou retirada,
              todas as formas de pagamento.
            </p>
            <span
              className={
                data.caixa.aberto ? "painel-chip painel-chip--aberto" : "painel-chip painel-chip--fechado"
              }
            >
              <span className="painel-dot" />
              {data.caixa.aberto
                ? data.caixa.desde
                  ? `Caixa aberto desde ${formatHora(data.caixa.desde)}`
                  : "Caixa aberto"
                : "Caixa fechado"}
            </span>
          </div>
          <div className="painel-destaque-acoes">
            <a className="painel-btn painel-btn--pink" href="/pdv" aria-label="Abrir PDV">
              Abrir PDV
            </a>
            <a
              className="painel-btn painel-btn--ghost"
              href="/vendas/nova"
              aria-label="Nova venda de telefone ou balcão"
            >
              Venda balcão/telefone
            </a>
          </div>
        </div>

        {tiles.map((t) => (
          <a key={t.href} className="painel-tile" href={t.href}>
            {t.badge && (
              <span className={`painel-badge painel-badge--${t.badge.tom}`}>{t.badge.txt}</span>
            )}
            <span className="painel-ico">
              <svg {...ICO}>{ICONES[t.ico]}</svg>
            </span>
            <strong>{t.nome}</strong>
            <small>{t.desc}</small>
          </a>
        ))}
      </section>

      <PainelBanners />

      <div className="painel-cards">
        <div style={{ ...CARD, padding: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>Clientes recentes</h2>
          {data.clientesRecentes.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
              Nenhum pedido registrado ainda.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    color: "var(--ink-soft)",
                    fontSize: 12,
                    textTransform: "uppercase",
                  }}
                >
                  <th style={{ paddingBottom: 12 }}>Cliente</th>
                  <th style={{ paddingBottom: 12 }}>Nível</th>
                  <th style={{ paddingBottom: 12, textAlign: "center" }}>Pedidos</th>
                  <th style={{ paddingBottom: 12, textAlign: "right" }}>Total gasto</th>
                </tr>
              </thead>
              <tbody>
                {data.clientesRecentes.map((c) => {
                  const tier = TIER_STYLE[c.tier] ?? TIER_STYLE.bronze;
                  return (
                    <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 0", fontWeight: 600, color: "var(--ink)" }}>
                        {c.name}
                      </td>
                      <td style={{ padding: "12px 0" }}>
                        <span
                          style={{
                            background: tier.bg,
                            color: tier.color,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "3px 10px",
                            borderRadius: "var(--radius-chip)",
                          }}
                        >
                          {c.tier}
                        </span>
                      </td>
                      <td style={{ padding: "12px 0", textAlign: "center", color: "var(--ink-soft)" }}>
                        {c.pedidos}
                      </td>
                      <td
                        style={{
                          padding: "12px 0",
                          textAlign: "right",
                          fontWeight: 700,
                          color: "var(--ink)",
                        }}
                      >
                        {formatBRL(c.totalGasto)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ ...CARD, padding: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>
            Pedidos por status
          </h2>
          {data.pedidosPorStatus.map((s) => (
            <div key={s.status} style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  marginBottom: 4,
                }}
              >
                <span>{STATUS_LABEL[s.status] ?? s.status}</span>
                <span style={{ color: "var(--ink-soft)", fontWeight: 700 }}>{s.count}</span>
              </div>
              <div
                style={{ background: "var(--bg-cloud)", height: 8, borderRadius: 999, overflow: "hidden" }}
              >
                <div
                  style={{
                    width: `${(s.count / maxStatusCount) * 100}%`,
                    background: STATUS_COLOR[s.status] ?? "var(--ink-faint)",
                    height: "100%",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <section style={{ marginTop: 8 }}>
        <h2 style={{ fontSize: 18, marginBottom: 16, color: "var(--ink)" }}>Campanhas ativas</h2>
        {data.campanhasAtivas.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            Nenhuma campanha ativa ou agendada.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {data.campanhasAtivas.map((c) => (
              <div key={c.id} style={{ ...CARD, padding: 20 }}>
                <span
                  style={{
                    background: c.status === "ativa" ? "var(--blue-100)" : "var(--lilac-100)",
                    color: c.status === "ativa" ? "var(--blue-600)" : "var(--lilac-600)",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "var(--radius-chip)",
                  }}
                >
                  {c.status === "ativa" ? "Ativa" : "Agendada"}
                </span>
                <h3 style={{ fontWeight: 700, fontSize: 15, margin: "10px 0 6px", color: "var(--ink)" }}>
                  {c.name}
                </h3>
                {c.info ? <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>{c.info}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* faixa de status do console — NAO usar <footer>: o E2E exige a
          pagina sem rodapé (o rodapé pertence só à loja pública). */}
      <div className="painel-status" aria-label="Situação do painel">
        <span>
          Atualizado às <b>{agora}</b>
        </span>
        <span>
          Caixa:{" "}
          <b>
            {data.caixa.aberto
              ? data.caixa.desde
                ? `aberto desde ${formatHora(data.caixa.desde)}`
                : "aberto"
              : "fechado"}
          </b>
        </span>
        <span>
          Vendas hoje: <b>{data.vendasHoje.pedidos}</b>
        </span>
        <span>
          Base: <b>dado real do Supabase</b>
        </span>
      </div>
    </main>
  );
}
