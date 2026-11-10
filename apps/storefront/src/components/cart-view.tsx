"use client";
/**
 * Approved Stitch cart template for /cart, wired to the real CartProvider and the
 * server's authoritative checkout quote.
 *
 * Honesty rules encoded here:
 *  - no coupon field, gift-wrap surcharge or UPI quick-pay — no such systems exist;
 *    gifting routes to the established /contact concierge pattern instead
 *  - shipping progress uses the store's real free-above threshold from public
 *    settings (never the announcement strip's copy)
 *  - totals come from POST /checkout/quote; server unit prices are adopted back
 *    into the basket so a stale client price can never be charged silently
 *  - items the server marks unavailable are removed (established behaviour) with
 *    a visible notice — nothing fake is kept on screen
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCart, type CartItem } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useAuth } from "@/lib/auth";
import { availableQty, formatINR } from "@/lib/format";
import { PUBLIC_API_URL } from "@/lib/api";
import type { ProductWithVariantsShape, PublicStoreSettings } from "@/lib/types";
import {
  IconArrowRight,
  IconBadgeCheck,
  IconCheck,
  IconDroplet,
  IconFlower2,
  IconGift,
  IconShieldCheck,
  IconShoppingBag,
  IconSparkles,
  IconSprout,
  IconTruck,
} from "./icons";

type ShippingPolicy = PublicStoreSettings["shipping"] | null;

interface Quote {
  quoteId: string;
  items: { variantId: string; qty: number; unitPricePaise: number; lineTotalPaise: number }[];
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  unavailable: { variantId: string; reason: string }[];
}

/** Round-rupee amounts render clean (₹1,150); odd paise keep their decimals. */
function fmt(paise: number): string {
  return formatINR(paise, paise % 100 !== 0);
}

/** Empty-cart shelf icons, keyed by category slug (unknown slugs get Sparkles). */
const SHELF_ICONS: Record<string, (p: { size?: number; className?: string }) => React.ReactNode> = {
  honey: IconDroplet,
  kesar: IconFlower2,
  "dry-fruits": IconSprout,
  "gift-boxes": IconGift,
};

/** Live category shelves handed over by the server cart page (slug + label + href).
 *  The page prunes against the live catalogue, so deleted categories never render. */
interface CategoryShelf {
  slug: string;
  label: string;
  href: string;
}

export function CartView({
  shipping,
  crossSell,
  shelves,
}: {
  shipping: ShippingPolicy;
  crossSell: ProductWithVariantsShape[];
  /** Live-catalogue quick links for the empty cart — only categories that
   *  exist right now; unknown slugs (deleted/archived) are never shown. */
  shelves?: CategoryShelf[];
}) {
  const cart = useCart();
  const auth = useAuth();
  const wishlist = useWishlist();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [unavailableNotice, setUnavailableNotice] = useState<string | null>(null);
  const [priceNotice, setPriceNotice] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteSeq = useRef(0);
  const firstQuote = useRef(true);

  function showToast(message: string) {
    setToast({ id: Date.now(), message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  const runQuote = useCallback(async () => {
    if (cart.items.length === 0) return;
    const seq = ++quoteSeq.current;
    setQuoting(true);
    try {
      const res = await fetch(`${PUBLIC_API_URL}/checkout/quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: cart.items.map((i) => ({ variantId: i.variantId, qty: i.qty })) }),
      });
      const body = (await res.json()) as { ok: boolean; data?: Quote; error?: { message: string } };
      if (seq !== quoteSeq.current) return; // a newer quote superseded this one
      if (body.ok && body.data) {
        const q = body.data;
        setQuote(q);
        setQuoteError(null);
        // Adopt the server's authoritative unit prices — the browser never sets the price.
        if (
          q.items.some((line) => {
            const local = cart.items.find((i) => i.variantId === line.variantId);
            return local && local.unitPricePaise !== line.unitPricePaise;
          })
        ) {
          setPriceNotice(true);
        }
        cart.applyServerPrices(q.items);
        if (q.unavailable.length > 0) {
          for (const u of q.unavailable) cart.remove(u.variantId);
          setUnavailableNotice(
            `${q.unavailable.length === 1 ? "1 item was" : `${q.unavailable.length} items were`} unavailable and removed from your basket.`,
          );
        } else {
          setUnavailableNotice(null);
        }
      } else {
        setQuoteError(body.error?.message ?? "Could not validate the basket right now.");
      }
    } catch {
      if (seq !== quoteSeq.current) return;
      setQuoteError("Could not reach the store server — totals below are indicative only.");
    } finally {
      if (seq === quoteSeq.current) setQuoting(false);
    }
  }, [cart]);

  // Auto-quote on entry, then re-quote (debounced) whenever the basket changes.
  useEffect(() => {
    if (!cart.ready || cart.items.length === 0) {
      setQuote(null);
      setQuoteError(null);
      setPriceNotice(false);
      setUnavailableNotice(null);
      return;
    }
    const t = setTimeout(
      () => {
        void runQuote();
        firstQuote.current = false;
      },
      firstQuote.current ? 0 : 700,
    );
    return () => clearTimeout(t);
  }, [cart.ready, cart.items, runQuote]);

  function saveForLater(item: CartItem) {
    if (!wishlist.has(item.slug)) wishlist.toggle(item.slug);
    cart.remove(item.variantId);
    showToast(`${item.name} saved to your wishlist`);
  }

  function removeItem(item: CartItem) {
    cart.remove(item.variantId);
    showToast(`${item.name} removed from your cart`);
  }

  const crossSellPicks = useMemo(
    () =>
      crossSell
        .filter(
          (p) =>
            !cart.items.some((i) => i.slug === p.slug) &&
            p.variants.some((v) => v.status === "published" && availableQty(v) > 0),
        )
        .slice(0, 3),
    [crossSell, cart.items],
  );

  function addCrossSell(product: ProductWithVariantsShape) {
    const variant = product.variants.find((v) => v.status === "published" && availableQty(v) > 0);
    if (!variant) return;
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
    showToast(`${product.name} added to your cart`);
  }

  /* ----------------------------- derived totals ----------------------------- */

  const displaySubtotal = quote ? quote.subtotalPaise : cart.subtotalPaise;
  const displayTotal = quote ? quote.totalPaise : cart.subtotalPaise;
  const freeAbovePaise = shipping?.mode === "flat_rate" ? shipping.freeAbovePaise : null;
  const showProgress = freeAbovePaise != null && freeAbovePaise > 0;
  const shippingUnlocked = freeAbovePaise != null && cart.subtotalPaise >= freeAbovePaise;
  const progressPct =
    freeAbovePaise && freeAbovePaise > 0
      ? Math.min(100, Math.round((cart.subtotalPaise / freeAbovePaise) * 100))
      : 0;

  /* ------------------------------- loading ---------------------------------- */

  if (!cart.ready) {
    return (
      <div className="w-full px-margin-mobile py-space-xl lg:px-margin" role="status" aria-live="polite">
        <p className="sr-only">Loading your cart…</p>
        <div className="mx-auto max-w-7xl animate-pulse" aria-hidden>
          <div className="h-3 w-40 rounded bg-surface-container-high" />
          <div className="mt-space-md h-9 w-72 rounded-lg bg-surface-container-high" />
          <div className="mt-2 h-3 w-full max-w-md rounded bg-surface-container" />
          <div className="mt-space-xl grid grid-cols-1 items-start gap-space-xl lg:grid-cols-12">
            <div className="flex flex-col gap-space-lg lg:col-span-8">
              <div className="h-32 w-full rounded-xl bg-surface-container-lowest shadow-sm" />
              <div className="h-32 w-full rounded-xl bg-surface-container-lowest shadow-sm" />
              <div className="h-32 w-full rounded-xl bg-surface-container-lowest shadow-sm" />
              <div className="h-24 w-full rounded-xl bg-surface-container-low" />
            </div>
            <div className="lg:col-span-4">
              <div className="h-96 w-full rounded-xl bg-surface-container-low" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- empty ----------------------------------- */

  if (cart.items.length === 0) {
    return (
      <div className="w-full bg-surface px-margin-mobile py-space-xl lg:px-margin">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-space-xl py-space-lg text-center">
          {/* Heritage vessel illustration */}
          <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-surface-container-high/60 shadow-inner">
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-surface-container-low">
              <IconShoppingBag size={52} className="text-primary" />
            </div>
            <span className="absolute -bottom-2 rounded-full bg-secondary px-3 py-1 text-[0.625rem] font-bold uppercase tracking-widest text-on-secondary shadow-sm">
              Pantry Awaits
            </span>
          </div>

          <div className="max-w-md space-y-space-xs">
            <span className="text-label-sm font-bold uppercase tracking-widest text-outline">
              Your selection is currently empty
            </span>
            <h1 className="font-display text-headline-lg-mobile font-semibold text-primary lg:text-headline-lg">
              No Reserves in Your Cart
            </h1>
            <p className="text-body-md text-on-surface-variant">
              Small-batch honeys, hand-sorted dry fruits and verified saffron are waiting on the shelves.
              Explore the pantry and stock your kitchen.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-space-md">
            <Link
              href="/shop"
              className="btn-primary inline-block rounded-lg px-space-xl py-space-sm text-label-lg uppercase tracking-wider shadow-md"
            >
              Explore the Pantry
            </Link>
            <Link
              href="/about"
              className="inline-block rounded-lg bg-surface-container-low px-space-lg py-space-sm text-label-lg uppercase tracking-wider text-on-surface shadow-sm transition-all hover:bg-surface-container-high"
            >
              Our Story
            </Link>
          </div>

          {/* Quick collection links — real, currently-published categories only.
              The server cart page prunes against the live catalogue; when the
              catalogue is unreachable nothing renders (never a guessed category). */}
          {(shelves ?? []).length > 0 && (
            <div className="mt-space-md grid w-full grid-cols-2 gap-space-md border-t border-outline-variant/30 pt-space-xl sm:grid-cols-4">
              {(shelves ?? []).map((shelf) => {
                const Icon = SHELF_ICONS[shelf.slug] ?? IconSparkles;
                return (
                  <Link
                    key={shelf.href}
                    href={shelf.href}
                    className="flex flex-col items-center gap-1 rounded-xl bg-surface-container-lowest p-space-md shadow-sm transition-shadow hover:shadow-md"
                  >
                    <Icon size={24} className="text-primary" />
                    <span className="text-label-sm font-bold text-on-surface">{shelf.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* -------------------------------- filled ---------------------------------- */

  return (
    <div className="flex w-full flex-col bg-surface">
      {/* Breadcrumb strip (matches the approved product template) */}
      <div className="w-full bg-surface-container-low/70 px-margin-mobile py-space-sm lg:px-margin">
        <nav aria-label="Breadcrumb" className="mx-auto flex max-w-7xl items-center gap-2 text-label-md text-on-surface-variant">
          <Link href="/" className="transition-colors hover:text-primary">
            Home
          </Link>
          <span className="opacity-40" aria-hidden>
            /
          </span>
          <span className="font-semibold text-primary" aria-current="page">
            Your Cart
          </span>
        </nav>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-space-xl px-margin-mobile py-space-xl lg:px-margin">
        {/* Editorial header + real shipping progress */}
        <header className="flex flex-col justify-between gap-space-lg lg:flex-row lg:items-end">
          <div className="space-y-space-xs">
            <span className="inline-flex items-center gap-space-xs rounded-full bg-surface-container-high px-space-md py-1 text-label-sm font-semibold uppercase tracking-wider text-primary">
              <IconShoppingBag size={15} />
              {cart.count} {cart.count === 1 ? "item" : "items"} selected
            </span>
            <h1 className="font-display text-headline-lg-mobile font-semibold tracking-tight text-primary lg:text-headline-lg">
              Your Pantry Selection
            </h1>
            <p className="max-w-xl text-body-md text-on-surface-variant">
              Small-batch pantry essentials, verified before listing and packed for Indian homes. Every
              total below is re-validated by the store before checkout.
            </p>
          </div>

          {showProgress && (
            <section
              aria-label="Complimentary shipping progress"
              className="w-full rounded-xl bg-surface-container-low p-space-md shadow-sm lg:w-[420px]"
            >
              <div className="flex items-center justify-between text-on-surface">
                <span className="flex items-center gap-space-xs text-label-sm font-bold uppercase tracking-wide">
                  <IconTruck size={18} className="text-secondary" />
                  {shippingUnlocked ? "Complimentary Pan-India Shipping Unlocked" : "Complimentary Pan-India Shipping"}
                </span>
                {shippingUnlocked && <span className="text-label-sm font-bold text-secondary">FREE</span>}
              </div>
              <div className="relative mt-space-xs h-2.5 w-full overflow-hidden rounded-full bg-surface-variant">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${shippingUnlocked ? "bg-secondary" : "bg-heritage-green"}`}
                  style={{ width: `${shippingUnlocked ? 100 : progressPct}%` }}
                />
              </div>
              <p className="pt-1 text-body-sm text-on-surface-variant">
                {shippingUnlocked ? (
                  "This basket ships free across India."
                ) : (
                  <>
                    Add <strong className="font-semibold text-on-surface">{fmt((freeAbovePaise ?? 0) - cart.subtotalPaise)}</strong>{" "}
                    more for complimentary pan-India shipping.
                  </>
                )}
              </p>
            </section>
          )}
        </header>

        {/* Main workspace: items (8) + summary plinth (4) */}
        <div className="grid grid-cols-1 items-start gap-space-xl lg:grid-cols-12">
          <div className="flex flex-col gap-space-lg lg:col-span-8">
            {/* Desktop table header */}
            <div
              className="hidden rounded-lg bg-surface-container-low px-space-md py-space-sm text-label-sm uppercase tracking-wider text-on-surface-variant sm:grid sm:grid-cols-12 sm:gap-space-md"
              aria-hidden
            >
              <span className="sm:col-span-7">Item &amp; Provenance</span>
              <span className="sm:col-span-2 text-center">Quantity</span>
              <span className="sm:col-span-3 text-right">Line Total</span>
            </div>

            <ul className="flex flex-col gap-space-lg" aria-label="Items in your cart">
              {cart.items.map((item) => {
                const serverLine = quote?.items.find((l) => l.variantId === item.variantId);
                return (
                  <li
                    key={item.variantId}
                    className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-sm transition-all hover:shadow-md sm:p-space-lg"
                  >
                    <div className="grid grid-cols-1 items-center gap-space-md sm:grid-cols-12">
                      {/* Thumbnail + info */}
                      <div className="flex items-start gap-space-md sm:col-span-7">
                        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-container sm:h-28 sm:w-28">
                          <img
                            src={item.image ?? "/demo-images/placeholder.svg"}
                            alt={`${item.name} — ${item.packLabel} pack`}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute bottom-1 right-1 rounded bg-surface-container-high/90 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-widest text-on-surface">
                            {item.packLabel}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                          <Link
                            href={`/product/${item.slug}`}
                            className="font-display text-headline-sm font-medium leading-7 text-on-surface transition-colors hover:text-primary"
                          >
                            {item.name}
                          </Link>
                          {item.subtitle && (
                            <p className="text-body-sm text-on-surface-variant">{item.subtitle}</p>
                          )}
                          <p className="flex items-center gap-space-sm pt-space-xs text-label-sm text-on-surface-variant">
                            <span className="font-bold text-primary text-tabular">{fmt(item.unitPricePaise)}</span>
                            <span aria-hidden>•</span>
                            <span>per {item.packLabel} pack</span>
                          </p>
                        </div>
                      </div>

                      {/* Stepper */}
                      <div className="flex items-center sm:col-span-2 sm:justify-center">
                        <div className="inline-flex items-center rounded-full bg-surface-container-low p-1 shadow-inner">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${item.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-on-surface transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => cart.setQty(item.variantId, item.qty - 1)}
                            disabled={item.qty <= 1}
                          >
                            −
                          </button>
                          <span className="w-8 select-none text-center text-label-md font-bold text-on-surface text-tabular">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${item.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-on-surface transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => cart.setQty(item.variantId, Math.min(99, item.qty + 1))}
                            disabled={item.qty >= 99}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Line total + actions */}
                      <div className="flex items-center justify-between gap-space-xs sm:col-span-3 sm:flex-col sm:items-end sm:justify-center">
                        <p className="font-display text-headline-sm font-bold text-primary text-tabular">
                          {fmt(serverLine ? serverLine.lineTotalPaise : item.unitPricePaise * item.qty)}
                        </p>
                        <div className="flex items-center gap-space-sm text-label-sm">
                          <button
                            type="button"
                            className="text-on-surface-variant transition-colors hover:text-primary"
                            onClick={() => saveForLater(item)}
                          >
                            Save for Later
                          </button>
                          <span className="text-outline-variant" aria-hidden>
                            |
                          </span>
                          <button
                            type="button"
                            className="text-error transition-opacity hover:opacity-80"
                            onClick={() => removeItem(item)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Provenance micro-bar */}
                    <div className="flex flex-wrap items-center justify-between gap-1 rounded-lg bg-surface-container-low/70 px-space-md py-space-xs text-body-sm text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <IconBadgeCheck size={16} className="text-secondary" />
                        {item.subtitle ?? "Verified listing"}
                      </span>
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-outline">
                        SKU {item.sku}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Gifting concierge — honest routing, no fabricated surcharge */}
            <section
              aria-label="Gifting"
              className="flex flex-col items-start justify-between gap-space-md rounded-xl bg-surface-container-low p-space-lg shadow-sm sm:flex-row sm:items-center"
            >
              <div className="flex items-start gap-space-md">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed shadow-sm">
                  <IconGift size={24} />
                </div>
                <div className="space-y-1">
                  <h2 className="font-display text-headline-sm font-medium text-primary">Planning to gift it?</h2>
                  <p className="max-w-lg text-body-sm text-on-surface-variant">
                    Our concierge can arrange gift-ready packaging and a handwritten note for this order —
                    tell us before you check out.
                  </p>
                </div>
              </div>
              <Link
                href="/contact"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-tertiary-fixed px-space-md py-2 text-label-md font-bold uppercase tracking-wider text-on-tertiary-fixed-variant shadow-sm transition-opacity hover:opacity-90"
              >
                Arrange gifting
                <IconArrowRight size={15} />
              </Link>
            </section>

            {/* Trust trio — established brand claims only */}
            <div className="grid grid-cols-1 gap-space-md pt-space-sm md:grid-cols-3">
              <div className="flex items-center gap-space-sm rounded-xl bg-surface-container-low/50 p-space-md">
                <IconBadgeCheck size={26} className="shrink-0 text-secondary" />
                <div>
                  <p className="text-label-sm font-bold uppercase text-on-surface">Verified Listings</p>
                  <p className="text-body-sm text-on-surface-variant">Claims published after checks</p>
                </div>
              </div>
              <div className="flex items-center gap-space-sm rounded-xl bg-surface-container-low/50 p-space-md">
                <IconShieldCheck size={26} className="shrink-0 text-primary" />
                <div>
                  <p className="text-label-sm font-bold uppercase text-on-surface">Secure Checkout</p>
                  <p className="text-body-sm text-on-surface-variant">Prices &amp; stock re-validated</p>
                </div>
              </div>
              <div className="flex items-center gap-space-sm rounded-xl bg-surface-container-low/50 p-space-md">
                <IconTruck size={26} className="shrink-0 text-secondary" />
                <div>
                  <p className="text-label-sm font-bold uppercase text-on-surface">Pan-India Delivery</p>
                  <p className="text-body-sm text-on-surface-variant">We deliver across India</p>
                </div>
              </div>
            </div>
          </div>

          {/* Order summary plinth */}
          <aside aria-label="Order summary" className="flex flex-col gap-space-lg lg:col-span-4 lg:sticky lg:top-28">
            <div className="card-soft flex flex-col gap-space-md p-space-lg">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-space-xs">
                <h2 className="font-display text-headline-sm font-semibold text-primary">Order Summary</h2>
                <span className="text-label-sm uppercase tracking-widest text-outline">INR · ₹</span>
              </div>

              <div className="flex flex-col gap-space-sm text-body-md text-on-surface-variant" aria-live="polite">
                <div className="flex items-center justify-between">
                  <span>Items subtotal</span>
                  <span className="font-bold text-on-surface text-tabular">{fmt(displaySubtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Shipping</span>
                  {quote ? (
                    <span className={`font-semibold uppercase text-label-sm ${quote.shippingPaise === 0 ? "text-secondary" : "text-on-surface text-tabular"}`}>
                      {quote.shippingPaise === 0 ? "Free" : fmt(quote.shippingPaise)}
                    </span>
                  ) : (
                    <span className="text-label-sm text-outline">Calculated at checkout</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>Taxes</span>
                  <span className="text-label-sm text-outline">At checkout, as applicable</span>
                </div>
              </div>

              {quoting && (
                <p className="text-label-sm text-outline" role="status">
                  Updating totals from the store…
                </p>
              )}
              {priceNotice && !quoting && (
                <p className="rounded-lg bg-secondary-container/40 p-2.5 text-body-sm text-on-secondary-container">
                  Basket prices were refreshed to match the store&apos;s current pricing.
                </p>
              )}
              {unavailableNotice && !quoting && (
                <p className="rounded-lg bg-error-container p-2.5 text-body-sm text-on-error-container" role="alert">
                  {unavailableNotice}
                </p>
              )}
              {quoteError && (
                <p className="rounded-lg bg-error-container p-2.5 text-body-sm text-on-error-container" role="alert">
                  {quoteError}{" "}
                  <button type="button" className="font-semibold underline" onClick={() => void runQuote()}>
                    Retry
                  </button>
                </p>
              )}

              <div className="motif-divider my-space-xs" aria-hidden />

              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-label-sm font-bold uppercase tracking-wider text-outline">Total</p>
                  <p className="text-body-sm text-on-surface-variant">
                    {quote ? "Server-validated estimate" : "Shipping may apply at checkout"}
                  </p>
                </div>
                <span className="font-display text-[2rem] font-bold leading-10 text-primary text-tabular">
                  {fmt(displayTotal)}
                </span>
              </div>

              <Link
                href={auth.principal ? "/checkout" : "/account/login?next=/checkout"}
                onClick={(e) => {
                  if (cart.items.length === 0) e.preventDefault();
                }}
                className="btn-primary flex w-full items-center justify-center gap-space-sm rounded-lg px-space-lg py-space-md text-center text-label-lg uppercase tracking-wider shadow-md"
              >
                <IconShieldCheck size={20} />
                Proceed to Checkout{displayTotal > 0 ? ` • ${fmt(displayTotal)}` : ""}
              </Link>

              <div className="flex items-center gap-space-xs rounded-lg bg-surface-container-low/40 p-space-sm text-body-sm text-on-surface-variant">
                <IconCheck size={18} className="shrink-0 text-secondary" />
                <span>
                  The basket is a shopping intent — the server confirms every price at checkout, and a free account
                  (Google or email) is all it takes to place the order. Browsing stays open to everyone.
                </span>
              </div>
            </div>
          </aside>
        </div>

        {/* Cross-sell: real bestsellers, filtered against the basket */}
        {crossSellPicks.length > 0 && (
          <section
            aria-label="Pairings for your cart"
            className="flex flex-col gap-space-lg border-t border-outline-variant/30 pt-space-xl"
          >
            <div className="flex flex-col justify-between gap-space-sm sm:flex-row sm:items-end">
              <div>
                <span className="text-label-sm font-bold uppercase tracking-widest text-primary">
                  Pantry Bestsellers
                </span>
                <h2 className="mt-1 font-display text-headline-md font-medium text-on-surface">
                  Complements Your Pantry Selection
                </h2>
              </div>
              <p className="text-body-sm text-on-surface-variant">Real catalogue bestsellers — add without leaving your cart.</p>
            </div>
            <div className="grid grid-cols-1 gap-space-lg md:grid-cols-3">
              {crossSellPicks.map((product) => {
                const variant = product.variants.find((v) => v.status === "published" && availableQty(v) > 0);
                if (!variant) return null;
                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex min-w-0 items-center gap-space-md">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-container">
                        <img
                          src={product.images[0]?.url ?? "/demo-images/placeholder.svg"}
                          alt={product.images[0]?.alt || product.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/product/${product.slug}`}
                          className="block truncate text-[1rem] font-semibold leading-snug text-on-surface transition-colors hover:text-primary"
                        >
                          {product.name}
                        </Link>
                        <p className="truncate text-body-sm text-on-surface-variant">
                          {variant.packLabel} · {product.subtitle}
                        </p>
                        <p className="pt-0.5 text-label-md font-bold text-primary text-tabular">
                          {fmt(variant.pricePaise)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addCrossSell(product)}
                      aria-label={`Add ${product.name} (${variant.packLabel}) to cart`}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-surface-container-low px-space-md py-1.5 text-label-sm font-bold uppercase tracking-wider text-primary shadow-sm transition-colors hover:bg-primary hover:text-on-primary"
                    >
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Toast — announced to assistive tech, auto-dismisses */}
      <div aria-live="polite" role="status">
        {toast && (
          <div
            key={toast.id}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-space-sm rounded-xl bg-primary px-space-lg py-space-sm text-label-md text-on-primary shadow-2xl"
          >
            <IconCheck size={18} />
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}
