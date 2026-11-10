"use client";
/** Approved product card: soft-cream plinth, gold hairline, square image, type badge,
 *  weight-variant chips, MRP compare-at price, add-to-cart and wishlist heart.
 *  All data comes from the real catalogue; the card adds the *selected* variant only. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatINR, availableQty } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import type { ProductWithVariantsShape } from "@/lib/types";
import { IconHeart, IconShoppingBag, IconCheck } from "./icons";

export function ProductCard({ product }: { product: ProductWithVariantsShape }) {
  const cart = useCart();
  const wishlist = useWishlist();
  const variants = useMemo(
    () => product.variants.filter((v) => v.status === "published"),
    [product.variants],
  );
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const [added, setAdded] = useState(false);

  if (variants.length === 0) return null;

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  const image = product.images[0]?.url ?? "/demo-images/placeholder.svg";
  const soldOut = availableQty(selected) <= 0;
  const saved = wishlist.has(product.slug);
  const showMrp = selected.mrpPaise && selected.mrpPaise > selected.pricePaise;

  function add() {
    if (!selected || soldOut) return;
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
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="group relative flex flex-col rounded-lg bg-surface-container-lowest p-space-md shadow-sm transition-all duration-300 hover:shadow-lg">
      {/* Stretched-link: the WHOLE card opens the product (image, title, copy,
          price — everywhere), per the approved UX. Interactive controls stay
          usable by sitting above this overlay (z-10 below). Keyboard users
          reach the product via the title link; this overlay is pointer-only
          (tabIndex -1, no duplicate tab stop). */}
      <Link
        href={`/product/${product.slug}`}
        aria-label={`View ${product.name}`}
        tabIndex={-1}
        className="absolute inset-0 z-10 rounded-lg"
      />
      <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-surface-container">
        {/* Demo SVG placeholders are replaceable; Cloudinary photography drops into the same field. */}
        <img
          src={image}
          alt={product.images[0]?.alt || product.name}
          loading="lazy"
          className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        />
        <button
          type="button"
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          aria-pressed={saved}
          onClick={() => wishlist.toggle(product.slug)}
          className={`absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full shadow-sm transition-all ${
            saved
              ? "bg-primary text-on-primary"
              : "bg-surface-container-lowest/90 text-on-surface-variant hover:bg-primary hover:text-on-primary"
          }`}
        >
          <IconHeart size={17} filled={saved} />
        </button>
        {soldOut ? (
          <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-on-surface backdrop-blur-sm">
            Out of stock
          </span>
        ) : (
          product.typeLabel && (
            <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-primary backdrop-blur-sm">
              {product.typeLabel}
            </span>
          )
        )}
      </div>

      <div className="flex flex-grow flex-col pt-space-md">
        <Link href={`/product/${product.slug}`} className="group/link">
          <h3 className="text-headline-sm text-on-surface transition-colors group-hover:text-primary">
            {product.name}
          </h3>
        </Link>
        <p className="mt-1 line-clamp-2 text-body-sm text-on-surface-variant">{product.subtitle}</p>

        {/* Weight variant chips — interactive: kept above the card overlay */}
        <div className="relative z-20 my-space-md flex flex-wrap items-center gap-space-xs" role="radiogroup" aria-label={`Pack size for ${product.name}`}>
          {variants.map((v) => {
            const isSel = v.id === selected?.id;
            const vAvail = availableQty(v);
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={isSel}
                disabled={vAvail <= 0}
                onClick={() => setSelectedId(v.id)}
                className={`rounded-sm px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isSel
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                }`}
              >
                {v.packLabel}
              </button>
            );
          })}
        </div>

        {/* Price + cart — interactive: kept above the card overlay */}
        <div className="relative z-20 mt-auto flex items-center justify-between pt-space-xs">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-space-xs">
              <span className="font-display text-[1.3125rem] font-bold leading-7 text-primary text-tabular">
                {formatINR(selected.pricePaise, false)}
              </span>
              {showMrp && (
                <span className="text-body-sm text-outline line-through text-tabular">
                  {formatINR(selected.mrpPaise!, false)}
                </span>
              )}
            </div>
            {showMrp && (
              <span className="text-[0.625rem] font-semibold uppercase tracking-wider text-secondary">
                Save {Math.round((1 - selected.pricePaise / selected.mrpPaise!) * 100)}%
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={add}
            disabled={soldOut}
            aria-label={`Add ${product.name} (${selected.packLabel}) to cart`}
            className={`inline-flex items-center gap-space-xs rounded-sm px-3.5 py-2 text-label-md font-semibold shadow-sm transition-all ${
              added
                ? "bg-heritage-green text-on-secondary"
                : "bg-primary-container text-on-primary hover:bg-primary"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {added ? (
              <>
                <IconCheck size={15} />
                <span>Added</span>
              </>
            ) : (
              <>
                <IconShoppingBag size={15} />
                <span>{soldOut ? "Sold out" : "Add"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProductGrid({
  products,
  columns = 4,
}: {
  products: ProductWithVariantsShape[];
  /** 4 (default, shop page) or 3 (category template — the approved grid there is wider-carded). */
  columns?: 3 | 4;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-space-md sm:grid-cols-2 ${
        columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"
      } lg:gap-space-lg`}
    >
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg bg-surface-container-lowest shadow-sm" aria-hidden>
      <div className="aspect-square animate-pulse rounded-sm bg-surface-container" />
      <div className="space-y-2 p-space-md">
        <div className="h-3 w-1/3 animate-pulse rounded-sm bg-surface-container" />
        <div className="h-4 w-3/4 animate-pulse rounded-sm bg-surface-container" />
        <div className="h-3 w-1/2 animate-pulse rounded-sm bg-surface-container" />
      </div>
    </div>
  );
}
