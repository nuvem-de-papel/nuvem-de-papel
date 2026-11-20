import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NUVEM_DE_PAPEL_TENANT_ID } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha conta — Nuvem de Papel" };

// Inicio da conta (20/11/2026, proposta "Contas do Cliente" aprovada): KPIs,
// gasto por mes (SVG no servidor) e, para assinante, nivel + economia do Clube.
// Sem migration: le orders (RLS do proprio usuario), customers e club_*.
const FATURADO = ["pago", "processando", "em_rota", "entregue"];
const NIVEIS = [
  { k: "bronze", r: "Bronze", min: 0 },
  { k: "prata", r: "Prata", min: 500 },
  { k: "ouro", r: "Ouro", min: 1500 },
  { k: "diamante", r: "Diamante", min: 3000 },
];
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type Ped = { id: string; status: string; total_amount: number | string; discount_amount: number | string | null; created_at: string };

export default async function ContaInicio() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/conta");

  const admin = createAdminClient();
  const [{ data: peds }, { data: cli }, { data: ass }] = await Promise.all([
    supabase.from("orders").select("id, status, total_amount, discount_amount, created_at").order("created_at", { ascending: false }).limit(500),
    admin.from("customers").select("tier, points").eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID).eq("auth_user_id", user.id).maybeSingle(),
    admin.from("club_subscriptions").select("status, current_period_end, club_plans (name, discount_pct)")
      .eq("tenant_id", NUVEM_DE_PAPEL_TENANT_ID).eq("profile_id", user.id).in("status", ["ativa", "pendente"]).maybeSingle(),
  ]);

  const pedidos = (peds ?? []) as Ped[];
  const ano = new Date().getFullYear();
  const fat = pedidos.filter((p) => FATURADO.includes(p.status));
  const doAno = fat.filter((p) => new Date(p.created_at).getFullYear() === ano);
  const gasto = doAno.reduce((s, p) => s + Number(p.total_amount), 0);
  const economia = doAno.reduce((s, p) => s + Number(p.discount_amount ?? 0), 0);
  const andamento = pedidos.filter((p) => ["pago", "processando", "em_rota"].includes(p.status)).length;

  // 6 meses, mes zerado aparece
  const hoje = new Date();
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 5 + i, 1);
    const v = fat
      .filter((p) => { const c = new Date(p.created_at); return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth(); })
      .reduce((s, p) => s + Number(p.total_amount), 0);
    return { r: MES[d.getMonth()], v };
  });
  const max = Math.max(1, ...meses.map((m) => m.v));

  const planoRaw = (ass as { club_plans?: { name: string; discount_pct: number } | { name: string; discount_pct: number }[] } | null)?.club_plans;
  const plano = Array.isArray(planoRaw) ? planoRaw[0] : planoRaw;
  const ativa = (ass as { status?: string } | null)?.status === "ativa";
  const renova = (ass as { current_period_end?: string | null } | null)?.current_period_end;
  const pontos = Number(cli?.points ?? 0);
  const nivel = NIVEIS.find((n) => n.k === cli?.tier) ?? NIVEIS[0];
  const prox = NIVEIS.find((n) => n.min > pontos);
  const pct = Math.min(100, (pontos / 3000) * 100);

  return (
    <main className="conta-pagina conta-inicio">
      {plano && (
        <section className="conta-secao" aria-label="Nível do Clube">
          <h2>Nível {nivel.r} · {pontos.toLocaleString("pt-BR")} pontos</h2>
          <div className="inicio-meter" role="img" aria-label={`${pontos} de 3000 pontos`}><i style={{ width: `${pct}%` }} /></div>
          <div className="inicio-niveis">{NIVEIS.map((n) => <span key={n.k} className={n.k === nivel.k ? "on" : ""}>{n.r} {n.min}</span>)}</div>
          {prox && <p className="inicio-sub">Faltam {(prox.min - pontos).toLocaleString("pt-BR")} pontos para {prox.r}.</p>}
        </section>
      )}

      <section className="inicio-kpis" aria-label="Resumo da conta">
        <div><small>Pedidos no ano</small><b>{doAno.length}</b></div>
        <div><small>Em andamento</small><b>{andamento}</b></div>
        <div><small>{plano ? "Economia do Clube" : "Gasto no ano"}</small><b>{brl(plano ? economia : gasto)}</b></div>
        <div><small>{plano ? "Renova em" : "Ticket médio"}</small><b>{plano ? (renova ? new Date(renova).toLocaleDateString("pt-BR") : "—") : brl(doAno.length ? gasto / doAno.length : 0)}</b></div>
      </section>

      <div className="inicio-cols">
        <section className="conta-secao" aria-label="Gasto por mês">
          <h2>Gasto por mês</h2>
          <svg viewBox="0 0 300 130" role="img" aria-label={meses.map((m) => `${m.r} ${brl(m.v)}`).join(", ")}>
            {meses.map((m, i) => {
              const h = Math.max(2, (m.v / max) * 90);
              return <rect key={i} x={20 + i * 45} y={110 - h} width="30" height={h} rx="3" fill={i === 5 ? "#E084AC" : "#073B4C"} />;
            })}
            <line x1="12" y1="110" x2="290" y2="110" stroke="#C9C9C9" />
            {meses.map((m, i) => <text key={i} x={25 + i * 45} y="125" fontSize="11" fill="#4F6670">{m.r}</text>)}
          </svg>
        </section>

        {plano ? (
          <section className="inicio-clube" aria-label="Meu Clube">
            <b>Clube {plano.name} · {Number(plano.discount_pct)}%</b>
            <p>{ativa ? "Desconto aplicado no checkout." : "Assinatura aguardando pagamento."}</p>
            <Link href="/conta/assinatura" className="inicio-clube-botao">Gerenciar assinatura</Link>
          </section>
        ) : (
          <section className="conta-secao" aria-label="Convite ao Clube">
            <h2>Clube de assinantes</h2>
            <p className="inicio-sub">Com o plano Papel você teria economizado <b>{brl(gasto * 0.05)}</b> este ano (5%).</p>
            <Link href="/clube" className="conta-botao">Conhecer o Clube</Link>
          </section>
        )}
      </div>

      <section className="conta-secao" aria-label="Pedidos recentes">
        <h2>Pedidos recentes</h2>
        {pedidos.length === 0 ? <p className="inicio-sub">Nenhum pedido ainda.</p> : (
          <ul className="inicio-pedidos">
            {pedidos.slice(0, 3).map((p) => (
              <li key={p.id}><span>{p.id.slice(0, 8).toUpperCase()} · {new Date(p.created_at).toLocaleDateString("pt-BR")}</span><strong>{brl(Number(p.total_amount))}</strong></li>
            ))}
          </ul>
        )}
        <Link href="/conta/pedidos" className="conta-botao-sec">Ver todos e acompanhar</Link>
      </section>
    </main>
  );
}
