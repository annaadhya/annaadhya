"use client";
/**
 * Approved Stitch wishlist template for /wishlist, wired to the real
 * WishlistProvider (device-local saved items), the live catalogue and the
 * real shipping policy (same server-driven rule the cart uses).
 *
 * Honesty rules encoded here:
 *  - the wishlist lives in this browser's storage — the page says so plainly
 *    and never implies account or cross-device sync, because no wishlist
 *    server exists yet (lib/wishlist.tsx is the documented swap point);
 *  - every price, pack label, stock state and badge comes from the real
 *    catalogue / variant model — nothing decorative is invented;
 *  - the "Notify when in stock" control in the reference design needs a
 *    notification backend that doesn't exist, so out-of-stock items get an
 *    honest disabled button instead of a fake promise;
 *  - the shipping line in the summary band follows the store's real
 *    free-above / flat-rate settings — no invented courier brands;
 *  - saved products that have left the catalogue stay visible in a
 *    "No longer listed" strip with a remove action — nothing is pruned
 *    silently;
 *  - when the product API can't be reached, an explicit retry banner appears
 *    instead of pretending the wishlist is empty;
 *  - sorting only reorders the display — it never rewrites the saved list
 *    (the stored order is the real "recently added" order on this device).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { PUBLIC_API_URL, type ApiEnvelope } from "@/lib/api";
import { availableQty, formatINR } from "@/lib/format";
import type { ProductVariant, ProductWithVariantsShape, PublicStoreSettings } from "@/lib/types";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconHeart,
  IconRefresh,
  IconShoppingBag,
  IconTrash,
  IconTruck,
  IconX,
} from "@/components/icons";

type ShippingPolicy = PublicStoreSettings["shipping"] | null;

type SortKey = "recent" | "name-az" | "price-asc" | "price-desc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recently added" },
  { value: "name-az", label: "Name, A to Z" },
  { value: "price-asc", label: "Price — low to high" },
  { value: "price-desc", label: "Price — high to low" },
];

/** Per-slug resolution — a saved item is ok, gone from the catalogue, or unreachable. */
type ItemState =
  | { kind: "ok"; product: ProductWithVariantsShape }
  | { kind: "missing" }
  | { kind: "error" };

async function fetchItem(slug: string): Promise<ItemState> {
  try {
    const res = await fetch(`${PUBLIC_API_URL}/products/slug/${encodeURIComponent(slug)}`);
    if (res.status === 404) return { kind: "missing" };
    if (!res.ok) return { kind: "error" };
    const body = (await res.json()) as ApiEnvelope<ProductWithVariantsShape>;
    return body.ok && body.data ? { kind: "ok", product: body.data } : { kind: "missing" };
  } catch {
    return { kind: "error" };
  }
}

/** A slug isn't a display name — prettify it without inventing product data. */
function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function publishedVariants(product: ProductWithVariantsShape): ProductVariant[] {
  return product.variants.filter((v) => v.status === "published");
}

/** Default pack: the first one a shopper can actually buy, else the first published. */
function defaultVariantFor(product: ProductWithVariantsShape): ProductVariant | undefined {
  const variants = publishedVariants(product);
  return variants.find((v) => availableQty(v) > 0) ?? variants[0];
}

/** Cheapest published pack — the deterministic, real price used for sorting. */
function sortPrice(product: ProductWithVariantsShape): number {
  const variants = publishedVariants(product);
  return variants.length > 0 ? Math.min(...variants.map((v) => v.pricePaise)) : Number.POSITIVE_INFINITY;
}

interface ToastState {
  id: number;
  title: string;
  desc?: string;
  /** When set, Undo re-adds this saved slug through the real provider. */
  undoSlug?: string;
}

/* ------------------------------ wishlist card ----------------------------- */

interface CardProps {
  product: ProductWithVariantsShape;
  selectedId: string | undefined;
  onSelect: (slug: string, variantId: string) => void;
  onRemove: (slug: string, name: string) => void;
  onMoveToBag: (product: ProductWithVariantsShape, variant: ProductVariant) => void;
}

function WishlistCard({ product, selectedId, onSelect, onRemove, onMoveToBag }: CardProps) {
  const variants = useMemo(() => publishedVariants(product), [product]);
  const selected = variants.find((v) => v.id === selectedId) ?? defaultVariantFor(product);
  const image = product.images[0]?.url ?? "/demo-images/placeholder.svg";
  const avail = selected ? availableQty(selected) : 0;
  const soldOut = !selected || avail <= 0;
  const lowStock = selected != null && avail > 0 && avail <= selected.lowStockThreshold;
  const showMrp = selected?.mrpPaise != null && selected.mrpPaise > selected.pricePaise;

  const stockLine = !selected
    ? { tone: "error" as const, text: "Currently unavailable" }
    : avail <= 0
      ? { tone: "error" as const, text: "Out of stock" }
      : lowStock
        ? { tone: "error" as const, text: `Low stock — only ${avail} left` }
        : { tone: "ok" as const, text: "In stock" };

  return (
    <article className="card-soft group flex flex-col p-space-md transition-shadow duration-300 hover:shadow-lg">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md bg-surface-container-low">
        <img
          src={image}
          alt={product.images[0]?.alt || product.name}
          loading="lazy"
          className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        />
        {/* Image badge — real stock state first, real type label otherwise */}
        {soldOut ? (
          <span className="absolute left-2.5 top-2.5 max-w-[calc(100%-3.75rem)] truncate rounded-full border border-error/20 bg-error-container/90 px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-widest text-on-error-container backdrop-blur-sm">
            Out of stock
          </span>
        ) : lowStock ? (
          <span className="absolute left-2.5 top-2.5 max-w-[calc(100%-3.75rem)] truncate rounded-full border border-error/20 bg-error-container/90 px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-widest text-on-error-container backdrop-blur-sm">
            Only {avail} left
          </span>
        ) : (
          product.typeLabel && (
            <span className="absolute left-2.5 top-2.5 max-w-[calc(100%-3.75rem)] truncate rounded-full bg-surface/90 px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-widest text-primary backdrop-blur-sm">
              {product.typeLabel}
            </span>
          )
        )}
        <button
          type="button"
          aria-label={`Remove ${product.name} from wishlist`}
          title="Remove from Wishlist"
          onClick={() => onRemove(product.slug, product.name)}
          className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-primary-container shadow-sm backdrop-blur-sm transition-colors hover:bg-primary hover:text-on-primary"
        >
          <IconHeart size={18} filled />
        </button>
      </div>

      <div className="flex flex-grow flex-col px-1 pt-space-md">
        <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-on-tertiary-fixed-variant">
          {product.typeLabel}
        </p>
        <h3 className="mt-1 text-headline-sm font-semibold leading-snug text-on-surface transition-colors group-hover:text-primary">
          <Link href={`/product/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-body-sm font-medium">
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${stockLine.tone === "error" ? "bg-error" : "bg-secondary"}`}
          />
          <span className={stockLine.tone === "error" ? "text-error" : "text-secondary"}>{stockLine.text}</span>
        </p>
      </div>

      <div className="mt-auto space-y-space-md px-1 pt-space-md">
        {variants.length > 0 && selected && (
          <>
            <div className="flex items-center justify-between gap-2 border-t border-outline-variant/30 pt-space-md">
              <span className="shrink-0 text-body-sm font-medium text-on-surface-variant">Pack:</span>
              <span className="relative min-w-0 flex-1">
                <select
                  value={selected.id}
                  onChange={(e) => onSelect(product.slug, e.target.value)}
                  aria-label={`Pack size for ${product.name}`}
                  className="w-full cursor-pointer appearance-none rounded-sm border-0 bg-surface-container-low py-1.5 pl-2.5 pr-8 text-label-md font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {variants.map((v) => (
                    <option key={v.id} value={v.id} disabled={availableQty(v) <= 0}>
                      {v.packLabel} — {formatINR(v.pricePaise, false)}
                      {availableQty(v) <= 0 ? " (out of stock)" : ""}
                    </option>
                  ))}
                </select>
                <IconChevronDown
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
                />
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-baseline gap-1.5">
                <span className="text-body-sm text-on-surface-variant">MRP:</span>
                <span className="font-display text-xl font-bold text-primary text-tabular">
                  {formatINR(selected.pricePaise, false)}
                </span>
              </span>
              {showMrp && (
                <span className="text-body-sm text-outline line-through text-tabular">
                  {formatINR(selected.mrpPaise!, false)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onMoveToBag(product, selected)}
              disabled={soldOut}
              aria-label={
                soldOut
                  ? `${product.name} is out of stock`
                  : `Move ${product.name} (${selected.packLabel}) to cart`
              }
              className="btn-primary flex w-full items-center justify-center gap-2 px-space-lg py-2.5 text-label-md uppercase tracking-wider"
            >
              <IconShoppingBag size={15} />
              <span>{soldOut ? "Out of Stock" : "Move to Bag"}</span>
            </button>
          </>
        )}
      </div>
    </article>
  );
}

/* ---------------------------- clear-all dialog ---------------------------- */

function ClearWishlistDialog({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-gutter-mobile backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-wishlist-title"
      aria-describedby="clear-wishlist-desc"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="card-soft w-full max-w-md space-y-space-lg p-space-xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-primary-container">
          <IconTrash size={24} />
        </div>
        <div className="space-y-2">
          <h3 id="clear-wishlist-title" className="font-display text-headline-md font-semibold text-on-surface">
            Empty your saved collection?
          </h3>
          <p id="clear-wishlist-desc" className="mx-auto max-w-sm text-body-sm leading-relaxed text-on-surface-variant">
            Are you sure you want to clear all {count} saved {count === 1 ? "item" : "items"} from your
            wishlist? This cannot be undone.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-space-sm pt-1 sm:flex-row">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg bg-surface-container-low px-space-lg py-3 text-label-lg font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            Keep Items
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-error px-space-lg py-3 text-label-lg font-semibold text-on-error shadow-md transition-opacity hover:opacity-90"
          >
            Clear Wishlist
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ skeleton ---------------------------------- */

function WishlistSkeleton({ tiles }: { tiles: number }) {
  return (
    <div className="w-full px-margin-mobile py-space-xl lg:px-margin" role="status" aria-live="polite">
      <p className="sr-only">Loading your wishlist…</p>
      <div className="mx-auto max-w-7xl animate-pulse" aria-hidden>
        <div className="h-3 w-40 rounded bg-surface-container-high" />
        <div className="mt-space-md h-9 w-64 rounded-lg bg-surface-container-high" />
        <div className="mt-2 h-3 w-full max-w-md rounded bg-surface-container" />
        <div className="mt-space-xl grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4 lg:gap-space-lg">
          {Array.from({ length: Math.max(1, Math.min(tiles, 8)) }).map((_, i) => (
            <div key={i} className="rounded-lg bg-surface-container-lowest p-space-md shadow-sm">
              <div className="aspect-[4/5] rounded-md bg-surface-container-high" />
              <div className="mt-3 h-3 w-1/3 rounded bg-surface-container-high" />
              <div className="mt-2 h-4 w-3/4 rounded bg-surface-container-high" />
              <div className="mt-4 h-9 w-full rounded-sm bg-surface-container-high" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================ main view ================================ */

export function WishlistView({ shipping }: { shipping: ShippingPolicy }) {
  const wishlist = useWishlist();
  const cart = useCart();

  const [items, setItems] = useState<Map<string, ItemState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<SortKey>("recent");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  // Explicit pack choices per saved slug — absent entries fall back to the
  // first in-stock published pack, so every card shows a real, visible choice.
  const [selectedBySlug, setSelectedBySlug] = useState<Record<string, string>>({});
  const clearTriggerRef = useRef<HTMLButtonElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cache of resolved items so hearting one product never refetches the whole list.
  const cacheRef = useRef<Map<string, ItemState>>(new Map());

  const slugKey = wishlist.ready ? wishlist.slugs.join("|") : "";
  const slugs = useMemo(() => (slugKey ? slugKey.split("|") : []), [slugKey]);

  /* ------------------------------ resolution ------------------------------ */

  useEffect(() => {
    if (!wishlist.ready) return;
    let cancelled = false;

    for (const key of [...cacheRef.current.keys()]) {
      if (!slugs.includes(key)) cacheRef.current.delete(key);
    }
    const pending = slugs.filter((s) => !cacheRef.current.has(s));

    const snapshot = () => {
      setItems(
        new Map(
          slugs
            .map((s) => [s, cacheRef.current.get(s)] as const)
            .filter((pair): pair is [string, ItemState] => pair[1] !== undefined),
        ),
      );
    };

    if (pending.length === 0) {
      snapshot();
      setLoading(false);
      return;
    }

    setLoading(true);
    void Promise.all(pending.map(async (slug) => [slug, await fetchItem(slug)] as const)).then((pairs) => {
      if (cancelled) return;
      for (const [slug, state] of pairs) cacheRef.current.set(slug, state);
      snapshot();
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [wishlist.ready, slugs, attempt]);

  /** Re-check only the items that failed — resolved ones stay untouched. */
  const retry = useCallback(() => {
    for (const [slug, state] of [...cacheRef.current.entries()]) {
      if (state.kind === "error") cacheRef.current.delete(slug);
    }
    setAttempt((n) => n + 1);
  }, []);

  /* --------------------------------- toast --------------------------------- */

  useEffect(() => {
    if (!toast) return;
    toastTimer.current = setTimeout(() => setToast(null), 4500);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toast]);

  const showToast = useCallback((t: Omit<ToastState, "id">) => {
    setToast({ ...t, id: Date.now() });
  }, []);

  const undoRemove = useCallback(() => {
    if (!toast?.undoSlug) return;
    // The slug is absent, so toggle re-adds it — prepended as the most recent save.
    wishlist.toggle(toast.undoSlug);
    setToast(null);
  }, [toast, wishlist]);

  /* ------------------------------- actions -------------------------------- */

  const removeSaved = useCallback(
    (slug: string, name?: string) => {
      wishlist.remove(slug);
      showToast({
        title: "Removed from wishlist",
        desc: `${name ?? prettifySlug(slug)} has been removed.`,
        undoSlug: slug,
      });
    },
    [wishlist, showToast],
  );

  const moveToBag = useCallback(
    (product: ProductWithVariantsShape, variant: ProductVariant) => {
      if (availableQty(variant) <= 0) return;
      cart.add(
        {
          variantId: variant.id,
          productId: product.id,
          slug: product.slug,
          sku: variant.sku,
          name: product.name,
          packLabel: variant.packLabel,
          image: product.images[0]?.url,
          subtitle: product.subtitle,
          unitPricePaise: variant.pricePaise,
        },
        1,
      );
      showToast({
        title: "Moved to your basket",
        desc: `${product.name} — ${variant.packLabel} is in your cart.`,
      });
    },
    [cart, showToast],
  );

  /* ------------------------------- derived -------------------------------- */

  const okProducts = useMemo(
    () =>
      slugs
        .map((s) => items.get(s))
        .filter((st): st is Extract<ItemState, { kind: "ok" }> => st?.kind === "ok")
        .map((st) => st.product),
    [slugs, items],
  );

  const sortedOkProducts = useMemo(() => {
    if (sort === "recent") return okProducts;
    const sorted = [...okProducts];
    if (sort === "name-az") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "en-IN"));
      return sorted;
    }
    sorted.sort((a, b) => {
      const pa = sortPrice(a);
      const pb = sortPrice(b);
      const unpricedA = !Number.isFinite(pa);
      const unpricedB = !Number.isFinite(pb);
      if (unpricedA && unpricedB) return 0;
      if (unpricedA) return 1; // unresolvable prices always sort last
      if (unpricedB) return -1;
      return sort === "price-asc" ? pa - pb : pb - pa;
    });
    return sorted;
  }, [okProducts, sort]);

  const missingSlugs = slugs.filter((s) => items.get(s)?.kind === "missing");
  const erroredSlugs = slugs.filter((s) => items.get(s)?.kind === "error");
  const unresolvedCount = slugs.length - okProducts.length - missingSlugs.length - erroredSlugs.length;

  const purchasable = useMemo(
    () =>
      sortedOkProducts.filter((p) => {
        const variants = publishedVariants(p);
        const selected = variants.find((v) => v.id === selectedBySlug[p.slug]) ?? defaultVariantFor(p);
        return selected != null && availableQty(selected) > 0;
      }),
    [sortedOkProducts, selectedBySlug],
  );

  const totalPaise = useMemo(
    () =>
      purchasable.reduce((sum, p) => {
        const variants = publishedVariants(p);
        const selected = variants.find((v) => v.id === selectedBySlug[p.slug]) ?? defaultVariantFor(p);
        return sum + (selected?.pricePaise ?? 0);
      }, 0),
    [purchasable, selectedBySlug],
  );

  const moveAllToCart = useCallback(() => {
    let moved = 0;
    for (const product of sortedOkProducts) {
      const variants = publishedVariants(product);
      const selected = variants.find((v) => v.id === selectedBySlug[product.slug]) ?? defaultVariantFor(product);
      if (!selected || availableQty(selected) <= 0) continue;
      cart.add(
        {
          variantId: selected.id,
          productId: product.id,
          slug: product.slug,
          sku: selected.sku,
          name: product.name,
          packLabel: selected.packLabel,
          image: product.images[0]?.url,
          subtitle: product.subtitle,
          unitPricePaise: selected.pricePaise,
        },
        1,
      );
      moved += 1;
    }
    if (moved > 0) {
      showToast({
        title: "Moved to your basket",
        desc: `${moved} of ${okProducts.length} saved ${okProducts.length === 1 ? "item" : "items"} added to your cart.`,
      });
    }
  }, [sortedOkProducts, selectedBySlug, cart, showToast, okProducts.length]);

  const confirmClear = useCallback(() => {
    const cleared = wishlist.count;
    wishlist.clear();
    setClearOpen(false);
    clearTriggerRef.current?.focus();
    showToast({
      title: "Wishlist cleared",
      desc: `All ${cleared} saved ${cleared === 1 ? "item" : "items"} were removed from this device.`,
    });
  }, [wishlist, showToast]);

  /* ------------------------------- shipping ------------------------------- */

  const shippingLine = useMemo(() => {
    if (!shipping || shipping.mode === "disabled") return null;
    if (shipping.mode === "free_shipping") return "Complimentary Pan-India Shipping";
    if (shipping.freeAbovePaise != null && shipping.freeAbovePaise > 0) {
      return totalPaise >= shipping.freeAbovePaise
        ? "Complimentary Pan-India Shipping Unlocked"
        : `Complimentary shipping on orders above ${formatINR(shipping.freeAbovePaise, false)}`;
    }
    return `Flat ${formatINR(shipping.flatRatePaise, false)} shipping across India`;
  }, [shipping, totalPaise]);

  /* ------------------------------ boot / load ------------------------------ */

  if (!wishlist.ready || (loading && okProducts.length === 0)) {
    return <WishlistSkeleton tiles={wishlist.slugs.length} />;
  }

  /* -------------------------------- empty ---------------------------------- */

  if (slugs.length === 0) {
    return (
      <div className="w-full bg-surface px-margin-mobile py-space-xl lg:px-margin">
        <div className="card-soft mx-auto max-w-2xl space-y-space-lg p-space-xl text-center md:p-16">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-outline-variant/40 bg-surface-container-low shadow-inner">
            <IconHeart size={40} className="text-on-tertiary-fixed-variant" strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-headline-lg-mobile font-semibold text-on-surface lg:text-headline-lg">
              Your wishlist is waiting for something lovely.
            </h1>
            <p className="mx-auto max-w-md text-body-md leading-relaxed text-on-surface-variant">
              Save the wild honey, Pampore kesar, sun-dried dry fruits, and thoughtful gifts you cherish,
              and they&apos;ll be preserved right here on this device — no account needed.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-space-md pt-space-sm sm:flex-row">
            <Link
              href="/shop"
              className="btn-primary inline-block w-full rounded-lg px-space-xl py-3 text-label-md uppercase tracking-wider shadow sm:w-auto"
            >
              Explore All Treasures
            </Link>
            <Link
              href="/about"
              className="inline-block w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-space-xl py-3 text-label-md font-semibold uppercase tracking-wider text-on-surface transition-colors hover:border-outline sm:w-auto"
            >
              Read Our Story
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- filled ---------------------------------- */

  return (
    <div className="flex w-full flex-col bg-surface">
      {/* Breadcrumb strip (matches the approved cart template) */}
      <div className="w-full bg-surface-container-low/70 px-margin-mobile py-space-sm lg:px-margin">
        <nav
          aria-label="Breadcrumb"
          className="mx-auto flex max-w-7xl items-center gap-2 text-label-md text-on-surface-variant"
        >
          <Link href="/" className="transition-colors hover:text-primary">
            Home
          </Link>
          <span className="opacity-40" aria-hidden>
            /
          </span>
          <span className="font-semibold text-primary" aria-current="page">
            My Wishlist
          </span>
        </nav>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-space-xl px-margin-mobile py-space-xl lg:px-margin">
        {/* Editorial header — real count, honest device-local note, clear-all */}
        <header className="flex flex-col justify-between gap-space-lg lg:flex-row lg:items-end">
          <div className="space-y-space-xs">
            <span className="inline-flex w-fit items-center gap-space-xs rounded-full bg-surface-container-high px-space-md py-1 text-label-sm font-semibold uppercase tracking-wider text-primary">
              <IconHeart size={14} filled />
              {wishlist.count} {wishlist.count === 1 ? "item" : "items"} saved
            </span>
            <h1 className="font-display text-headline-lg-mobile font-semibold tracking-tight text-primary lg:text-headline-lg">
              My Wishlist
            </h1>
            <p className="max-w-xl text-body-md text-on-surface-variant">
              Your favourite finds, saved for whenever you&apos;re ready. (You have {wishlist.count} saved{" "}
              {wishlist.count === 1 ? "item" : "items"})
            </p>
          </div>
          <div className="flex flex-col items-start gap-space-sm lg:items-end">
            <span
              title="Your wishlist is kept in this browser's storage — it isn't tied to an account yet, so it follows you across visits on this device."
              className="inline-flex w-fit items-center gap-2 rounded-full border border-outline-variant/40 px-space-md py-1.5 text-label-sm text-on-surface-variant"
            >
              Saved on this device
            </span>
            {wishlist.count > 0 && (
              <button
                ref={clearTriggerRef}
                type="button"
                onClick={() => setClearOpen(true)}
                className="rounded-lg bg-surface-container px-space-lg py-2 text-label-lg font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
              >
                Clear All
              </button>
            )}
          </div>
        </header>

        {/* Explicit failure banner — never pretend the list is empty */}
        {erroredSlugs.length > 0 && (
          <div
            role="alert"
            className="flex flex-col gap-space-sm rounded-xl bg-error-container px-space-lg py-space-md text-on-error-container sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <IconAlertTriangle size={20} className="mt-0.5 shrink-0" />
              <p className="text-body-sm">
                We couldn&apos;t check{" "}
                {erroredSlugs.length === slugs.length
                  ? "any"
                  : `${erroredSlugs.length} of ${slugs.length}`}{" "}
                of your saved {erroredSlugs.length === 1 ? "item" : "items"} just now — the store may
                be briefly unreachable. Nothing was removed.
              </p>
            </div>
            <button
              type="button"
              onClick={retry}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-on-error-container/30 px-4 py-2 text-label-sm font-semibold uppercase tracking-wider transition-colors hover:bg-error/10"
            >
              <IconRefresh size={15} />
              Try again
            </button>
          </div>
        )}

        {/* Sort — reorders the display only; the saved list itself is untouched */}
        {sortedOkProducts.length > 1 && (
          <div className="flex w-full max-w-xs flex-col gap-1">
            <label htmlFor="wishlist-sort" className="text-label-lg text-on-surface">
              Sort By
            </label>
            <span className="relative">
              <select
                id="wishlist-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="w-full cursor-pointer appearance-none rounded-sm border border-line-warm bg-surface-container-lowest py-2.5 pl-3 pr-9 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <IconChevronDown
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
              />
            </span>
          </div>
        )}

        {/* Saved products still in the catalogue */}
        {sortedOkProducts.length > 0 && (
          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4 lg:gap-space-lg">
            {sortedOkProducts.map((product) => (
              <WishlistCard
                key={product.id}
                product={product}
                selectedId={selectedBySlug[product.slug]}
                onSelect={(slug, variantId) =>
                  setSelectedBySlug((prev) => ({ ...prev, [slug]: variantId }))
                }
                onRemove={removeSaved}
                onMoveToBag={moveToBag}
              />
            ))}
            {unresolvedCount > 0 &&
              Array.from({ length: Math.min(unresolvedCount, 8) }).map((_, i) => (
                <div
                  key={`pending-${i}`}
                  className="h-96 animate-pulse rounded-lg bg-surface-container-lowest shadow-sm"
                  aria-hidden
                />
              ))}
          </div>
        )}

        {/* Summary plinth — real totals from the selected packs, real shipping policy */}
        {sortedOkProducts.length > 0 && (
          <section className="card-soft flex flex-col gap-space-lg p-space-lg md:flex-row md:items-center md:justify-between lg:p-space-xl">
            <div className="space-y-space-xs text-center md:text-left">
              {shippingLine && (
                <div className="flex items-center justify-center gap-space-xs md:justify-start">
                  <IconTruck size={18} className="shrink-0 text-secondary" />
                  <span className="text-label-sm font-bold uppercase tracking-wider text-secondary">
                    {shippingLine}
                  </span>
                </div>
              )}
              <h2 className="font-display text-headline-md font-semibold text-on-surface">
                Ready to bring your collection home?
              </h2>
              <p className="text-body-sm text-on-surface-variant">
                Total Wishlist Value:{" "}
                <span className="font-display text-base font-bold text-on-surface text-tabular">
                  {formatINR(totalPaise, false)}
                </span>{" "}
                ({purchasable.length} of {sortedOkProducts.length} saved{" "}
                {sortedOkProducts.length === 1 ? "item" : "items"} in stock and ready to pack)
              </p>
            </div>
            <button
              type="button"
              onClick={moveAllToCart}
              disabled={purchasable.length === 0}
              className="btn-primary inline-flex w-full shrink-0 items-center justify-center gap-2 px-space-xl py-3.5 text-label-md uppercase tracking-widest shadow-md md:w-auto"
            >
              <IconShoppingBag size={17} />
              Move Available Items to Cart
            </button>
          </section>
        )}

        {/* Saved items that have left the catalogue — visible until removed */}
        {missingSlugs.length > 0 && (
          <section className="card-soft p-space-lg">
            <h2 className="font-display text-headline-sm text-on-surface">No longer listed</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              These saved items have left the catalogue. They stay on your list until you remove
              them — we never delete your picks silently.
            </p>
            <ul className="mt-space-md flex flex-col gap-2">
              {missingSlugs.map((slug) => (
                <li
                  key={slug}
                  className="flex items-center justify-between gap-space-md rounded-lg bg-surface-container-low px-space-md py-space-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-label-lg font-semibold text-on-surface">
                      {prettifySlug(slug)}
                    </span>
                    <span className="block text-label-sm text-on-surface-variant">
                      Unavailable — removed from the catalogue
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSaved(slug)}
                    aria-label={`Remove ${prettifySlug(slug)} from your wishlist`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-label-sm font-semibold uppercase tracking-wider text-error transition-colors hover:bg-error-container"
                  >
                    <IconTrash size={14} />
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Clear-all confirmation — cancelling always leaves the list unchanged */}
      {clearOpen && (
        <ClearWishlistDialog count={wishlist.count} onCancel={() => setClearOpen(false)} onConfirm={confirmClear} />
      )}

      {/* Single toast — real outcomes only, Undo re-adds through the provider */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg bg-inverse-surface p-space-md text-inverse-on-surface shadow-2xl sm:right-6"
        >
          <IconHeart size={20} filled className="mt-0.5 shrink-0 text-inverse-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-label-lg font-semibold">{toast.title}</p>
            {toast.desc && <p className="mt-0.5 text-body-sm text-inverse-on-surface/75">{toast.desc}</p>}
          </div>
          {toast.undoSlug && (
            <button
              type="button"
              onClick={undoRemove}
              className="shrink-0 rounded-sm px-2 py-1 text-label-sm font-bold uppercase tracking-wider text-inverse-primary underline-offset-2 hover:underline"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded-sm p-1 text-inverse-on-surface/70 transition-colors hover:text-inverse-on-surface"
          >
            <IconX size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
