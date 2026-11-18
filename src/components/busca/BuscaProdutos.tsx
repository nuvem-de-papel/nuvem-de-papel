"use client";

import { useEffect, useRef, useState } from "react";

type Item = { sku: string; name: string; price: number; category: string | null };

function moeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

// Campo de busca fixo no meio da barra do topo (18/11/2026 - antes era uma
// lupa que abria um painel). Nome ou SKU; os resultados abrem numa lista
// flutuante embaixo do campo. Enter abre o primeiro achado; Esc ou clique
// fora fecha. aria-label "Buscar na loja" de proposito: "Buscar produto" e o
// campo do PDV/venda manual e o cabecalho aparece no painel tambem (E2E).
export function BuscaProdutos() {
  const [q, setQ] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false);
    }
    window.addEventListener("mousedown", fora);
    return () => window.removeEventListener("mousedown", fora);
  }, []);

  const mostrarLista = aberto && q.trim().length >= 2 && (carregando || buscou);

  return (
    <div ref={caixaRef} className="header-busca" role="search">
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setAberto(false);
            inputRef.current?.blur();
          }
          if (e.key === "Enter" && itens[0]) {
            window.location.href = `/produtos/${itens[0].sku}`;
          }
        }}
        placeholder="O que você procura?"
        aria-label="Buscar na loja"
        className="busca-campo"
      />
      <button
        type="button"
        className="busca-lupa"
        aria-label="Buscar"
        onClick={() => {
          if (itens[0]) window.location.href = `/produtos/${itens[0].sku}`;
          else inputRef.current?.focus();
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {mostrarLista && (
        <div className="busca-resultados">
          {carregando && <p className="busca-aviso">Buscando...</p>}
          {!carregando && itens.length === 0 && <p className="busca-aviso">Nenhum produto encontrado.</p>}
          {!carregando && itens.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {itens.map((it) => (
                <li key={it.sku}>
                  <a
                    href={`/produtos/${it.sku}`}
                    onClick={() => setAberto(false)}
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
      )}
    </div>
  );
}
