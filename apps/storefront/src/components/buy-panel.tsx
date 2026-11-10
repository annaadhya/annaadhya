"use client";
/** Approved Stitch buy panel for the product page: variant card grid with per-variant
 *  pricing and stock, quantity stepper, Add to Bag with live line total, Buy Now
 *  (real cart + real /checkout route) and gifting inquiry link.
 *
 *  Honesty rules encoded here:
 *   - strike-through price / "Save N%" render ONLY when the variant truly has an MRP
 *     (mrpPaise) — the demo catalogue has none, so nothing is fabricated
 *   - out-of-stock variants stay selectable (visually distinct) but can never be added
 *   - no ratings, review counts, stock countdowns or dispatch promises are invented
 *   - the free-shipping claim reads the store settings prop (server truth), never a
 *     hardcoded number — checkout charges exactly what this panel promises
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useAuth } from "@/lib/auth";
import { availableQty, formatINR } from "@/lib/format";
import type { ProductWithVariantsShape, PublicStoreSettings } from "@/lib/types";
import { IconBadgeCheck, IconCheck, IconHeart, IconShieldCheck, IconShoppingBag, IconTruck } from "./icons";

export function BuyPanel({
  product,
  shipping = null,
}: {
  product: ProductWithVariantsShape;
  shipping?: PublicStoreSettings["shipping"] | null;
}) {
  const router = useRouter();
  const auth = useAuth();
  const cart = useCart();
  const wishlist = useWishlist();

  const variants = useMemo(
    () => product.variants.filter((v) => v.status === "published"),
    [product.variants],
  );
  const firstAvailable = variants.find((v) => availableQty(v) > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState(firstAvailable?.id ?? "");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const selected = variants.find((v) => v.id === selectedId) ?? firstAvailable;
  const available = selected ? availableQty(selected) : 0;
  // Inventory policy: untracked products sell without limits; allow/notify backorders keep
  // the buy path open past zero stock (the API records the shortfall server-side).
  const tracked = product.trackInventory !== false;
  const backorderable = tracked && (product.backorderPolicy === "allow" || product.backorderPolicy === "notify");
  const unlimited = !tracked;
  const openSale = unlimited || backorderable;
  const outOfStock = !selected || (!openSale && available <= 0);
  // Free-shipping threshold from the store settings (server truth). Null when the
  // store has no numeric threshold configured — the copy then drops the number.
  const freeAbovePaise =
    shipping?.mode === "flat_rate" && shipping.freeAbovePaise && shipping.freeAbovePaise > 0
      ? shipping.freeAbovePaise
      : null;
  // Cart itself caps quantity at 99 per line; open-sale lines share that cap.
  const qtyCap = openSale ? 99 : Math.min(available || 1, 99);
  const saved = wishlist.has(product.slug);

  function cartItem() {
    if (!selected) return null;
    return {
      variantId: selected.id,
      productId: product.id,
      slug: product.slug,
      sku: selected.sku,
      name: product.name,
      packLabel: selected.packLabel,
      image: product.images[0]?.url,
      subtitle: product.subtitle,
      unitPricePaise: selected.pricePaise,
    } as const;
  }

  function addToBag(): boolean {
    const item = cartItem();
    if (!item || outOfStock) return false;
    cart.add(item, qty);
    return true;
  }

  function handleAdd() {
    if (addToBag()) {
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    }
  }

  function handleBuyNow() {
    // No guest purchase: Buy Now routes through sign-in when there is no session —
    // the item is already in the basket and /checkout brings it right back.
    if (addToBag()) router.push(auth.principal ? "/checkout" : "/account/login?next=/checkout");
  }

  if (!selected) {
    // No published variants — the product is not sellable yet; keep the page honest.
    return (
      <div className="card-soft p-space-lg">
        <h1 className="font-display text-headline-lg-mobile text-primary lg:text-headline-lg">{product.name}</h1>
        <p className="mt-space-sm text-body-md text-on-surface-variant">{product.subtitle}</p>
        <p className="mt-space-md text-body-md font-semibold text-primary">
          This product is being restocked — pack sizes are not open for sale right now.
        </p>
        <Link href="/shop" className="btn-primary mt-space-lg inline-block px-6 py-2.5 text-label-lg">
          Browse available products
        </Link>
      </div>
    );
  }

  const showMrp = Boolean(selected.mrpPaise && selected.mrpPaise > selected.pricePaise);
  const savePct = showMrp ? Math.round((1 - selected.pricePaise / selected.mrpPaise!) * 100) : 0;

  return (
    <div id="buy" className="flex scroll-mt-28 flex-col gap-space-md">
      {/* Eyebrow & brand row */}
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-label-sm font-bold uppercase tracking-widest text-secondary">{product.typeLabel}</span>
          <span className="text-outline-variant" aria-hidden>
            •
          </span>
          <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">Annaadhya Pantry</span>
          {product.giftItem && (
            <span className="rounded-full bg-secondary-fixed px-2 py-0.5 text-label-sm font-semibold text-on-secondary-fixed-variant">
              Gifting favourite
            </span>
          )}
        </div>
        <h1 className="font-display text-headline-lg-mobile font-medium tracking-tight text-primary lg:text-headline-lg">
          {product.name}
        </h1>
        <p className="mt-2 text-body-md leading-relaxed text-on-surface-variant">{product.subtitle}</p>
      </div>

      {/* Meta row — honest chips + wishlist (no fabricated ratings) */}
      <div className="flex flex-wrap items-center gap-space-md">
        {product.bestsellerRank !== undefined && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 text-label-sm font-semibold text-primary">
            <IconBadgeCheck size={14} />
            Pantry bestseller
          </span>
        )}
        <button
          type="button"
          aria-pressed={saved}
          onClick={() => wishlist.toggle(product.slug)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-label-md font-semibold shadow-sm transition-all ${
            saved
              ? "bg-primary text-on-primary"
              : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
          }`}
        >
          <IconHeart size={15} filled={saved} />
          {saved ? "In wishlist" : "Add to wishlist"}
        </button>
      </div>

      {/* Dynamic pricing box */}
      <div className="flex items-baseline justify-between gap-space-md rounded-lg bg-surface-container-low p-space-md shadow-sm">
        <div>
          <div className="flex items-baseline gap-space-sm">
            <span className="font-display text-[1.75rem] font-bold leading-9 text-primary text-tabular lg:text-headline-md lg:leading-9">
              {formatINR(selected.pricePaise, false)}
            </span>
            {showMrp && (
              <span className="text-body-md text-on-surface-variant line-through text-tabular">
                {formatINR(selected.mrpPaise!, false)}
              </span>
            )}
            {showMrp && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-label-sm font-bold text-on-primary">
                Save {savePct}%
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-body-sm font-medium text-secondary">
            <IconTruck size={16} />
            {freeAbovePaise != null
              ? `Complimentary pan-India shipping above ${formatINR(freeAbovePaise, false)}`
              : "Complimentary pan-India shipping"}
          </p>
        </div>
        <div className="text-right">
          <span className="block text-label-sm text-on-surface-variant">per {selected.packLabel}</span>
          <span className="block text-label-sm font-semibold text-primary">Taxes at checkout as applicable</span>
        </div>
      </div>

      {/* Variant selection */}
      {variants.length > 1 && (
        <div className="space-y-space-xs">
          <div className="flex items-center justify-between">
            <span className="text-label-lg font-semibold text-on-surface" id="pack-size-label">
              Select pack size
            </span>
            <a href="#pantry-notes" className="text-label-sm text-primary underline-offset-2 hover:underline">
              Usage &amp; storage notes
            </a>
          </div>
          <div
            className="grid grid-cols-3 gap-space-sm"
            role="radiogroup"
            aria-labelledby="pack-size-label"
          >
            {variants.map((v) => {
              const isSel = v.id === selected.id;
              const vAvail = availableQty(v);
              const vOut = vAvail <= 0;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  onClick={() => {
                    setSelectedId(v.id);
                    setQty(1);
                  }}
                  className={`flex flex-col items-start rounded-lg p-space-sm text-left transition-all shadow-sm ${
                    isSel
                      ? "bg-primary-container text-on-primary ring-2 ring-primary-container"
                      : vOut
                        ? "bg-surface-container-lowest text-on-surface-variant opacity-70 hover:bg-surface-container-low"
                        : "bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  <span className="flex w-full items-center justify-between text-label-md font-bold">
                    {v.packLabel}
                    {isSel && !vOut && <IconCheck size={15} />}
                  </span>
                  <span className="mt-0.5 text-label-lg font-bold text-tabular">
                    {formatINR(v.pricePaise, false)}
                  </span>
                  <span
                    className={`mt-0.5 text-[0.625rem] font-semibold uppercase tracking-wider ${
                      vOut && !openSale ? "text-on-error-container" : isSel ? "text-primary-fixed" : "text-secondary"
                    }`}
                  >
                    {vOut && openSale ? "Backorder" : vOut ? "Out of stock" : vAvail <= v.lowStockThreshold ? "Low stock" : "In stock"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Stock status line */}
      <p className="flex items-center gap-1.5 pt-1 text-body-sm text-on-surface-variant" role="status">
        <span
          className={`h-2 w-2 rounded-full ${outOfStock ? "bg-error" : openSale && available <= 0 ? "bg-tertiary" : "bg-secondary"}`}
          aria-hidden
        />
        {unlimited ? (
          <span>In stock and ready to ship.</span>
        ) : backorderable && outOfStock ? (
          <span>
            <strong className="font-semibold text-on-surface">Available on backorder</strong> — order now and it ships
            after the next verified batch.
          </span>
        ) : backorderable && available <= selected.lowStockThreshold ? (
          <span>
            <strong className="font-semibold text-on-surface">Only {available} left</strong> — orders beyond that ship
            after restock.
          </span>
        ) : outOfStock ? (
          <span>
            <strong className="font-semibold text-on-error-container">Out of stock</strong> — pick another pack
            size, or check back after the next verified batch.
          </span>
        ) : available <= selected.lowStockThreshold ? (
          <span>
            <strong className="font-semibold text-on-surface">Only {available} left</strong> — small batches,
            listed after verification.
          </span>
        ) : (
          <span>In stock and ready to ship.</span>
        )}
      </p>

      {/* Quantity stepper & primary action */}
      <div className="flex flex-col items-stretch gap-space-sm pt-2 sm:flex-row">
        <div className="flex items-center justify-between rounded-lg bg-surface-container-low px-2 py-1 shadow-sm sm:w-36">
          <button
            type="button"
            aria-label="Decrease quantity"
            className="flex h-8 w-8 items-center justify-center rounded text-lg font-bold text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-40"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1 || outOfStock}
          >
            −
          </button>
          <span className="text-label-lg font-bold text-primary text-tabular" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            className="flex h-8 w-8 items-center justify-center rounded text-lg font-bold text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-40"
            onClick={() => setQty((q) => Math.min(qtyCap, q + 1))}
            disabled={outOfStock || qty >= qtyCap}
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={outOfStock}
          className={`group flex flex-1 items-center justify-center gap-2 rounded-lg px-space-lg py-3 text-label-lg shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-55 ${
            added ? "bg-heritage-green text-on-secondary" : "btn-primary"
          }`}
        >
          {added ? (
            <>
              <IconCheck size={18} />
              <span>Added to bag</span>
              <Link href="/cart" className="underline underline-offset-2">
                View cart
              </Link>
            </>
          ) : (
            <>
              <IconShoppingBag size={19} className="transition-transform group-hover:-translate-y-0.5" />
              <span>
                {outOfStock
                  ? "Out of stock"
                  : variants.length > 1
                    ? `Add to Bag • ${formatINR(selected.pricePaise * qty, false)}`
                    : "Add to Bag"}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Secondary actions */}
      <div className="grid grid-cols-2 gap-space-sm">
        <button
          type="button"
          onClick={handleBuyNow}
          disabled={outOfStock}
          className="btn-secondary flex items-center justify-center gap-1.5 rounded-lg px-space-md py-2.5 text-label-md font-bold uppercase tracking-wide shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-55"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          Buy Now
        </button>
        <Link
          href="/contact"
          className="flex items-center justify-center gap-1.5 rounded-lg bg-surface-container-lowest px-space-md py-2.5 text-label-md font-semibold text-primary shadow-sm transition-all hover:bg-surface-container-low"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="8" width="18" height="4" rx="1" />
            <path d="M12 8v13" />
            <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
            <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
          </svg>
          Gift This
        </Link>
      </div>

      {/* Trust trio — real brand practices only */}
      <div className="grid grid-cols-3 gap-space-sm pt-space-xs">
        <div className="flex flex-col items-center rounded-lg bg-surface-container-low/60 p-space-sm text-center">
          <IconBadgeCheck size={22} className="mb-1 text-secondary" />
          <span className="text-label-sm font-semibold text-on-surface">Verified Listings</span>
          <span className="text-[0.6875rem] leading-4 text-on-surface-variant">Claims published after checks</span>
        </div>
        <div className="flex flex-col items-center rounded-lg bg-surface-container-low/60 p-space-sm text-center">
          <IconShieldCheck size={22} className="mb-1 text-primary" />
          <span className="text-label-sm font-semibold text-on-surface">Secure Checkout</span>
          <span className="text-[0.6875rem] leading-4 text-on-surface-variant">Price &amp; stock re-validated</span>
        </div>
        <div className="flex flex-col items-center rounded-lg bg-surface-container-low/60 p-space-sm text-center">
          <IconTruck size={22} className="mb-1 text-secondary" />
          <span className="text-label-sm font-semibold text-on-surface">Pan-India Shipping</span>
          <span className="text-[0.6875rem] leading-4 text-on-surface-variant">
            {freeAbovePaise != null
              ? `Complimentary above ${formatINR(freeAbovePaise, false)}`
              : "Complimentary shipping"}
          </span>
        </div>
      </div>
    </div>
  );
}
