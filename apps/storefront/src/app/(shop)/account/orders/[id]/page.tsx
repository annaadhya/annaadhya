"use client";
/**
 * /account/orders/[id] — Order Details (heritage).
 *
 * Renders only what the order document actually records: item/price snapshots,
 * embedded address snapshot, order vs payment vs shipment statuses kept separate,
 * and admin-recorded shipment details (carrier + AWB). Live courier tracking is
 * hosted by Shiprocket at https://shiprocket.co/tracking/{AWB} — the "Track
 * Shipment" action opens it in a new tab; no tracking events are invented here.
 * Data: GET /orders/mine/:id with the customer's bearer token; the API 404s any
 * order that doesn't belong to the authenticated customer.
 */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiGetAuth } from "@/lib/api";
import { formatINR, formatDateTimeIN } from "@/lib/format";
import {
  fulfilmentRank,
  orderMilestones,
  shiprocketTrackingUrl,
  type OrderDetail,
} from "@/lib/order";
import { paymentLabel, statusBadge } from "@/components/account/account-shared";
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconExternal,
  IconHouse,
  IconMapPin,
  IconPackage,
  IconPrinter,
  IconSearchOff,
  IconShieldCheck,
  IconTruck,
  IconWallet,
  IconXCircle,
} from "@/components/icons";

const MILESTONE_ICONS = { placed: IconCheck, confirmed: IconShieldCheck, shipped: IconTruck, delivered: IconHouse };

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      className="inline-flex items-center gap-1 rounded bg-surface px-2 py-1 text-xs font-semibold text-on-surface-variant transition-colors hover:text-primary"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function OrderDetailPage() {
  const auth = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.principal) router.replace("/account/login?next=/account/orders");
  }, [auth.loading, auth.principal, router]);

  useEffect(() => {
    if (!auth.token || !params?.id) return;
    setLoading(true);
    apiGetAuth<OrderDetail>(`/orders/mine/${params.id}`, auth.token)
      .then((o) => {
        setOrder(o);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [auth.token, params?.id]);

  if (auth.loading || (loading && !order && !error)) return <OrderSkeleton />;

  if (error) {
    return (
      <div className="bg-surface">
        <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
          <div className="rounded-2xl bg-surface-container-low p-10 text-center shadow-sm">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container text-primary">
              <IconSearchOff size={32} />
            </div>
            <p className="mb-1 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-primary">Order enquiry</p>
            <h1 className="font-display mb-3 text-2xl font-semibold text-primary sm:text-3xl">
              We couldn&apos;t load this order
            </h1>
            <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-on-surface-variant">
              {error} — it may belong to another account, or the link is out of date. All your orders live under Order
              Archives.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/account/orders"
                className="inline-flex items-center gap-2 rounded bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-container"
              >
                Open Order Archives
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded bg-surface-container px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
              >
                Contact support
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const milestones = orderMilestones(order);
  const isCancelled = order.status === "cancelled" || order.status === "refunded";
  const statusPill = statusBadge(order.status);
  const trackUrl = order.tracking ? shiprocketTrackingUrl(order.tracking.trackingNumber) : null;
  const itemCount = order.items.reduce((n, i) => n + i.qty, 0);
  const printDate = new Date(order.createdAt).toISOString();

  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Breadcrumb + back link */}
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center justify-between gap-y-2">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
            <li>
              <Link href="/account" className="transition-colors hover:text-primary">
                My Account
              </Link>
            </li>
            <li aria-hidden className="text-outline-variant">
              <IconChevronRight size={14} />
            </li>
            <li>
              <Link href="/account/orders" className="transition-colors hover:text-primary">
                Order Archives
              </Link>
            </li>
            <li aria-hidden className="text-outline-variant">
              <IconChevronRight size={14} />
            </li>
            <li aria-current="page" className="font-bold tracking-wide text-primary">
              Order #{order.orderNumber}
            </li>
          </ol>
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary transition-all hover:underline"
          >
            <IconChevronLeft size={16} />
            Back to All Orders
          </Link>
        </nav>

        {/* Headline */}
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 rounded-full bg-secondary" />
              <span className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-secondary">
                Consignment Chronicle
              </span>
            </div>
            <h1 className="font-display text-3xl tracking-tight text-primary sm:text-4xl">Order Details</h1>
            <p className="mt-1.5 max-w-2xl text-[0.925rem] text-on-surface-variant">
              The complete record of this order — items, payment, and delivery, exactly as they were at purchase.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded bg-surface-container px-4 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
            >
              <IconPrinter size={16} />
              Print Receipt
            </button>
          </div>
        </div>

        {/* Payment exception banners */}
        {order.status === "pending_payment" && (
          <div className="mb-8 flex flex-col items-start justify-between gap-3 rounded-2xl bg-tertiary-fixed p-4 text-on-tertiary-fixed shadow-sm sm:flex-row sm:items-center">
            <div className="flex items-start gap-3 sm:items-center">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tertiary-container text-tertiary-fixed">
                <IconClock size={20} />
              </div>
              <div>
                <p className="text-sm font-bold">Payment awaiting confirmation</p>
                <p className="text-[0.8125rem] text-on-tertiary-fixed-variant">
                  The payment provider hasn&apos;t confirmed this transaction yet. Your items are reserved in the
                  meantime.
                </p>
              </div>
            </div>
          </div>
        )}
        {order.paymentStatus === "failed" && order.status !== "pending_payment" && (
          <div className="mb-8 flex flex-col items-start justify-between gap-3 rounded-2xl bg-error-container p-4 text-on-error-container shadow-sm sm:flex-row sm:items-center">
            <div className="flex items-start gap-3 sm:items-center">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error text-on-error">
                <IconAlertTriangle size={20} />
              </div>
              <div>
                <p className="text-sm font-bold">Payment failed</p>
                <p className="text-[0.8125rem] text-on-surface-variant">
                  The payment attempt didn&apos;t complete and nothing was charged. Your basket items are still in the
                  cart — you can check out again whenever you&apos;re ready.
                </p>
              </div>
            </div>
            <Link
              href="/cart"
              className="shrink-0 rounded bg-error px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-error transition-opacity hover:opacity-90"
            >
              Retry from cart
            </Link>
          </div>
        )}

        {/* Cancellation banner */}
        {isCancelled && (
          <div className="mb-8 rounded-2xl bg-error-container p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error text-on-error">
                <IconXCircle size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-on-error-container">
                  This order was {order.status === "refunded" ? "refunded" : "cancelled"}
                </p>
                {order.cancelledReason && (
                  <p className="mt-0.5 text-[0.8125rem] text-on-surface-variant">
                    Reason on record: {order.cancelledReason}
                  </p>
                )}
                {order.refundPaise > 0 && (
                  <p className="mt-0.5 text-[0.8125rem] text-on-surface-variant">
                    Refund {order.refundStatus === "completed" ? "completed" : order.refundStatus}:{" "}
                    {formatINR(order.refundPaise)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Order overview card */}
        <div className="mb-8 rounded-2xl bg-surface-container-low p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
                  Reference identifier
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.08em] ${statusPill.className}`}
                >
                  {statusPill.label}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-mono text-xl font-bold tracking-tight text-primary">{order.orderNumber}</h2>
                <CopyButton value={order.orderNumber} label="order number" />
              </div>
              <p className="text-[0.8125rem] text-on-surface-variant">
                Placed on{" "}
                <time dateTime={printDate} className="font-medium text-on-surface">
                  {formatDateTimeIN(order.createdAt)}
                </time>
              </p>
            </div>

            {/* Fulfilment vs settlement — deliberately separate badges */}
            <div className="flex flex-wrap items-stretch gap-3 sm:flex-nowrap">
              <div className="min-w-[200px] flex-1 flex items-center gap-3 rounded-lg bg-surface p-3 sm:flex-initial">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    isCancelled
                      ? "bg-error-container text-on-error-container"
                      : "bg-secondary-fixed text-on-secondary-fixed"
                  }`}
                >
                  {isCancelled ? <IconXCircle size={18} /> : <IconPackage size={18} />}
                </div>
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.1em] text-on-surface-variant">Fulfilment</p>
                  <p
                    className={`text-sm font-bold ${
                      isCancelled ? "text-error" : fulfilmentRank(order.status) >= 3 ? "text-secondary" : "text-on-surface"
                    }`}
                  >
                    {statusPill.label}
                  </p>
                </div>
              </div>
              <div className="min-w-[200px] flex-1 flex items-center gap-3 rounded-lg bg-surface p-3 sm:flex-initial">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    order.paymentStatus === "failed" || order.paymentStatus === "cancelled" || order.paymentStatus === "refunded"
                      ? "bg-error-container text-on-error-container"
                      : order.paymentStatus === "succeeded"
                        ? "bg-secondary-container text-on-secondary-container"
                        : "bg-surface-container-high text-primary"
                  }`}
                >
                  <IconWallet size={18} />
                </div>
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.1em] text-on-surface-variant">Settlement</p>
                  <p className="text-sm font-bold text-on-surface">{paymentLabel(order)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Milestones */}
        {milestones.length > 0 && (
          <div className="mb-8 rounded-2xl bg-surface-container-low p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h3 className="font-display text-[1.375rem] font-medium text-primary">Order Milestones</h3>
                <p className="text-[0.8125rem] text-on-surface-variant">
                  {order.status === "pending_payment"
                    ? "Progress begins once payment is confirmed."
                    : "From your order to your doorstep."}
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-surface px-3 py-1 text-xs text-on-surface sm:self-auto">
                <span aria-hidden className="h-2 w-2 rounded-full bg-secondary" />
                <span>
                  {order.tracking ? (
                    <>
                      Logistics:{" "}
                      <strong className="font-semibold text-primary">
                        {order.tracking.carrier || "Courier"} (AWB #{order.tracking.trackingNumber})
                      </strong>
                    </>
                  ) : (
                    <span className="text-on-surface-variant">Shipment not yet booked</span>
                  )}
                </span>
              </div>
            </div>
            <ol className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {milestones.map((m) => {
                const Icon = MILESTONE_ICONS[m.key];
                return (
                  <li
                    key={m.key}
                    className={`relative flex items-start gap-3 rounded-lg p-3 ${
                      m.state === "done"
                        ? "bg-surface"
                        : m.state === "current"
                          ? "bg-surface-container"
                          : "bg-surface/60 opacity-60"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        m.state === "done"
                          ? "bg-primary text-on-primary"
                          : m.state === "current"
                            ? "bg-secondary text-on-secondary"
                            : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block text-[0.65rem] font-bold uppercase tracking-[0.1em] ${
                          m.state === "pending" ? "text-on-surface-variant" : "text-primary"
                        }`}
                      >
                        {m.state === "done" ? "Completed" : m.state === "current" ? "In progress" : "Pending"}
                      </span>
                      <span className="block text-[0.9375rem] font-semibold text-primary">{m.label}</span>
                      {m.at !== null && (
                        <time className="mt-0.5 block text-xs text-on-surface-variant" dateTime={new Date(m.at).toISOString()}>
                          {formatDateTimeIN(m.at)}
                        </time>
                      )}
                      <span className="mt-1 block text-xs leading-relaxed text-on-surface-variant">{m.description}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* LEFT — items */}
          <section aria-labelledby="items-h" className="space-y-4 lg:col-span-8">
            <div className="flex items-center justify-between pb-1">
              <h3 id="items-h" className="font-display text-[1.375rem] font-medium text-primary">
                Items in this order{" "}
                <span className="text-lg font-normal text-on-surface-variant">
                  ({itemCount} item{itemCount === 1 ? "" : "s"})
                </span>
              </h3>
            </div>

            {order.items.map((item) => (
              <article
                key={`${item.variantId}-${item.sku}`}
                className="flex flex-col items-start gap-4 rounded-2xl bg-surface-container-low p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:p-6"
              >
                <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-lg bg-surface-container sm:w-36">
                  <img
                    src={item.image ?? "/demo-images/placeholder.svg"}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="mt-0.5 text-[1.25rem] font-semibold text-primary">{item.name}</h4>
                        <p className="text-[0.8125rem] text-on-surface-variant">
                          {item.variantLabel}
                          {item.mrpPaise && item.mrpPaise > item.unitPricePaise ? (
                            <span className="ml-2">
                              MRP <s>{formatINR(item.mrpPaise)}</s>
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-on-surface-variant">{item.sku}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[1.125rem] font-bold text-primary">{formatINR(item.lineTotalPaise)}</p>
                        <p className="text-xs text-on-surface-variant">
                          {formatINR(item.unitPricePaise)} each · qty {item.qty}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>

          {/* RIGHT — destination, ledger, tracking */}
          <aside aria-label="Order summary" className="space-y-4 lg:col-span-4">
            {/* Gift delivery — purchaser vs recipient, per the approved layout's honesty rules */}
            {order.isGiftOrder && order.gift ? (
              <div className="rounded-2xl bg-tertiary-fixed/40 p-5 shadow-sm sm:p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-primary">Gift Delivery</h3>
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-primary">
                    Gift order
                  </span>
                </div>
                {order.gift.message ? (
                  <blockquote className="mb-4 rounded-xl bg-surface-container-lowest p-3.5 text-[0.8125rem] italic text-on-surface">
                    &ldquo;{order.gift.message}&rdquo;
                  </blockquote>
                ) : null}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Order placed by</p>
                    <p className="mt-1 text-[0.8125rem] font-semibold text-on-surface">{order.customerContact.displayName}</p>
                    <p className="text-[0.8125rem] text-on-surface-variant">{order.customerContact.email || order.customerContact.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Delivering to</p>
                    <p className="mt-1 text-[0.8125rem] font-semibold text-on-surface">{order.gift.recipientName}</p>
                    <p className="text-[0.8125rem] text-on-surface-variant">{order.gift.recipientPhone}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-on-surface-variant">
                  The parcel ships to the recipient&apos;s address below. Tracking stays in your account — only you
                  see it.
                </p>
              </div>
            ) : null}

            {/* Delivery destination */}
            <div className="rounded-2xl bg-surface-container-low p-5 shadow-sm sm:p-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-primary">Delivery Destination</h3>
                <IconMapPin className="text-secondary" size={20} />
              </div>
              <div className="space-y-1 text-[0.8125rem]">
                <p className="text-sm font-bold text-primary">{order.shippingAddress.fullName}</p>
                {order.shippingAddress.phone && <p className="text-on-surface-variant">{order.shippingAddress.phone}</p>}
                <p className="leading-relaxed text-on-surface-variant">
                  {order.shippingAddress.line1}
                  {order.shippingAddress.line2 ? (
                    <>
                      <br />
                      {order.shippingAddress.line2}
                    </>
                  ) : null}
                  {order.shippingAddress.landmark ? (
                    <>
                      <br />
                      Landmark: {order.shippingAddress.landmark}
                    </>
                  ) : null}
                  <br />
                  {order.shippingAddress.city}, {order.shippingAddress.state} —{" "}
                  <strong className="text-on-surface">{order.shippingAddress.pincode}</strong>
                </p>
              </div>
            </div>

            {/* Price breakdown */}
            <div className="rounded-2xl bg-surface-container-low p-5 shadow-sm sm:p-6">
              <h3 className="mb-3 text-lg font-semibold text-primary">Price Breakdown</h3>
              <dl className="space-y-2.5 border-b border-outline-variant pb-4 text-[0.8125rem]">
                <div className="flex items-center justify-between text-on-surface-variant">
                  <dt>Item subtotal</dt>
                  <dd className="font-mono font-medium text-on-surface">{formatINR(order.subtotalPaise)}</dd>
                </div>
                {order.discountTotalPaise > 0 && (
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <dt>Discounts</dt>
                    <dd className="font-mono font-medium text-secondary">−{formatINR(order.discountTotalPaise)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between text-on-surface-variant">
                  <dt>Shipping</dt>
                  <dd className="font-mono font-medium text-on-surface">
                    {order.shippingPaise === 0 ? (
                      <span className="text-xs font-bold uppercase tracking-wider text-secondary">Free</span>
                    ) : (
                      formatINR(order.shippingPaise)
                    )}
                  </dd>
                </div>
                {order.taxPaise > 0 && (
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <dt>{order.taxLabel ?? "Tax"}</dt>
                    <dd className="font-mono font-medium text-on-surface">{formatINR(order.taxPaise)}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-surface p-3">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.1em] text-on-surface-variant">Grand total</p>
                  <p className="font-display text-xl font-bold text-primary">{formatINR(order.totalPaise)}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.08em] ${
                      order.paymentStatus === "succeeded"
                        ? "bg-secondary-container text-on-secondary-container"
                        : order.paymentStatus === "failed" || order.paymentStatus === "cancelled"
                          ? "bg-error-container text-on-error-container"
                          : "bg-tertiary-fixed text-on-tertiary-fixed"
                    }`}
                  >
                    {order.paymentStatus === "succeeded" ? "Paid" : order.paymentStatus.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
              {order.refundPaise > 0 && (
                <p className="mt-3 rounded-lg bg-error-container/50 p-2.5 text-xs text-on-error-container">
                  Refunded ({order.refundStatus}): −{formatINR(order.refundPaise)}
                </p>
              )}
              <p className="mt-3 truncate rounded bg-surface-container p-2.5 text-xs text-on-surface-variant">
                Payment: {paymentLabel(order)}
              </p>
            </div>

            {/* Tracking & support */}
            <div className="space-y-3 rounded-2xl bg-surface-container-low p-5 shadow-sm sm:p-6">
              <h3 className="text-lg font-semibold text-primary">Tracking &amp; Support</h3>
              {order.tracking ? (
                <>
                  <div className="flex items-center justify-between rounded-lg bg-surface p-3">
                    <div className="min-w-0">
                      <p className="text-[0.65rem] uppercase tracking-[0.1em] text-on-surface-variant">AWB number</p>
                      <p className="truncate font-mono text-sm font-bold text-primary">
                        {order.tracking.trackingNumber}
                      </p>
                    </div>
                    <CopyButton value={order.tracking.trackingNumber} label="AWB number" />
                  </div>
                  {trackUrl ? (
                    <a
                      href={trackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-container"
                    >
                      <IconExternal size={18} />
                      Track Shipment
                    </a>
                  ) : (
                    <p className="text-xs leading-relaxed text-on-surface-variant">
                      This tracking number has an unusual format — copy it and paste it into the courier&apos;s own
                      tracking page.
                    </p>
                  )}
                  <p className="text-center text-xs leading-relaxed text-on-surface-variant">
                    Live courier updates are hosted on Shiprocket&apos;s tracking page
                    {order.tracking.carrier ? ` for ${order.tracking.carrier}` : ""} — it opens in a new tab.
                  </p>
                </>
              ) : (
                <p className="text-[0.8125rem] leading-relaxed text-on-surface-variant">
                  {isCancelled
                    ? "No shipment was booked for this order."
                    : "Your shipment hasn't been booked yet. Tracking appears here as soon as the parcel is handed to the courier."}
                </p>
              )}
              <Link
                href="/contact"
                className="flex w-full items-center justify-center gap-2 rounded bg-surface px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-surface-container"
              >
                Contact Support
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function OrderSkeleton() {
  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8" aria-hidden>
        <div className="mb-6 h-4 w-56 rounded bg-surface-container-high" />
        <div className="mb-2 h-4 w-40 rounded bg-surface-container-high" />
        <div className="mb-8 h-10 w-80 rounded bg-surface-container-high" />
        <div className="mb-8 h-32 rounded-2xl bg-surface-container-low" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            <div className="h-44 rounded-2xl bg-surface-container-low" />
            <div className="h-44 rounded-2xl bg-surface-container-low" />
          </div>
          <div className="space-y-4 lg:col-span-4">
            <div className="h-64 rounded-2xl bg-surface-container-low" />
            <div className="h-80 rounded-2xl bg-surface-container-low" />
          </div>
        </div>
      </div>
    </div>
  );
}
