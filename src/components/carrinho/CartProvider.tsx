"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Carrinho no localStorage (MVP da F3): itens {id, sku, name, price, qty}.
// O price aqui é SÓ exibição — no checkout o preço é sempre resolvido no
// servidor (src/app/checkout/actions.ts). Persistência cruzada-dispositivo
// entra no backlog (tabela carts).

export type CartItem = {
  id: string;
  sku: string;
  name: string;
  price: number;
  qty: number;
};

type CartContextValue = {
  itens: CartItem[];
  totalItens: number;
  totalValor: number;
  addItem: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "ndp_carrinho_v1";
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<CartItem[]>([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItens(
            parsed.filter(
              (i): i is CartItem =>
                typeof i?.id === "string" &&
                typeof i?.name === "string" &&
                typeof i?.price === "number" &&
                typeof i?.qty === "number"
            )
          );
        }
      }
    } catch {
      // storage corrompido — começa vazio
    }
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (!carregado) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(itens));
    } catch {
      // quota/privacidade — não derruba a UI
    }
  }, [itens, carregado]);

  const addItem = useCallback((novo: Omit<CartItem, "qty">, qty = 1) => {
    setItens((atual) => {
      const existente = atual.find((i) => i.id === novo.id);
      if (existente) {
        return atual.map((i) => (i.id === novo.id ? { ...i, qty: Math.min(i.qty + qty, 99) } : i));
      }
      return [...atual, { ...novo, qty: Math.min(qty, 99) }];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItens((atual) =>
      qty <= 0
        ? atual.filter((i) => i.id !== id)
        : atual.map((i) => (i.id === id ? { ...i, qty: Math.min(qty, 99) } : i))
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItens((atual) => atual.filter((i) => i.id !== id));
  }, []);

  const clear = useCallback(() => setItens([]), []);

  const valor = useMemo(() => itens.reduce((s, i) => s + i.price * i.qty, 0), [itens]);
  const contagem = useMemo(() => itens.reduce((s, i) => s + i.qty, 0), [itens]);

  const value = useMemo<CartContextValue>(
    () => ({ itens, totalItens: contagem, totalValor: valor, addItem, setQty, removeItem, clear }),
    [itens, contagem, valor, addItem, setQty, removeItem, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart precisa do CartProvider no layout");
  return ctx;
}
