"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { gerarCartaAgora } from "@/app/crm/carta/actions";

export type CartaLinha = {
  id: string;
  tipo: string;
  periodoInicio: string;
  periodoFim: string;
  status: string;
  criadaEm: string;
  texto: {
    resumo: string;
    melhorou: string[];
    piorou: string[];
    atencao: string[];
    faltam_dados: string[];
    acoes: { texto: string; prazo: string }[];
  };
};

const CARD: CSSProperties = {
  background: "var(--bg-cloud)",
  border: "1px solid var(--ink-faint)",
  borderRadius: "var(--radius-card)",
  padding: 24,
  boxShadow: "var(--shadow-card)",
};
const BOTAO: CSSProperties = {
  background: "var(--navy)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 999,
  padding: "10px 18px",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const ddmm = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

function Secao({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{titulo}</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {itens.map((i, idx) => (
          <li key={idx} style={{ fontSize: 14, lineHeight: 1.5, margin: "2px 0" }}>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Carta({ carta }: { carta: CartaLinha }) {
  const t = carta.texto;
  const incompleta = carta.status !== "completa";
  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {carta.tipo === "mensal" ? "Carta do mês" : "Carta da semana"} — {ddmm(carta.periodoInicio)} a {ddmm(carta.periodoFim)}
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "2px 10px",
            borderRadius: 999,
            background: incompleta ? "var(--pink-600)" : "var(--blue-600)",
            color: "#FFFFFF",
          }}
        >
          {incompleta ? "Incompleta" : "Completa"}
        </span>
      </div>
      <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, marginTop: 10 }}>{t.resumo}</p>
      <Secao titulo="O que melhorou" itens={t.melhorou} />
      <Secao titulo="O que piorou" itens={t.piorou} />
      <Secao titulo="Atenção" itens={t.atencao} />
      <Secao titulo="Faltam dados" itens={t.faltam_dados} />
      {t.acoes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Para fazer</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {t.acoes.map((a, idx) => (
              <li key={idx} style={{ fontSize: 14, lineHeight: 1.5, margin: "2px 0" }}>
                {a.texto} <span style={{ color: "var(--ink-soft)" }}>({a.prazo})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ConsoleCarta({ cartas }: { cartas: CartaLinha[] }) {
  const router = useRouter();
  const [pend, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  function gerar(tipo: "semanal" | "mensal") {
    // msg FORA do startTransition de propósito: dentro dele o React segura o
    // render até a action terminar — aí o "Gerando..." nunca aparece na tela
    // (feedback morto até dezenas de segundos). Urgente = aparece na hora.
    setMsg({
      tipo: "ok",
      texto: tipo === "mensal" ? "Gerando a carta do mês..." : "Gerando a carta da semana...",
    });
    startTransition(async () => {
      const r = await gerarCartaAgora(tipo);
      if (r.ok) {
        setMsg({ tipo: "ok", texto: r.msg });
        router.refresh();
      } else {
        setMsg({ tipo: "err", texto: r.erro });
      }
    });
  }

  return (
    <main>
      <PageHeader
        titulo="Carta com IA"
        subtitulo="Resumo do período gerado pela IA sobre os números reais do painel — ela só escreve, os cálculos são do sistema."
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <button data-testid="btn-gerar-semanal" style={BOTAO} onClick={() => gerar("semanal")} disabled={pend}>
          {pend ? "Gerando..." : "Gerar carta da semana"}
        </button>
        <button
          data-testid="btn-gerar-mensal"
          style={{ ...BOTAO, background: "var(--pink-600)" }}
          onClick={() => gerar("mensal")}
          disabled={pend}
        >
          {pend ? "Gerando..." : "Gerar carta do mês"}
        </button>
      </div>

      {msg && (
        <div
          role="status"
          className="carta-feed"
          style={{
            ...CARD,
            padding: "12px 16px",
            marginBottom: 18,
            borderLeft: `4px solid ${msg.tipo === "ok" ? "var(--blue-600)" : "var(--pink-600)"}`,
          }}
        >
          {msg.texto}
        </div>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {cartas.length === 0 ? (
          <div style={CARD}>
            <p style={{ margin: 0, color: "var(--ink-soft)" }}>
              Nenhuma carta gerada ainda. Clique em <strong>Gerar carta da semana</strong> para ver a primeira.
            </p>
          </div>
        ) : (
          cartas.map((c) => <Carta key={c.id} carta={c} />)
        )}
      </div>
    </main>
  );
}
