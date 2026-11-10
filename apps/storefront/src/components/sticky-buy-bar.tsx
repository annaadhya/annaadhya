"use client";
/** Mobile sticky purchase bar from the approved design. Appears on small screens once
 *  the main buy panel scrolls out of view.
 *  - single-variant products: the button adds the (unambiguous) pack directly to the cart
 *  - multi-variant products: it scrolls back to the buy panel so the shopper always picks
 *    the pack themselves — the bar never guesses a variant on their behalf */
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { availableQty, formatINR } from "@/lib/format";
import type { ProductWithVariantsShape } from "@/lib/types";
import { IconCheck, IconShoppingBag } from "./icons";

export function StickyBuyBar({ product }: { product: ProductWithVariantsShape }) {
  const cart = useCart();
  const [visible, setVisible] = useState(false);
  const [added, setAdded] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const variants = product.variants.filter((v) => v.status === "published");
  const single = variants.length === 1 ? variants[0] : undefined;
  const singleAvailable = single ? availableQty(single) : 0;
  const fromPrice = variants.length ? Math.min(...variants.map((v) => v.pricePaise)) : 0;

  useEffect(() => {
    const target = document.getElementById("buy");
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: "-80px 0px 0px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  function handleAdd() {
    if (!single || singleAvailable <= 0) return;
    cart.add(
      {
        variantId: single.id,
        productId: product.id,
        slug: product.slug,
        sku: single.sku,
        name: product.name,
        packLabel: single.packLabel,
        image: product.images[0]?.url,
        unitPricePaise: single.pricePaise,
      },
      1,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  function scrollToBuy() {
    document.getElementById("buy")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      {/* Sentinel lives next to the buy panel via portal-free positioning: the observer
          watches #buy directly; this ref block simply reserves no layout space. */}
      <div ref={sentinelRef} aria-hidden className="hidden" />
      <div
        aria-hidden={!visible}
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant/50 bg-surface-container-lowest/95 px-margin-mobile py-space-sm backdrop-blur-xl transition-transform duration-300 lg:hidden ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between gap-space-md">
          <div className="min-w-0">
            <p className="truncate text-label-md font-semibold text-on-surface">{product.name}</p>
            <p className="text-label-sm text-on-surface-variant text-tabular">
              {single
                ? `${single.packLabel} • ${formatINR(single.pricePaise, false)}`
                : `From ${formatINR(fromPrice, false)}`}
            </p>
          </div>
          {single ? (
            <button
              type="button"
              onClick={handleAdd}
              disabled={singleAvailable <= 0}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2.5 text-label-md font-semibold shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-55 ${
                added ? "bg-heritage-green text-on-secondary" : "btn-primary"
              }`}
            >
              {added ? (
                <>
                  <IconCheck size={16} />
                  Added
                </>
              ) : (
                <>
                  <IconShoppingBag size={16} />
                  {singleAvailable <= 0 ? "Out of stock" : "Add to Bag"}
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={scrollToBuy}
              className="btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2.5 text-label-md font-semibold shadow-md"
            >
              <IconShoppingBag size={16} />
              Choose pack
            </button>
          )}
        </div>
      </div>
    </>
  );
}
