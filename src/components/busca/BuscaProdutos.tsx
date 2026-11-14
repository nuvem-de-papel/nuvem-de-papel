"use client";

import { useEffect, useRef, useState } from "react";

type Item = { sku: string; name: string; price: number; category: string | null };

function moeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

// Campo de busca de produto (lupa do topo). Nome ou SKU. Clique no resultado
// abre a pagina do produto. Esc fecha.
export function BuscaProdutos({ aoEscolher }: { aoEscolher?: () => void }) {
  const [q, setQ] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) {
      setItens([]);
      setBuscou(false);
      return;
    }
    const ctrl = new AbortController();
    const id = window.setTimeout(async () => {
      setCarregando(true);
      try {
        const r = await fetch(`/api/produtos/busca?q=${encodeURIComponent(termo)}`, { signal: ctrl.signal });
        const j = (await r.json()) as { itens?: Item[] };
        setItens(j.itens ?? []);
      } catch {
        if (!ctrl.signal.aborted) setItens([]);
      } finally {
        if (!ctrl.signal.aborted) {
          setCarregando(false);
          setBuscou(true);
        }
      }
    }, 250);
    return () => {
      window.clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div>
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") aoEscolher?.();
        }}
        placeholder="Buscar produto pelo nome ou SKU - digite pelo menos 2 letras"
        aria-label="Buscar produto"
        className="busca-campo"
        style={{
          display: "block",
          width: "100%",
          maxWidth: 480,
          height: 40,
          borderRadius: 999,
          padding: "0 16px",
          fontSize: 15,
          boxSizing: "border-box",
          outline: "none",
        }}
      />

      {carregando && <p style={{ margin: "10px 4px 0", fontSize: 13, color: "#000000" }}>Buscando...</p>}
      {!carregando && buscou && itens.length === 0 && (
        <p style={{ margin: "10px 4px 0", fontSize: 13, color: "#000000" }}>Nenhum produto encontrado.</p>
      )}

      {itens.length > 0 && (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 6 }}>
          {itens.map((it) => (
            <li key={it.sku}>
              <a
                href={`/produtos/${it.sku}`}
                onClick={() => aoEscolher?.()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 12,
                  textDecoration: "none",
                  color: "var(--ink)",
                  background: "var(--pink-100)",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>{it.name}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)" }}>
                    SKU {it.sku}
                    {it.category ? ` · ${it.category}` : ""}
                  </span>
                </span>
                <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>{moeda(it.price)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
