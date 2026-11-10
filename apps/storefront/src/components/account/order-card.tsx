"use client";
/**
 * OrderCard — one real order from GET /orders/mine, rendered per the approved
 * account template. Everything shown comes from the order's stored snapshot
 * (name/price/variant at purchase time); status and payment labels come from the
 * real enums. Actions are limited to what actually exists:
 *   - View Order Details → /account/orders/[id]
 *   - Buy Again → re-adds snapshot items to the basket after resolving their
 *     live SKUs; availability is still enforced server-side at checkout quote.
 * No fake "Track Shipment"/invoice/calligraphy buttons — those systems don't exist.
 */
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { PUBLIC_API_URL } from "@/lib/api";
import { formatINR, formatDateIN } from "@/lib/format";
import { IconArrowRight, IconCheck, IconCopy, IconPackage, IconTruck } from "../icons";
import { paymentLabel, statusBadge, type OrderRow } from "./account-shared";

/** Round-rupee amounts render clean (₹1,150); odd paise keep their decimals. */
function fmt(paise: number): string {
  return formatINR(paise, paise % 100 !== 0);
}

interface VariantMeta {
  slug: string;
  productId: string;
  name: string;
  packLabel: string;
  image?: string;
}

export function OrderCard({ order, onNotice }: { order: OrderRow; onNotice: (msg: string) => void }) {
  const cart = useCart();
  const [copied, setCopied] = useState(false);
  const [readding, setReadding] = useState(false);
  const badge = statusBadge(order.status);
  const visibleItems = order.items.slice(0, 3);
  const hiddenCount = order.items.length - visibleItems.length;

  function copyReference() {
    navigator.clipboard?.writeText(order.orderNumber).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => onNotice("Couldn't copy the reference — long-press to select it instead."),
    );
  }

  async function buyAgain() {
    if (readding) return;
    setReadding(true);
    try {
      // Resolve every snapshot SKU against the live catalogue — paged, because the
      // products endpoint caps pageSize at 48 and the catalogue can outgrow one page.
      const skuMap = new Map<string, VariantMeta>();
      for (let page = 1; page <= 5 && skuMap.size < 1000; page++) {
        const res = await fetch(`${PUBLIC_API_URL}/products?page=${page}&pageSize=48`);
        const body = (await res.json()) as {
          ok: boolean;
          data?: { items: { id: string; slug: string; name: string; subtitle: string; images?: { url: string }[]; variants: { sku: string; packLabel: string }[] }[]; totalPages?: number } | null;
        };
        if (!body.ok || !body.data) break;
        for (const p of body.data.items) {
          for (const v of p.variants) {
            skuMap.set(v.sku, { slug: p.slug, productId: p.id, name: p.name, packLabel: v.packLabel, image: p.images?.[0]?.url });
          }
        }
        if (!body.data.totalPages || page >= body.data.totalPages) break;
      }
      let added = 0;
      for (const item of order.items) {
        const live = skuMap.get(item.sku);
        if (!live) continue; // no longer in the catalogue — honest skip, counted below
        cart.add(
          {
            variantId: item.variantId,
            productId: live.productId,
            slug: live.slug,
            sku: item.sku,
            name: live.name,
            packLabel: live.packLabel,
            image: live.image ?? item.image,
            subtitle: live.packLabel,
            unitPricePaise: item.unitPricePaise,
          },
          item.qty,
        );
        added += 1;
      }
      if (added === order.items.length) {
        onNotice("Added to your basket — prices and stock are confirmed at checkout.");
      } else if (added > 0) {
        onNotice(`Added ${added} of ${order.items.length} items — the rest are no longer available.`);
      } else {
        onNotice("These items are no longer available in our catalogue.");
      }
    } catch {
      onNotice("Couldn't start the reorder just now — please try again.");
    } finally {
      setReadding(false);
    }
  }

  return (
    <article className="card-soft overflow-hidden">
      {/* Header strip: reference, date, total, status */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-low/50 px-space-md py-space-sm sm:px-space-lg">
        <div className="flex flex-wrap items-center gap-space-md sm:gap-space-lg">
          <div>
            <span className="block text-label-sm uppercase tracking-wider text-on-surface-variant">Order Reference</span>
            <span className="flex items-center gap-1">
              <span className="font-display text-body-md font-semibold text-primary">{order.orderNumber}</span>
              <button
                type="button"
                onClick={copyReference}
                title={copied ? "Copied" : "Copy reference"}
                aria-label={copied ? "Reference copied" : "Copy order reference"}
                className="rounded-sm p-0.5 text-on-surface-variant transition-colors hover:text-primary"
              >
                {copied ? <IconCheck size={14} className="text-secondary" /> : <IconCopy size={14} />}
              </button>
            </span>
          </div>
          <div>
            <span className="block text-label-sm uppercase tracking-wider text-on-surface-variant">Placed On</span>
            <span className="text-body-sm font-medium text-on-surface">{formatDateIN(order.createdAt)}</span>
          </div>
          <div>
            <span className="block text-label-sm uppercase tracking-wider text-on-surface-variant">Total</span>
            <span className="text-body-sm font-bold text-primary text-tabular">{fmt(order.totalPaise)}</span>
            <span className="text-[11px] text-on-surface-variant"> ({order.items.reduce((n, i) => n + i.qty, 0)} items)</span>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${badge.className}`}>
            {badge.label}
          </span>
          <span className="text-[11px] text-on-surface-variant">{paymentLabel(order)}</span>
        </div>
      </div>

      {/* Items */}
      <div className="grid grid-cols-1 gap-space-md px-space-md py-space-md sm:px-space-lg md:grid-cols-3">
        {visibleItems.map((item) => (
          <div key={item.sku + item.variantId} className="flex min-w-0 items-center gap-space-md rounded-lg bg-soft-cream p-space-sm shadow-sm">
            <img
              src={item.image ?? "/demo-images/placeholder.svg"}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg object-cover"
              loading="lazy"
            />
            <div className="flex min-w-0 flex-col">
              <h4 className="truncate text-body-sm font-medium text-primary">{item.name}</h4>
              <p className="truncate text-[12px] text-on-surface-variant">{item.variantLabel}</p>
              <span className="mt-1 text-[12px] font-semibold text-on-surface text-tabular">
                {fmt(item.lineTotalPaise)}
                {item.qty > 1 && <span className="font-normal text-on-surface-variant"> · qty {item.qty}</span>}
              </span>
            </div>
          </div>
        ))}
        {hiddenCount > 0 && (
          <Link
            href={`/account/orders/${order.id}`}
            className="flex min-h-16 items-center justify-center gap-1 rounded-lg bg-surface-container-low px-space-sm text-label-md text-primary transition-colors hover:bg-surface-container-high"
          >
            +{hiddenCount} more item{hiddenCount > 1 ? "s" : ""}
            <IconArrowRight size={14} />
          </Link>
        )}
      </div>

      {/* Action footer */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm border-t border-outline-variant/40 px-space-md py-space-md sm:px-space-lg">
        <div className="flex items-center gap-space-xs text-[12px] text-on-surface-variant">
          {order.tracking?.trackingNumber ? (
            <>
              <IconTruck size={15} className="text-secondary" />
              <span>
                Tracking: {order.tracking.carrier} · {order.tracking.trackingNumber}
              </span>
            </>
          ) : (
            <>
              <IconPackage size={15} className="text-on-surface-variant/60" />
              <span>Delivery updates appear here as we process your order.</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-space-sm">
          {order.status !== "cancelled" && order.status !== "refunded" && (
            <button
              type="button"
              onClick={() => void buyAgain()}
              disabled={readding}
              className="rounded-sm bg-surface-container px-space-md py-1.5 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-55"
            >
              {readding ? "Adding…" : "Buy Again"}
            </button>
          )}
          <Link href={`/account/orders/${order.id}`} className="btn-primary flex items-center gap-1.5 px-space-md py-1.5 text-label-md">
            View Order Details
            <IconArrowRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}
