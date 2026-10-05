"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { removerPreco, salvarPreco } from "@/app/configuracoes/precos/actions";

type Canais = "varejo" | "atacado";

type LinhaPreco = {
  channel: string;
  min_quantity: number;
  price: number | string;
  valid_from: string | null;
  valid_until: string | null;
};

type ProdutoPreco = {
  id: string;
  sku: string;
  name: string;
  active: boolean;
  precos: LinhaPreco[];
};

type Feedback = { tipo: "erro" | "sucesso"; texto: string } | null;

type EstadoForm = {
  itemId: string;
  channel: Canais;
  minQuantity: string;
  price: string;
  validFrom: string;
  validUntil: string;
  origem: { channel: Canais; minQuantity: number } | null;
};

const CARD: React.CSSProperties = {
  background: "var(--bg-cloud, #fff)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
};

const INPUT: React.CSSProperties = {
  padding: "10px 12px",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "'Open Sans', sans-serif",
  background: "#FFFFFF",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
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

const TH: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--ink-soft)",
  padding: "10px 10px",
  borderBottom: "1px solid var(--border)",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const TD: React.CSSProperties = {
  fontSize: 13.5,
  padding: "11px 10px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
  color: "var(--ink)",
};

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function dataBR(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function situacao(r: LinhaPreco): { rotulo: string; bg: string; fg: string } {
  const agora = Date.now();
  const ini = r.valid_from ? Date.parse(r.valid_from) : 0;
  const fim = r.valid_until ? Date.parse(r.valid_until) : Number.POSITIVE_INFINITY;
  if (ini > agora) return { rotulo: "Futura", bg: "#FEF3C7", fg: "#92400E" };
  if (fim <= agora) return { rotulo: "Vencida", bg: "#E5E7EB", fg: "#374151" };
  return { rotulo: "Vigente", bg: "#DCFCE7", fg: "#166534" };
}

function Campo({
  label,
  aria,
  valor,
  onChange,
  type = "text",
  step,
  min,
}: {
  label: string;
  aria: string;
  valor: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  min?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 5, fontSize: 12.5, color: "var(--ink-soft)" }}>
      {label}
      <input
        type={type}
        step={step}
        min={min}
        value={valor}
        aria-label={aria}
        onChange={(e) => onChange(e.target.value)}
        style={INPUT}
      />
    </label>
  );
}

export function ConsolePrecos({
  produtos,
  erro,
}: {
  produtos: ProdutoPreco[];
  erro?: string | null;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(
    erro ? { tipo: "erro", texto: erro } : null
  );
  const [filtro, setFiltro] = useState("");
  const [form, setForm] = useState<EstadoForm>({
    itemId: produtos[0]?.id ?? "",
    channel: "varejo",
    minQuantity: "1",
    price: "",
    validFrom: hoje(),
    validUntil: "",
    origem: null,
  });

  const linhas = useMemo(() => {
    const saida: { chave: string; produto: ProdutoPreco; linha: LinhaPreco }[] = [];
    for (const p of produtos) {
      for (const r of p.precos) {
        saida.push({
          chave: `${p.id}-${r.channel}-${r.min_quantity}-${r.valid_from ?? ""}`,
          produto: p,
          linha: r,
        });
      }
    }
    return saida;
  }, [produtos]);

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter(
      (x) =>
        x.produto.sku.toLowerCase().includes(q) ||
        x.produto.name.toLowerCase().includes(q) ||
        x.linha.channel.includes(q)
    );
  }, [linhas, filtro]);

  const semPreco = produtos.filter((p) => p.precos.length === 0);
  const produtoDoForm = produtos.find((p) => p.id === form.itemId) ?? null;

  function trocar(patch: Partial<EstadoForm>) {
    setForm((f) => ({ ...f, ...patch }));
    setFeedback(null);
  }

  function editar(produto: ProdutoPreco, linha: LinhaPreco) {
    const canal: Canais = linha.channel === "atacado" ? "atacado" : "varejo";
    setForm({
      itemId: produto.id,
      channel: canal,
      minQuantity: String(linha.min_quantity),
      price: String(Number(linha.price)),
      validFrom: linha.valid_from ? linha.valid_from.slice(0, 10) : hoje(),
      validUntil: linha.valid_until ? linha.valid_until.slice(0, 10) : "",
      origem: { channel: canal, minQuantity: linha.min_quantity },
    });
    setFeedback(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function salvar() {
    setFeedback(null);
    if (!form.itemId) {
      setFeedback({ tipo: "erro", texto: "Escolha um produto." });
      return;
    }
    const faixa = Number(form.minQuantity);
    const preco = Number(form.price.replace(",", "."));
    if (!Number.isInteger(faixa) || faixa < 1) {
      setFeedback({
        tipo: "erro",
        texto: "Faixa mínima precisa ser um número inteiro a partir de 1.",
      });
      return;
    }
    if (!Number.isFinite(preco) || preco < 0) {
      setFeedback({ tipo: "erro", texto: "Informe um preço válido." });
      return;
    }
    if (!form.validFrom) {
      setFeedback({ tipo: "erro", texto: "Informe o início da vigência." });
      return;
    }
    startTransition(async () => {
      const res = await salvarPreco({
        itemId: form.itemId,
        channel: form.channel,
        minQuantity: faixa,
        price: preco,
        validFrom: form.validFrom,
        validUntil: form.validUntil,
        origem: form.origem,
      });
      if (res.ok) {
        setFeedback({ tipo: "sucesso", texto: "Faixa de preço salva." });
        setForm((f) => ({
          ...f,
          minQuantity: "1",
          price: "",
          validFrom: hoje(),
          validUntil: "",
          origem: null,
        }));
        router.refresh();
        return;
      }
      setFeedback({ tipo: "erro", texto: res.erro });
    });
  }

  function remover(produto: ProdutoPreco, linha: LinhaPreco) {
    const canal: Canais = linha.channel === "atacado" ? "atacado" : "varejo";
    const ok = window.confirm(
      `Remover a faixa ${linha.min_quantity} de ${produto.sku} no canal ${linha.channel}?`
    );
    if (!ok) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await removerPreco({
        itemId: produto.id,
        channel: canal,
        minQuantity: linha.min_quantity,
      });
      if (res.ok) {
        setFeedback({ tipo: "sucesso", texto: "Faixa removida." });
        router.refresh();
        return;
      }
      setFeedback({ tipo: "erro", texto: res.erro });
    });
  }

  return (
    <div>
      <PageHeader
        titulo="Tabela de preços"
        subtitulo={`${produtos.length} produtos · ${linhas.length} faixas`}
        voltarPara="/configuracoes/cadastro"
      />

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

      <section style={{ ...CARD, marginBottom: 22 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 14px", color: "var(--ink, #241c2b)" }}>
          {form.origem
            ? `Editando faixa ${form.origem.minQuantity} de ${produtoDoForm?.sku ?? ""} (${form.origem.channel})`
            : "Nova faixa de preço"}
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <label style={{ display: "grid", gap: 5, fontSize: 12.5, color: "var(--ink-soft)" }}>
            Produto
            <select
              aria-label="Produto da faixa"
              value={form.itemId}
              onChange={(e) => trocar({ itemId: e.target.value })}
              style={INPUT}
            >
              <option value="">Selecione o produto</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} - {p.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 5, fontSize: 12.5, color: "var(--ink-soft)" }}>
            Canal
            <select
              aria-label="Canal da faixa"
              value={form.channel}
              onChange={(e) => trocar({ channel: e.target.value as Canais })}
              style={INPUT}
            >
              <option value="varejo">varejo</option>
              <option value="atacado">atacado</option>
            </select>
          </label>

          <Campo
            label="Faixa mín. (unidades)"
            aria="Faixa minima"
            type="number"
            min="1"
            valor={form.minQuantity}
            onChange={(v) => trocar({ minQuantity: v })}
          />
          <Campo
            label="Preço (R$)"
            aria="Preco da faixa"
            type="number"
            step="0.01"
            min="0"
            valor={form.price}
            onChange={(v) => trocar({ price: v })}
          />
          <Campo
            label="Início da vigência"
            aria="Inicio da vigencia"
            type="date"
            valor={form.validFrom}
            onChange={(v) => trocar({ validFrom: v })}
          />
          <Campo
            label="Fim da vigência (opcional)"
            aria="Fim da vigencia"
            type="date"
            valor={form.validUntil}
            onChange={(v) => trocar({ validUntil: v })}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            aria-label="Salvar faixa de preco"
            disabled={pendente}
            onClick={salvar}
            style={{ ...BTN, opacity: pendente ? 0.6 : 1 }}
          >
            {pendente ? "Salvando..." : form.origem ? "Salvar alterações" : "Criar faixa"}
          </button>
          {form.origem && (
            <button
              type="button"
              aria-label="Cancelar edicao da faixa"
              disabled={pendente}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  minQuantity: "1",
                  price: "",
                  validFrom: hoje(),
                  validUntil: "",
                  origem: null,
                }))
              }
              style={{ ...BTN, background: "var(--ink, #241c2b)" }}
            >
              Cancelar
            </button>
          )}
        </div>

        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "14px 0 0", lineHeight: 1.6 }}>
          <strong>Uma linha por canal e por faixa.</strong> Ao salvar, as outras linhas da mesma
          faixa são substituídas - o sistema só é capaz de escolher um preço por faixa. O{" "}
          <strong>PDV</strong> usa a menor faixa ativa e ignora a data; o <strong>checkout</strong>{" "}
          usa a maior faixa compatível com a quantidade; a <strong>loja</strong> mostra a primeira
          linha da menor faixa ativa. Vigência futura ou vencida deixa o produto{" "}
          <strong>sem preço</strong> naquele canal.
        </p>
      </section>

      {semPreco.length > 0 && (
        <p
          role="status"
          style={{
            background: "#FFF7ED",
            color: "#9A3412",
            border: "1px solid #FED7AA",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
            margin: "0 0 18px",
          }}
        >
          {semPreco.length} produto{semPreco.length > 1 ? "s" : ""} ainda{" "}
          {semPreco.length > 1 ? "estão" : "está"} sem nenhuma faixa de preço e{" "}
          {semPreco.length > 1 ? "não aparecem" : "não aparece"} no checkout:{" "}
          {semPreco
            .slice(0, 8)
            .map((p) => p.sku)
            .join(", ")}
          {semPreco.length > 8 ? ` e mais ${semPreco.length - 8}` : ""}.
        </p>
      )}

      <section style={CARD}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0, color: "var(--ink, #241c2b)" }}>
            Faixas cadastradas ({filtradas.length})
          </h2>
          <input
            aria-label="Filtrar por SKU ou nome"
            placeholder="Filtrar por SKU ou nome"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            style={{ ...INPUT, maxWidth: 280 }}
          />
        </div>

        {filtradas.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: "8px 0 0" }}>
            Nenhuma faixa por aqui - cadastre a primeira no formulário acima.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Produto</th>
                  <th style={TH}>Canal</th>
                  <th style={{ ...TH, textAlign: "right" }}>Faixa mín.</th>
                  <th style={{ ...TH, textAlign: "right" }}>Preço</th>
                  <th style={TH}>Início</th>
                  <th style={TH}>Fim</th>
                  <th style={TH}>Situação</th>
                  <th style={{ ...TH, textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(({ chave, produto, linha }) => {
                  const st = situacao(linha);
                  const canal = linha.channel === "atacado" ? "atacado" : "varejo";
                  const faixa = linha.min_quantity;
                  return (
                    <tr key={chave} style={{ opacity: produto.active ? 1 : 0.6 }}>
                      <td style={TD}>
                        <strong style={{ fontSize: 13 }}>{produto.sku}</strong>
                        <span
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "var(--ink-soft)",
                            maxWidth: 260,
                          }}
                        >
                          {produto.name}
                        </span>
                      </td>
                      <td style={TD}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            background: canal === "atacado" ? "#EDE9FE" : "#E0F2FE",
                            color: canal === "atacado" ? "#5B21B6" : "#075985",
                          }}
                        >
                          {canal}
                        </span>
                      </td>
                      <td style={{ ...TD, textAlign: "right" }}>{faixa}</td>
                      <td style={{ ...TD, textAlign: "right", fontWeight: 800 }}>
                        {brl(Number(linha.price))}
                      </td>
                      <td style={TD}>{dataBR(linha.valid_from)}</td>
                      <td style={TD}>{linha.valid_until ? dataBR(linha.valid_until) : "sem previsão"}</td>
                      <td style={TD}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            background: st.bg,
                            color: st.fg,
                          }}
                        >
                          {st.rotulo}
                        </span>
                      </td>
                      <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          aria-label={`Editar preco ${produto.sku} ${canal} faixa ${faixa}`}
                          disabled={pendente}
                          onClick={() => editar(produto, linha)}
                          style={{
                            ...BTN,
                            background: "var(--ink, #241c2b)",
                            padding: "7px 13px",
                            fontSize: 12.5,
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          aria-label={`Remover preco ${produto.sku} ${canal} faixa ${faixa}`}
                          disabled={pendente}
                          onClick={() => remover(produto, linha)}
                          style={{
                            ...BTN,
                            background: "#FEE2E2",
                            color: "#991B1B",
                            marginLeft: 8,
                            padding: "7px 13px",
                            fontSize: 12.5,
                          }}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
