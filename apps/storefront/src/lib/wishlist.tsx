"use client";
/**
 * WishlistProvider — client-side saved items persisted in localStorage (mirrors CartProvider).
 * Stores product slugs; no server state exists for wishlists yet, so this is an honest,
 * additive client feature. When a wishlist API arrives, this module is the swap point.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface WishlistCtx {
  slugs: string[];
  count: number;
  ready: boolean;
  has: (slug: string) => boolean;
  toggle: (slug: string) => void;
  remove: (slug: string) => void;
  clear: () => void;
}

const WishlistContext = createContext<WishlistCtx | null>(null);
const STORAGE_KEY = "annaadhya.wishlist.v1";

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setSlugs(parsed.filter((s): s is string => typeof s === "string"));
      }
    } catch {
      // ignore corrupt storage
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  }, [slugs, ready]);

  const toggle = useCallback((slug: string) => {
    setSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [slug, ...prev]));
  }, []);

  const remove = useCallback((slug: string) => {
    setSlugs((prev) => prev.filter((s) => s !== slug));
  }, []);

  const clear = useCallback(() => setSlugs([]), []);

  const value = useMemo<WishlistCtx>(
    () => ({
      slugs,
      count: slugs.length,
      ready,
      has: (slug: string) => slugs.includes(slug),
      toggle,
      remove,
      clear,
    }),
    [slugs, ready, toggle, remove, clear],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistCtx {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}
