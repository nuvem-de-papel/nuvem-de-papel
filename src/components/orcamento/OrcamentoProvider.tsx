"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ORCAMENTO_MAX_ITENS, ORCAMENTO_QTD_MAX, ORCAMENTO_STORAGE_KEY } from "@/lib/orcamentoConfig";

// Lista de orcamento no localStorage (mesmo padrao do carrinho). Guarda so
// id, sku, nome e quantidade: saldo, prazo e precos sao resolvidos no servidor.

export type OrcamentoItem = { id: string; sku: string; name: string; qty: number };

type OrcamentoContextValue = {
  itens: OrcamentoItem[];
  totalItens: number;
  totalQuantidade: number;
  addItem: (item: Omit<OrcamentoItem, "qty">, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;
};

const OrcamentoContext = createContext<OrcamentoContextValue | null>(null);

export function OrcamentoProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<OrcamentoItem[]>([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ORCAMENTO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItens(
            parsed.filter(
              (i): i is OrcamentoItem =>
                typeof i?.id === "string" &&
                typeof i?.sku === "string" &&
                typeof i?.name === "string" &&
                typeof i?.qty === "number"
            )
          );
        }
      }
    } catch {
      // storage corrompido: comeca vazio
    }
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (!carregado) return;
    try {
      window.localStorage.setItem(ORCAMENTO_STORAGE_KEY, JSON.stringify(itens));
    } catch {
      // storage cheio ou bloqueado: a lista segue so na memoria da pagina
    }
  }, [itens, carregado]);

  const addItem = useCallback((item: Omit<OrcamentoItem, "qty">, qty = 1) => {
    setItens((atual) => {
      const existe = atual.find((i) => i.id === item.id);
      if (existe) {
        return atual.map((i) =>
          i.id === item.id ? { ...i, qty: Math.min(i.qty + qty, ORCAMENTO_QTD_MAX) } : i
        );
      }
      if (atual.length >= ORCAMENTO_MAX_ITENS) return atual;
      return [
        ...atual,
        { id: item.id, sku: item.sku, name: item.name, qty: Math.min(qty, ORCAMENTO_QTD_MAX) },
      ];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    const q = Math.min(Math.max(Math.floor(qty) || 1, 1), ORCAMENTO_QTD_MAX);
    setItens((atual) => atual.map((i) => (i.id === id ? { ...i, qty: q } : i)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItens((atual) => atual.filter((i) => i.id !== id));
  }, []);

  const clear = useCallback(() => setItens([]), []);

  const totalQuantidade = itens.reduce((soma, i) => soma + i.qty, 0);

  const value = useMemo(
    () => ({ itens, totalItens: itens.length, totalQuantidade, addItem, setQty, removeItem, clear }),
    [itens, totalQuantidade, addItem, setQty, removeItem, clear]
  );

  return <OrcamentoContext.Provider value={value}>{children}</OrcamentoContext.Provider>;
}

export function useOrcamento() {
  const ctx = useContext(OrcamentoContext);
  if (!ctx) throw new Error("useOrcamento fora do OrcamentoProvider");
  return ctx;
}
