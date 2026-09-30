"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { criarPlano, salvarPlano } from "@/app/configuracoes/clube/actions";

type Plano = {
  id: string;
  code: string;
  name: string;
  description: string;
  price_monthly: number | string;
  discount_pct: number | string;
  free_shipping: boolean;
  gift: string;
  active: boolean;
  sort: number;
};

type Feedback = { tipo: "erro" | "sucesso"; texto: string } | null;

const INPUT: React.CSSProperties = {
  padding: "10px 12px",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "'Open Sans', sans-serif",
  background: "#FFFFFF",
  outline: "none",
  width: "100%",
};

const BTN: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 999,
  border: "none",
  background: "var(--pink-600)",
  color: "#FFFFFF",
  fontWeight: 700,
  fontSize: 13.5,
  cursor: "pointer",
};

const BTN_LINHA: React.CSSProperties = {
  ...BTN,
  background: "var(--ink, #241c2b)",
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function Campo({
  label,
  valor,
  onChange,
  type = "text",
  step,
  min,
  max,
}: {
  label: string;
  valor: string | number;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 5, fontSize: 12.5, color: "var(--ink-soft)" }}>
      {label}
      <input
        type={type}
        step={step}
        min={min}
        max={max}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        style={INPUT}
      />
    </label>
  );
}

export function ConsolePlanosClube({ planos }: { planos: Plano[] }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [rotulos, setRotulos] = useState<Record<string, Plano>>(() =>
    Object.fromEntries(planos.map((p) => [p.id, p]))
  );
  const [novo, setNovo] = useState({ code: "", name: "", price: "", discount: "", gift: "" });

  function editar(id: string, patch: Partial<Plano>) {
    setRotulos((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function salvar(p: Plano) {
    const r = rotulos[p.id];
    setFeedback(null);
    startTransition(async () => {
      const res = await salvarPlano({
        id: r.id,
        name: r.name,
        description: r.description,
        priceMonthly: Number(String(r.price_monthly).replace(",", ".")),
        discountPct: Number(String(r.discount_pct).replace(",", ".")),
        freeShipping: r.free_shipping,
        gift: r.gift,
        active: r.active,
      });
      if (res.ok) {
        setFeedback({ tipo: "sucesso", texto: `Plano "${r.name}" salvo.` });
        router.refresh();
        return;
      }
      setFeedback({ tipo: "erro", texto: res.erro });
    });
  }

  function criar() {
    setFeedback(null);
    startTransition(async () => {
      const res = await criarPlano({
        code: novo.code,
        name: novo.name,
        priceMonthly: Number(novo.price.replace(",", ".")),
        discountPct: Number(novo.discount.replace(",", ".")),
        gift: novo.gift,
      });
      if (res.ok) {
        setNovo({ code: "", name: "", price: "", discount: "", gift: "" });
        setFeedback({ tipo: "sucesso", texto: "Plano criado e ativo." });
        router.refresh();
        return;
      }
      setFeedback({ tipo: "erro", texto: res.erro });
    });
  }

  return (
    <div>
      <PageHeader titulo="Clube" subtitulo="planos mensais de assinatura" />

      {feedback && (
        <p
          role="status"
          style={{
            background: feedback.tipo === "erro" ? "#FDECEA" : "var(--blue-100, #e3f0ff)",
            color: feedback.tipo === "erro" ? "var(--red-600, #b3261e)" : "var(--blue-600, #2456a6)",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13.5,
            margin: "0 0 16px",
          }}
        >
          {feedback.texto}
        </p>
      )}

      <div style={{ display: "grid", gap: 16, marginBottom: 28 }}>
        {planos.map((p) => {
          const r = rotulos[p.id] ?? p;
          return (
            <section
              key={p.id}
              style={{
                background: "var(--bg-cloud, #fff)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: 20,
                opacity: r.active ? 1 : 0.65,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                <div>
                  <strong style={{ fontSize: 15, color: "var(--ink, #241c2b)" }}>{r.name}</strong>
                  <span style={{ fontSize: 12.5, color: "var(--ink-soft)", marginLeft: 8 }}>
                    código: {p.code} · {brl(Number(r.price_monthly))}/mês ·{" "}
                    {Number(r.discount_pct)}% de desconto
                  </span>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={r.active}
                    onChange={(e) => editar(p.id, { active: e.target.checked })}
                  />
                  {r.active ? "Ativo" : "Inativo"}
                </label>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <Campo
                  label="Nome"
                  valor={r.name}
                  onChange={(v) => editar(p.id, { name: v })}
                />
                <Campo
                  label="Preço mensal (R$)"
                  type="number"
                  step="0.01"
                  min="0.01"
                  valor={r.price_monthly}
                  onChange={(v) => editar(p.id, { price_monthly: v })}
                />
                <Campo
                  label="Desconto (%)"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  valor={r.discount_pct}
                  onChange={(v) => editar(p.id, { discount_pct: v })}
                />
                <Campo label="Brinde" valor={r.gift} onChange={(v) => editar(p.id, { gift: v })} />
              </div>

              <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                <Campo
                  label="Descrição"
                  valor={r.description}
                  onChange={(v) => editar(p.id, { description: v })}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={r.free_shipping}
                    onChange={(e) => editar(p.id, { free_shipping: e.target.checked })}
                  />
                  Frete grátis no mês
                </label>
              </div>

              <button
                type="button"
                disabled={pendente}
                onClick={() => salvar(p)}
                style={BTN_LINHA}
              >
                {pendente ? "Salvando..." : "Salvar plano"}
              </button>
            </section>
          );
        })}
      </div>

      <section
        style={{
          background: "var(--bg-cloud, #fff)",
          border: "1px dashed var(--border)",
          borderRadius: 16,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 16, margin: "0 0 14px", color: "var(--ink, #241c2b)" }}>
          Novo plano
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <Campo
            label="Código (ex.: premium)"
            valor={novo.code}
            onChange={(v) => setNovo((n) => ({ ...n, code: v }))}
          />
          <Campo
            label="Nome"
            valor={novo.name}
            onChange={(v) => setNovo((n) => ({ ...n, name: v }))}
          />
          <Campo
            label="Preço mensal (R$)"
            type="number"
            step="0.01"
            min="0.01"
            valor={novo.price}
            onChange={(v) => setNovo((n) => ({ ...n, price: v }))}
          />
          <Campo
            label="Desconto (%)"
            type="number"
            step="1"
            min="0"
            max="100"
            valor={novo.discount}
            onChange={(v) => setNovo((n) => ({ ...n, discount: v }))}
          />
          <Campo
            label="Brinde"
            valor={novo.gift}
            onChange={(v) => setNovo((n) => ({ ...n, gift: v }))}
          />
        </div>
        <button type="button" disabled={pendente} onClick={criar} style={BTN}>
          {pendente ? "Criando..." : "Criar plano"}
        </button>
      </section>
    </div>
  );
}
