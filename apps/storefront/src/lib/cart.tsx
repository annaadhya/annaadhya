"use client";
/**
 * CartProvider — client cart persisted in localStorage.
 * The cart is a *shopping intent*: every price/stock decision is re-validated by the server
 * via /checkout/quote before an order can exist.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartItem {
  variantId: string;
  productId: string;
  slug: string;
  sku: string;
  name: string;
  packLabel: string;
  image?: string;
  /** Real catalogue provenance line (product.subtitle) — shown on cart rows when present. */
  subtitle?: string;
  unitPricePaise: number;
  qty: number;
}

interface CartCtx {
  items: CartItem[];
  count: number;
  subtotalPaise: number;
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  /** Adopt server-confirmed unit prices from a checkout quote (no-op when prices already
   *  match, so quote → write-back → re-quote always converges). */
  applyServerPrices: (lines: { variantId: string; unitPricePaise: number }[]) => void;
  ready: boolean;
}

const CartContext = createContext<CartCtx | null>(null);
const STORAGE_KEY = "annaadhya.cart.v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      // ignore corrupt storage
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const add = useCallback((item: Omit<CartItem, "qty">, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === item.variantId);
      if (existing) {
        return prev.map((i) => (i.variantId === item.variantId ? { ...i, qty: Math.min(99, i.qty + qty) } : i));
      }
      return [...prev, { ...item, qty }];
    });
  }, []);

  const setQty = useCallback((variantId: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.variantId !== variantId)
        : prev.map((i) => (i.variantId === variantId ? { ...i, qty: Math.min(99, qty) } : i)),
    );
  }, []);

  const remove = useCallback((variantId: string) => {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const applyServerPrices = useCallback((lines: { variantId: string; unitPricePaise: number }[]) => {
    const serverPrice = new Map(lines.map((l) => [l.variantId, l.unitPricePaise]));
    setItems((prev) => {
      let next: CartItem[] | null = null;
      for (let idx = 0; idx < prev.length; idx++) {
        const item = prev[idx];
        const authoritative = serverPrice.get(item.variantId);
        if (authoritative === undefined || authoritative === item.unitPricePaise) continue;
        next = next ?? [...prev];
        next[idx] = { ...item, unitPricePaise: authoritative };
      }
      // Bail out with the previous reference when nothing changed — keeps
      // quote → write-back → re-quote effects from looping.
      return next ?? prev;
    });
  }, []);

  const value = useMemo<CartCtx>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.qty, 0),
      subtotalPaise: items.reduce((s, i) => s + i.unitPricePaise * i.qty, 0),
      add,
      setQty,
      remove,
      clear,
      applyServerPrices,
      ready,
    }),
    [items, add, setQty, remove, clear, applyServerPrices, ready],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartCtx {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
