"use client";
/**
 * /orders/[id] — the Order Detail console per the approved "Modern Indian Heritage" design.
 *
 * Everything on this page is real; nothing from the Stitch mock is fabricated:
 *  - header badges come from the actual order status / payment status / flags;
 *  - the lifecycle stepper is driven by the real status + recorded timestamps only
 *    (cancelled / refunded orders get a status banner instead of a fake progression);
 *  - items render the historical order snapshot (exact name/variant/SKU/price at purchase);
 *  - payment shows the real provider attempts (GET :id/payments) — payment status is
 *    changed exclusively by verified provider webhooks, never from this page;
 *  - shipping is the MANUAL Shiprocket workflow: staff book the shipment in Shiprocket,
 *    then record carrier + AWB here (the shipped transition, or a later correction via
 *    PATCH :id/tracking). Entries are labelled "Manual entry" so they stay distinguishable
 *    from a future API-synced feed; the tracking link is Shiprocket's public tracking page
 *    (shared, unit-tested helper) and is only rendered when the AWB shape is trusted;
 *  - the timeline lists events actually recorded in the audit log (GET :id/timeline);
 *  - internal notes are staff-only (GET/POST :id/notes, orders:write to add) and are
 *    stored in their own collection that no customer endpoint ever joins.
 *
 * Status transitions offer ONLY what GET /admin/orders/state-machine allows, are
 * confirmed through a dialog, and the server's validation message is surfaced verbatim
 * on failure. `refunded` is intentionally not offered as a status — refunds go through
 * POST :id/refund so provider refunds settle properly.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, apiGet, apiPatch, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { formatDateTime, formatINR, humanize, rupeesToPaise } from "@/lib/format";
import { relativeDayTime } from "@/lib/relative-time";
import { useToast } from "@/lib/toast";
import { shiprocketTrackingUrl } from "@annaadhya/utils/tracking";
import type { AuditLogDoc, OrderDoc, OrderNoteDoc, OrderStatus, PaymentAttemptDoc } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  IconBag,
  IconCheckCircle,
  IconClock,
  IconTruck,
  IconWarning,
} from "@/components/dashboard-icons";

type TransitionMap = Record<string, string[]>;

/* --------------------------- presentation metadata -------------------------- */

/** Menu/dot colour per transition target — mirrors the StatusBadge tones. */
const TARGET_TONES: Record<string, string> = {
  confirmed: "bg-secondary",
  processing: "bg-[#D97706]",
  shipped: "bg-secondary",
  delivered: "bg-secondary",
  cancelled: "bg-error",
  pending_payment: "bg-outline",
};

const PAYMENT_STEP_HINTS: Record<string, string> = {
  succeeded: "Verified by the payment provider",
  pending: "Awaiting provider verification",
  created: "Awaiting provider verification",
  failed: "Provider reported a failure",
  cancelled: "Payment cancelled",
  refunded: "Refunded to the customer",
};

interface LifecycleStep {
  key: string;
  label: string;
  hint: string;
  at: number | null;
  state: "done" | "current" | "pending";
}

/**
 * Honest fulfilment stepper from the real status + recorded timestamps.
 * Cancelled/refunded orders never reach this (the caller renders a banner).
 */
function lifecycleSteps(order: OrderDoc): LifecycleStep[] {
  const rank: Record<string, number> = {
    pending_payment: 0,
    confirmed: 1,
    processing: 1.5,
    shipped: 2,
    delivered: 3,
  };
  const r = rank[order.status] ?? 0;
  const trackingHint = order.tracking
    ? `${order.tracking.carrier || "Courier"} · ${order.tracking.trackingNumber}`
    : "AWB not recorded yet";
  return [
    {
      key: "placed",
      label: "Order placed",
      hint: formatDateTime(order.createdAt),
      at: order.createdAt,
      state: "done",
    },
    {
      key: "payment",
      label: "Payment verified",
      hint:
        order.paymentStatus === "succeeded"
          ? PAYMENT_STEP_HINTS.succeeded
          : order.paymentProvider === "cod"
            ? "Cash on delivery — collect at handoff"
            : (PAYMENT_STEP_HINTS[order.paymentStatus] ?? "Awaiting provider verification"),
      at: null, // the order doc does not record a separate payment timestamp — never invented
      state: r >= 1 ? "done" : "current",
    },
    {
      key: "shipped",
      label: "Shipped",
      hint: trackingHint,
      at: r >= 2 && order.tracking ? order.tracking.updatedAt : null,
      state: r >= 2 ? "done" : r >= 1 ? "current" : "pending",
    },
    {
      key: "delivered",
      label: "Delivered",
      hint: r >= 3 ? `Recorded ${formatDateTime(order.updatedAt)}` : "In transit once dispatched",
      at: r >= 3 ? order.updatedAt : null,
      state: r >= 3 ? "done" : r >= 2 ? "current" : "pending",
    },
  ];
}

/** Real audit actions mapped to stable labels; anything unknown falls back to humanize(). */
function timelineMeta(action: string): { label: string; dotClass: string } {
  switch (action) {
    case "payment.succeeded":
      return { label: "Payment captured", dotClass: "bg-secondary ring-secondary-container" };
    case "payment.amount_mismatch":
      return { label: "Payment amount mismatch", dotClass: "bg-error ring-error-container" };
    case "order.create_cod":
      return { label: "COD order placed", dotClass: "bg-primary ring-primary-fixed" };
    case "order.status_change":
      return { label: "Status changed", dotClass: "bg-primary ring-primary-fixed" };
    case "order.tracking_update":
      return { label: "Tracking updated", dotClass: "bg-secondary ring-secondary-container" };
    case "order.refund":
      return { label: "Refund recorded", dotClass: "bg-tertiary-container ring-tertiary-fixed" };
    case "order.note_add":
      return { label: "Internal note added", dotClass: "bg-outline ring-surface-container-high" };
    default:
      return { label: humanize(action.replace(".", " ")), dotClass: "bg-outline ring-surface-container-high" };
  }
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/* ------------------------------ small pieces ------------------------------- */

function CopyButton({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className={`rounded p-1 text-on-surface-variant/70 transition-colors hover:bg-surface-container-high hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success("Copied", label);
        } catch {
          toast.error("Copy failed", "Clipboard is unavailable in this browser context");
        }
      }}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function ItemThumb({ src, name }: { src?: string; name: string }) {
  if (!src) {
    return (
      <div aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-container text-primary">
        <IconBag className="h-5 w-5" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- historical snapshot URLs may be absolute (Cloudinary) or site-rooted; next/image adds nothing here
    <img
      src={src}
      alt={name}
      loading="lazy"
      className="h-14 w-14 shrink-0 rounded-lg border border-outline-variant/30 bg-surface-container object-cover"
    />
  );
}

/** Menu with outside-click + Escape close — used for the status actions. */
function ActionDropdown({
  triggerLabel,
  triggerIcon,
  children,
  disabled,
}: {
  triggerLabel: string;
  triggerIcon?: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        variant="primary"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {triggerIcon}
        {triggerLabel}
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 space-y-1 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-1.5 shadow-xl"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  onClick,
  children,
  tone = "default",
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
        tone === "danger"
          ? "text-error hover:bg-error-container/60"
          : "text-on-surface hover:bg-surface-container-high"
      }`}
    >
      {children}
    </button>
  );
}

/** The operational lifecycle stepper — filled dots + connecting progress line. */
function LifecycleStepper({ order }: { order: OrderDoc }) {
  const steps = lifecycleSteps(order);
  const doneCount = steps.filter((s) => s.state === "done").length;
  const fillPct = doneCount <= 0 ? 0 : Math.min(100, ((doneCount - 1) / (steps.length - 1)) * 100);
  return (
    <Card>
      <CardHeader
        title="Order lifecycle progression"
        subtitle="Driven by the real order status and recorded timestamps — no projected dates"
        actions={<Badge tone="neutral">{humanize(order.status)}</Badge>}
      />
      <CardBody>
        <ol className="relative grid grid-cols-2 gap-y-6 sm:grid-cols-4">
          <div
            aria-hidden
            className="absolute left-[12%] right-[12%] top-5 hidden h-1 rounded-full bg-surface-container-high sm:block"
          />
          <div
            aria-hidden
            className="absolute left-[12%] top-5 hidden h-1 rounded-full bg-secondary transition-all duration-500 sm:block"
            style={{ width: `calc((100% - 24%) * ${fillPct / 100})` }}
          />
          {steps.map((step) => {
            const done = step.state === "done";
            const current = step.state === "current";
            return (
              <li key={step.key} className="relative z-10 flex flex-col items-center text-center">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-colors ${
                    done
                      ? "bg-secondary text-on-secondary"
                      : current
                        ? "animate-pulse bg-primary text-on-primary ring-4 ring-primary-fixed"
                        : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  {done ? (
                    <IconCheckCircle className="h-5 w-5" />
                  ) : step.key === "shipped" ? (
                    <IconTruck className="h-5 w-5" />
                  ) : step.key === "delivered" ? (
                    <IconCheckCircle className="h-5 w-5" />
                  ) : step.key === "payment" ? (
                    <IconWalletFallback />
                  ) : (
                    <IconClock className="h-5 w-5" />
                  )}
                </span>
                <span className={`mt-2 text-xs font-bold ${current ? "text-primary" : done ? "text-on-surface" : "text-on-surface-variant"}`}>
                  {step.label}
                </span>
                <span className="mt-0.5 max-w-[16ch] text-[11px] leading-tight text-on-surface-variant/90">{step.hint}</span>
                {step.at ? <span className="mt-0.5 text-[11px] text-on-surface-variant/70">{formatDateTime(step.at)}</span> : null}
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}

/** Wallet glyph for the payment step (kept local — the shared set has no plain wallet outline). */
function IconWalletFallback() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M16 12h.01M3 9h16" strokeLinecap="round" />
    </svg>
  );
}

/** Full-page loading skeleton shaped like the detail layout. */
function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading order">
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardBody className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-14 w-14 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-44" />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ================================ the page ================================= */

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? "";
  const { principal } = useAuth();
  const toast = useToast();
  usePageTitle(orderId ? `Order ${orderId}` : "Order detail");

  const canRefund = can(principal, "orders:refund");
  const canWrite = can(principal, "orders:write");

  const { data: order, loading, error, reload } = useApiQuery<OrderDoc>(
    () => apiGet<OrderDoc>(`/admin/orders/${orderId}`),
    [orderId],
  );
  const { data: transitions } = useApiQuery<TransitionMap>(() => apiGet("/admin/orders/state-machine"), [orderId]);
  const { data: timeline, reload: reloadTimeline } = useApiQuery<AuditLogDoc[]>(
    () => apiGet<AuditLogDoc[]>(`/admin/orders/${orderId}/timeline`),
    [orderId],
  );
  const { data: notes, reload: reloadNotes } = useApiQuery<OrderNoteDoc[]>(
    () => apiGet<OrderNoteDoc[]>(`/admin/orders/${orderId}/notes`),
    [orderId],
  );
  const { data: attempts, reload: reloadAttempts } = useApiQuery<PaymentAttemptDoc[]>(
    () => apiGet<PaymentAttemptDoc[]>(`/admin/orders/${orderId}/payments`),
    [orderId],
  );

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // status-transition dialog state
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [shipCarrier, setShipCarrier] = useState("");
  const [shipAwb, setShipAwb] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  // tracking correction state (shipped/delivered orders; prefilled from the record)
  const [trackingEditOpen, setTrackingEditOpen] = useState(false);
  const [editCarrier, setEditCarrier] = useState("");
  const [editAwb, setEditAwb] = useState("");

  // refund dialog state (rupees input, converted at submit)
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  // internal note form state
  const [noteText, setNoteText] = useState("");

  const unpaid = order ? order.paymentStatus !== "succeeded" : false;
  const refundablePaise = order ? Math.max(0, order.totalPaise - order.refundPaise) : 0;
  const trackingUrl = order?.tracking ? shiprocketTrackingUrl(order.tracking.trackingNumber) : null;

  const legalTargets = useMemo<OrderStatus[]>(() => {
    if (!order || !transitions) return [];
    return (transitions[order.status] ?? []).filter((t): t is OrderStatus => t !== "refunded");
  }, [order, transitions]);

  /** Opening the transition dialog prefills what that transition needs. */
  function openTransition(t: OrderStatus) {
    setActionError(null);
    setTarget(t);
    setShipCarrier(order?.tracking?.carrier ?? "");
    setShipAwb(order?.tracking?.trackingNumber ?? "");
    setCancelReason("");
  }

  async function changeStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!order || !target) return;
    setActionError(null);
    if (target === "shipped" && (shipCarrier.trim().length < 1 || shipAwb.trim().length < 3)) {
      setActionError("Carrier and the Shiprocket AWB (3+ characters) are required to record a shipment.");
      return;
    }
    setBusy(true);
    try {
      await apiPost(`/admin/orders/${order.id}/status`, {
        status: target,
        reason: cancelReason.trim() || undefined,
        tracking:
          target === "shipped"
            ? { carrier: shipCarrier.trim(), trackingNumber: shipAwb.trim() }
            : undefined,
      });
      toast.success("Order updated", `${order.orderNumber} → ${humanize(target)}`);
      setTarget(null);
      reload();
      reloadTimeline();
    } catch (err) {
      // e.g. "Only paid orders can move into fulfilment states…" — surface verbatim.
      setActionError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  async function submitTracking(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    setActionError(null);
    if (editCarrier.trim().length < 1 || editAwb.trim().length < 3) {
      setActionError("Carrier and the Shiprocket AWB (3+ characters) are required.");
      return;
    }
    setBusy(true);
    try {
      await apiPatch(`/admin/orders/${order.id}/tracking`, {
        carrier: editCarrier.trim(),
        trackingNumber: editAwb.trim(),
      });
      toast.success("Tracking updated", `${editCarrier.trim()} · ${editAwb.trim()}`);
      setTrackingEditOpen(false);
      reload();
      reloadTimeline();
    } catch (err) {
      // e.g. "Tracking can only be corrected on shipped or delivered orders…" — verbatim.
      setActionError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  async function submitRefund(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    setActionError(null);
    const amountPaise = rupeesToPaise(refundAmount);
    if (Number.isNaN(amountPaise) || amountPaise <= 0) {
      setActionError("Enter a refund amount greater than ₹0.");
      return;
    }
    if (amountPaise > refundablePaise) {
      setActionError(`Refund cannot exceed the refundable balance of ${formatINR(refundablePaise)}.`);
      return;
    }
    if (refundReason.trim().length < 3) {
      setActionError("A reason of at least 3 characters is required for refunds.");
      return;
    }
    setBusy(true);
    try {
      await apiPost(`/admin/orders/${order.id}/refund`, { amountPaise, reason: refundReason.trim() });
      toast.success("Refund recorded", `${formatINR(amountPaise)} on ${order.orderNumber}`);
      setRefundOpen(false);
      setRefundAmount("");
      setRefundReason("");
      reload();
      reloadTimeline();
      reloadAttempts();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  async function submitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    setActionError(null);
    if (noteText.trim().length < 2) {
      setActionError("A note needs at least 2 characters.");
      return;
    }
    setBusy(true);
    try {
      await apiPost(`/admin/orders/${order.id}/notes`, { note: noteText.trim() });
      toast.success("Note added", "Visible to staff only");
      setNoteText("");
      reloadNotes();
      reloadTimeline();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <DetailSkeleton />;

  if (error || !order) {
    return (
      <Card>
        {error?.status === 404 ? (
          <EmptyState
            title="Order not found"
            description={`No order exists for “${orderId}”. It may have been created in a different environment, or the link is stale.`}
            action={
              <Link href="/orders">
                <Button variant="outline" size="sm">
                  Back to all orders
                </Button>
              </Link>
            }
          />
        ) : (
          <ErrorState message={error?.message ?? "Order not found"} status={error?.status} onRetry={reload} />
        )}
      </Card>
    );
  }

  const fulfilmentVisible = order.status !== "cancelled" && order.status !== "refunded";
  const canEditTracking =
    canWrite && (order.status === "shipped" || order.status === "delivered") && !trackingEditOpen;
  const refundEligible = canRefund && order.paymentStatus === "succeeded" && refundablePaise > 0;

  return (
    <div>
      {/* ------------------------------ header ------------------------------ */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/orders"
          className="group inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M20 12H4m0 0 6 6m-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to all orders
        </Link>
        <nav aria-label="Breadcrumb" className="label-eyebrow hidden items-center gap-2 text-on-surface-variant md:flex">
          <span>Commerce</span>
          <span aria-hidden>/</span>
          <Link href="/orders" className="font-bold text-secondary hover:underline">
            Orders
          </Link>
          <span aria-hidden>/</span>
          <span className="text-primary">{order.orderNumber}</span>
        </nav>
      </div>

      <PageHeader
        eyebrow="Order detail"
        title={order.orderNumber}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <IconClock className="h-4 w-4 text-tertiary-container" aria-hidden />
            <span>
              Placed on <strong>{formatDateTime(order.createdAt)}</strong> IST · {order.items.length} item
              {order.items.length === 1 ? "" : "s"} · {humanize(order.paymentProvider)}
            </span>
          </span>
        }
        actions={
          <>
            <StatusBadge status={order.status} />
            <StatusBadge status={order.paymentStatus} />
            {order.isGiftOrder ? <Badge tone="honey">Gift order</Badge> : null}
            {order.isDemo ? <Badge tone="neutral">Demo data</Badge> : null}
          </>
        }
      />

      {/* action bar */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {canWrite ? (
          <ActionDropdown triggerLabel="Update order status" disabled={legalTargets.length === 0}>
            {legalTargets.length === 0 ? (
              <p className="px-3 py-2 text-xs text-on-surface-variant">
                {humanize(order.status)} is a terminal state — no further transitions.
              </p>
            ) : (
              legalTargets.map((t) => (
                <MenuItem key={t} onClick={() => openTransition(t)} tone={t === "cancelled" ? "danger" : "default"}>
                  <span aria-hidden className={`h-2 w-2 rounded-full ${TARGET_TONES[t] ?? "bg-outline"}`} />
                  Mark {humanize(t)}
                </MenuItem>
              ))
            )}
            {refundEligible ? (
              <>
                <div aria-hidden className="my-1 h-px bg-outline-variant/40" />
                <MenuItem
                  onClick={() => {
                    setActionError(null);
                    setRefundOpen(true);
                  }}
                >
                  <IconRupeeGlyph />
                  Record a refund…
                </MenuItem>
              </>
            ) : null}
          </ActionDropdown>
        ) : null}
        {refundEligible ? (
          <Button
            variant="outline"
            onClick={() => {
              setActionError(null);
              setRefundOpen(true);
            }}
          >
            <IconRupeeGlyph />
            Record refund
          </Button>
        ) : null}
        {unpaid ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface-variant">
            <IconWarning className="h-4 w-4 text-tertiary-container" aria-hidden />
            Payment not verified yet — fulfilment states are blocked by the API until the provider confirms.
          </p>
        ) : null}
      </div>

      {actionError ? (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-error-container bg-error-container/60 px-4 py-3 text-sm font-medium text-on-error-container"
        >
          {actionError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* ------------------------- main column ------------------------- */}
        <div className="space-y-6 xl:col-span-2">
          {fulfilmentVisible ? (
            <LifecycleStepper order={order} />
          ) : (
            <Card>
              <CardBody className="flex items-center gap-3">
                <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-primary">
                  {order.status === "cancelled" ? <IconWarning className="h-5 w-5" /> : <IconRupeeGlyph />}
                </span>
                <div>
                  <p className="font-display text-base font-semibold text-on-surface">
                    {order.status === "cancelled" ? "Order cancelled" : "Order refunded"}
                  </p>
                  <p className="text-sm text-on-surface-variant">
                    {order.status === "cancelled"
                      ? (order.cancelledReason ?? "Cancelled by the store — no fulfilment timeline applies.")
                      : order.refundPaise > 0
                        ? `${formatINR(order.refundPaise)} refunded (${humanize(order.refundStatus)}).`
                        : "Refund recorded."}
                  </p>
                </div>
              </CardBody>
            </Card>
          )}

          {/* items */}
          <Card>
            <CardHeader
              title="Items"
              subtitle="Historical snapshot — the exact name, variant and price at purchase time"
              actions={
                <Badge tone="neutral">
                  {order.items.length} item{order.items.length === 1 ? "" : "s"}
                </Badge>
              }
            />
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH scope="col">Product</TH>
                    <TH scope="col">SKU</TH>
                    <TH scope="col" className="text-center">
                      Qty
                    </TH>
                    <TH scope="col" className="text-right">
                      Unit price
                    </TH>
                    <TH scope="col" className="text-right">
                      Line total
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {order.items.map((item) => (
                    <TR key={`${item.variantId}-${item.sku}`}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <ItemThumb src={item.image} name={item.name} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-on-surface" title={item.name}>
                              {item.name}
                            </p>
                            <p className="truncate text-xs text-on-surface-variant" title={item.variantLabel}>
                              {item.variantLabel}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap font-mono text-xs">{item.sku}</TD>
                      <TD className="text-center font-bold">{item.qty}</TD>
                      <TD className="whitespace-nowrap text-right">{formatINR(item.unitPricePaise)}</TD>
                      <TD className="whitespace-nowrap text-right font-bold text-primary">{formatINR(item.lineTotalPaise)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <CardBody className="border-t border-outline-variant/40">
              <dl className="ml-auto max-w-sm space-y-1.5 text-sm">
                <div className="flex justify-between gap-8">
                  <dt className="text-on-surface-variant">Subtotal</dt>
                  <dd className="font-medium">{formatINR(order.subtotalPaise)}</dd>
                </div>
                {order.discountTotalPaise > 0 ? (
                  <div className="flex justify-between gap-8">
                    <dt className="text-on-surface-variant">Discounts</dt>
                    <dd className="font-medium text-secondary">−{formatINR(order.discountTotalPaise)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-8">
                  <dt className="text-on-surface-variant">Shipping</dt>
                  <dd className="font-medium">{formatINR(order.shippingPaise)}</dd>
                </div>
                {order.taxPaise > 0 ? (
                  <div className="flex justify-between gap-8">
                    <dt className="text-on-surface-variant">{order.taxLabel ?? "Tax"}</dt>
                    <dd className="font-medium">{formatINR(order.taxPaise)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-8 border-t border-outline-variant/40 pt-2">
                  <dt className="font-display text-base font-semibold text-primary">Total</dt>
                  <dd className="font-display text-base font-bold text-primary">{formatINR(order.totalPaise)}</dd>
                </div>
                {order.refundPaise > 0 ? (
                  <div className="flex justify-between gap-8">
                    <dt className="text-on-surface-variant">Refunded ({humanize(order.refundStatus)})</dt>
                    <dd className="font-medium text-error">−{formatINR(order.refundPaise)}</dd>
                  </div>
                ) : null}
              </dl>
            </CardBody>
          </Card>

          {/* payment */}
          <Card>
            <CardHeader
              title="Payment & settlement"
              subtitle="Read-only — payment status changes exclusively through verified provider webhooks"
              actions={<StatusBadge status={order.paymentStatus} />}
            />
            <CardBody className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3 rounded-xl bg-surface-container-low p-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-on-surface-variant">Gateway</span>
                  <span className="font-bold text-on-surface">{humanize(order.paymentProvider)}</span>
                </div>
                {(attempts ?? []).length === 0 ? (
                  <p className="pt-1 text-xs text-on-surface-variant">
                    {order.paymentProvider === "cod"
                      ? "Cash on delivery — no gateway attempt exists. Collect the amount at handoff."
                      : "No payment attempt recorded for this order."}
                  </p>
                ) : (
                  (attempts ?? []).map((attempt) => (
                    <div key={attempt.id} className="space-y-2 border-t border-outline-variant/30 pt-2 first:border-0 first:pt-0">
                      {attempt.providerOrderId ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-on-surface-variant">Provider order ID</span>
                          <span className="flex items-center gap-1 font-mono text-xs font-bold text-primary">
                            {attempt.providerOrderId}
                            <CopyButton value={attempt.providerOrderId} label="provider order ID" />
                          </span>
                        </div>
                      ) : null}
                      {attempt.providerPaymentId ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-on-surface-variant">Payment ID</span>
                          <span className="flex items-center gap-1 font-mono text-xs font-bold text-primary">
                            {attempt.providerPaymentId}
                            <CopyButton value={attempt.providerPaymentId} label="payment ID" />
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-on-surface-variant">Attempt amount</span>
                        <span className="font-medium">{formatINR(attempt.amountPaise)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-on-surface-variant">Attempt status</span>
                        <StatusBadge status={attempt.status} />
                      </div>
                      {attempt.lastError ? (
                        <p className="rounded bg-error-container/60 px-2 py-1 text-xs text-on-error-container">
                          {attempt.lastError}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-6">
                  <span className="text-on-surface-variant">Order total</span>
                  <span className="font-bold text-primary">{formatINR(order.totalPaise)}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-on-surface-variant">Refunded so far</span>
                  <span className={order.refundPaise > 0 ? "font-medium text-error" : "font-medium"}>
                    {formatINR(order.refundPaise)}
                  </span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-on-surface-variant">Refund status</span>
                  <span className="font-medium">{humanize(order.refundStatus)}</span>
                </div>
                <p className="mt-3 rounded-lg bg-surface-container-low p-3 text-xs leading-relaxed text-on-surface-variant">
                  {unpaid
                    ? "This order is not paid yet. Staff actions cannot mark it paid — confirmation arrives from the payment provider (webhook) for gateway orders, or cash collection for COD."
                    : "Totals come from the stored order document — the authoritative record at purchase time."}
                </p>
              </div>
            </CardBody>
          </Card>

          {/* shipping & manual tracking */}
          <Card>
            <CardHeader
              title="Shipping & carrier booking"
              subtitle="Manual Shiprocket workflow — book the shipment in Shiprocket, record the AWB here"
              actions={
                <>
                  <Badge tone="neutral">Manual entry</Badge>
                  {canEditTracking ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditCarrier(order.tracking?.carrier ?? "");
                        setEditAwb(order.tracking?.trackingNumber ?? "");
                        setActionError(null);
                        setTrackingEditOpen(true);
                      }}
                    >
                      {order.tracking ? "Edit consignment" : "Add tracking"}
                    </Button>
                  ) : null}
                </>
              }
            />
            <CardBody className="space-y-4">
              {order.tracking ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low p-3">
                    <p className="label-eyebrow text-on-surface-variant">Assigned carrier</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-secondary text-[11px] font-bold text-on-secondary">
                        {initialsOf(order.tracking.carrier) || "SR"}
                      </span>
                      <p className="truncate text-sm font-bold text-on-surface" title={order.tracking.carrier}>
                        {order.tracking.carrier}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low p-3">
                    <p className="label-eyebrow text-on-surface-variant">AWB / tracking number</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <p className="truncate font-mono text-sm font-bold text-primary" title={order.tracking.trackingNumber}>
                        {order.tracking.trackingNumber}
                      </p>
                      <CopyButton value={order.tracking.trackingNumber} label="AWB number" />
                    </div>
                    <p className="mt-1 text-[11px] text-on-surface-variant">
                      Recorded {formatDateTime(order.tracking.updatedAt)} IST
                    </p>
                  </div>
                  <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low p-3">
                    <p className="label-eyebrow text-on-surface-variant">Customer tracking</p>
                    {trackingUrl ? (
                      <a
                        href={trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
                      >
                        Open Shiprocket tracking
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                          <path d="M14 4h6v6M20 4 10 14M18 13v6H5V6h6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                    ) : (
                      <p className="mt-1.5 font-mono text-xs text-on-surface-variant">{order.tracking.trackingNumber}</p>
                    )}
                    <p className="mt-1 text-[11px] text-on-surface-variant">
                      {trackingUrl
                        ? "The storefront Track Order button opens the same page."
                        : "No tracking link — the AWB shape is not a trusted Shiprocket format."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-outline-variant/50 bg-surface-container-low/50 p-4 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-on-surface">
                    <IconTruck className="h-5 w-5 text-secondary" aria-hidden />
                    Tracking not added yet
                  </p>
                  <p className="mt-1 text-on-surface-variant">
                    {order.status === "shipped" || order.status === "delivered"
                      ? canWrite
                        ? "This order shipped without a consignment record — add the carrier and AWB now."
                        : "This order shipped without a consignment record."
                      : "Book the shipment in Shiprocket, then record the carrier + AWB when marking the order shipped."}
                  </p>
                </div>
              )}

              {trackingEditOpen && canWrite ? (
                <form
                  className="space-y-3 rounded-xl border border-outline-variant/40 bg-surface-container p-4"
                  onSubmit={submitTracking}
                >
                  <p className="text-sm font-bold text-on-surface">Update consignment information</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Carrier / logistics partner" required htmlFor="tracking-carrier">
                      <Input
                        id="tracking-carrier"
                        value={editCarrier}
                        onChange={(e) => setEditCarrier(e.target.value)}
                        placeholder="BlueDart / Delhivery / India Post…"
                        required
                        maxLength={80}
                      />
                    </Field>
                    <Field
                      label="AWB / tracking number"
                      required
                      htmlFor="tracking-awb"
                      hint="The AWB Shiprocket issued for this shipment"
                    >
                      <Input
                        id="tracking-awb"
                        value={editAwb}
                        onChange={(e) => setEditAwb(e.target.value)}
                        placeholder="e.g. 700054910"
                        required
                        minLength={3}
                        maxLength={80}
                        className="font-mono"
                      />
                    </Field>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setTrackingEditOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" loading={busy}>
                      Save tracking details
                    </Button>
                  </div>
                </form>
              ) : null}

              {canWrite && (order.status === "confirmed" || order.status === "processing") && !order.tracking ? (
                <p className="text-xs text-on-surface-variant">
                  Tracking is recorded with the shipped transition — choose “Mark Shipped” above once the consignment is
                  booked. Corrections stay possible afterwards.
                </p>
              ) : null}
            </CardBody>
          </Card>

          {/* timeline */}
          <Card>
            <CardHeader
              title="Order timeline"
              subtitle="Events actually recorded in the audit log — nothing is back-filled or projected"
              actions={<Badge tone="neutral">{(timeline ?? []).length} event{(timeline ?? []).length === 1 ? "" : "s"}</Badge>}
            />
            <CardBody>
              {timeline && timeline.length > 0 ? (
                <ol className="relative space-y-5 pl-6 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-0.5 before:bg-outline-variant/40">
                  {timeline.map((event) => {
                    const meta = timelineMeta(event.action);
                    return (
                      <li key={event.id} className="relative">
                        <span
                          aria-hidden
                          className={`absolute -left-[22px] top-1 h-4 w-4 rounded-full ring-4 ${meta.dotClass}`}
                        />
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                          <p className="text-sm font-bold text-on-surface">{meta.label}</p>
                          <p className="font-mono text-[11px] text-on-surface-variant">{formatDateTime(event.createdAt)} IST</p>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">{event.summary}</p>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant/80">
                          {event.actorRole === "system" ? "System · provider webhook" : `${event.actorName} · ${humanize(event.actorRole)}`}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState
                  title="No events recorded yet"
                  description="Status changes, payments, refunds and tracking updates appear here as they happen."
                  icon={<IconClock className="h-5 w-5" />}
                />
              )}
            </CardBody>
          </Card>

          {/* internal notes */}
          <Card>
            <CardHeader
              title="Internal operations notes"
              subtitle="Confidential to staff — never shown to the customer or exposed by public endpoints"
              actions={<Badge tone="red">Staff only</Badge>}
            />
            <CardBody className="space-y-4">
              {notes && notes.length > 0 ? (
                <ul className="space-y-3">
                  {notes.map((note) => (
                    <li key={note.id} className="space-y-1 rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-3.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-2 font-bold text-on-surface">
                          <span
                            aria-hidden
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-on-primary"
                          >
                            {initialsOf(note.authorName) || "?"}
                          </span>
                          {note.authorName}
                          <span className="font-normal text-on-surface-variant">· {humanize(note.authorRole)}</span>
                        </span>
                        <span className="text-on-surface-variant" title={formatDateTime(note.createdAt)}>
                          {relativeDayTime(note.createdAt)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">{note.note}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-on-surface-variant">
                  No internal notes yet — packing instructions, concierge follow-ups or support context live here.
                </p>
              )}
              {canWrite ? (
                <form className="space-y-2" onSubmit={submitNote}>
                  <Field label="Add an internal note" htmlFor="new-internal-note">
                    <Textarea
                      id="new-internal-note"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Write an internal packing note or follow-up record (internal only)…"
                      rows={2}
                      maxLength={2000}
                    />
                  </Field>
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" loading={busy} disabled={noteText.trim().length < 2}>
                      Add internal note
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-on-surface-variant">Adding notes requires the orders:write permission.</p>
              )}
            </CardBody>
          </Card>
        </div>

        {/* ------------------------- context column ------------------------- */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Customer"
              subtitle={order.isGiftOrder ? "Purchaser — placed and paid for the order" : undefined}
            />
            <CardBody className="space-y-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container font-display text-base font-bold text-on-primary-container"
                >
                  {initialsOf(order.customerContact.displayName) || "?"}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-semibold text-on-surface">
                    {order.customerContact.displayName}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {order.customerUid ? "Registered customer" : "Guest checkout"}
                  </p>
                </div>
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-on-surface-variant">Email</dt>
                  <dd className="truncate text-right" title={order.customerContact.email}>
                    {order.customerContact.email || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-on-surface-variant">Phone</dt>
                  <dd className="text-right">{order.customerContact.phone || "—"}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {order.isGiftOrder ? (
            <Card>
              <CardHeader
                title="Gift & Delivery Details"
                subtitle="Ship the parcel to the recipient below — not to the purchaser"
              />
              <CardBody className="space-y-4 text-sm">
                <div className="rounded-lg bg-primary-fixed/40 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-on-primary-fixed-variant">
                    Delivering to (recipient)
                  </p>
                  <p className="mt-1 font-display text-base font-semibold text-on-surface">
                    {order.gift?.recipientName ?? order.shippingAddress.fullName}
                  </p>
                  <p className="text-on-surface-variant">{order.gift?.recipientPhone ?? order.shippingAddress.phone}</p>
                </div>
                {order.gift?.message ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Gift message</p>
                    <blockquote className="mt-1 rounded-lg bg-surface-container p-3 italic text-on-surface">
                      &ldquo;{order.gift.message}&rdquo;
                    </blockquote>
                  </div>
                ) : null}
                <p className="text-xs text-on-surface-variant">
                  The full shipping destination is in the Shipping address card — it is the recipient&apos;s
                  address snapshot recorded at purchase time. Use it (and its phone) for the Shiprocket
                  booking.
                </p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Shipping address"
              subtitle={
                order.isGiftOrder
                  ? "Recipient's address — the order-time snapshot the parcel ships to"
                  : "Order-time snapshot — never replaced by newer defaults"
              }
            />
            <CardBody className="space-y-0.5 text-sm text-on-surface-variant">
              <p className="flex items-center gap-2">
                <span className="font-semibold text-on-surface">{order.shippingAddress.fullName}</span>
                <Badge tone="neutral">{order.shippingAddress.label}</Badge>
              </p>
              <p>{order.shippingAddress.line1}</p>
              {order.shippingAddress.line2 ? <p>{order.shippingAddress.line2}</p> : null}
              {order.shippingAddress.landmark ? <p>Landmark: {order.shippingAddress.landmark}</p> : null}
              <p>
                {order.shippingAddress.city}, {order.shippingAddress.state} — {order.shippingAddress.pincode}
              </p>
              <p className="pt-1">
                Phone: <span className="font-medium">{order.shippingAddress.phone}</span>
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Order record" />
            <CardBody className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-on-surface-variant">Order ID</span>
                <span className="flex items-center gap-1 font-mono text-xs">
                  {order.id}
                  <CopyButton value={order.id} label="order ID" />
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-on-surface-variant">Created</span>
                <span className="text-right">{formatDateTime(order.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-on-surface-variant">Last updated</span>
                <span className="text-right">{formatDateTime(order.updatedAt)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-on-surface-variant">Payment mode</span>
                <span>{humanize(order.paymentProvider)}</span>
              </div>
              {order.isDemo ? (
                <p className="rounded bg-surface-container-high px-2 py-1.5 text-xs text-on-surface-variant">
                  Demo record — seeded for rehearsals, excluded from live reporting by default.
                </p>
              ) : null}
            </CardBody>
          </Card>

          {canRefund ? (
            <Card>
              <CardHeader title="Refund" />
              <CardBody className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-on-surface-variant">Refundable balance</span>
                  <span className="font-bold text-primary">{formatINR(refundablePaise)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-on-surface-variant">Status</span>
                  <span>{humanize(order.refundStatus)}</span>
                </div>
                {refundEligible ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => {
                      setActionError(null);
                      setRefundOpen(true);
                    }}
                  >
                    Record refund…
                  </Button>
                ) : (
                  <p className="pt-1 text-xs text-on-surface-variant">
                    {order.paymentStatus !== "succeeded"
                      ? "Only paid orders can be refunded."
                      : refundablePaise === 0
                        ? "Fully refunded."
                        : "Refunds require the orders:refund permission."}
                  </p>
                )}
              </CardBody>
            </Card>
          ) : null}

          {order.cancelledReason ? (
            <Card>
              <CardHeader title="Cancellation" />
              <CardBody className="text-sm text-on-surface-variant">{order.cancelledReason}</CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      {/* ------------------------------ dialogs ------------------------------ */}
      <Dialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target ? `Mark ${order.orderNumber} as ${humanize(target)}` : "Update status"}
        description="Validated by the server's state machine — illegal transitions are rejected."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="status-transition-form" loading={busy}>
              Confirm
            </Button>
          </>
        }
      >
        <form id="status-transition-form" className="space-y-3" onSubmit={changeStatus}>
          {target === "shipped" ? (
            <>
              <p className="rounded-lg bg-surface-container-low p-3 text-xs leading-relaxed text-on-surface-variant">
                Book the consignment in Shiprocket first, then record the details it issued. The customer&apos;s Track
                Order button uses this AWB.
              </p>
              <Field label="Carrier / logistics partner" required htmlFor="ship-carrier">
                <Input
                  id="ship-carrier"
                  value={shipCarrier}
                  onChange={(e) => setShipCarrier(e.target.value)}
                  placeholder="BlueDart / Delhivery / India Post…"
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="AWB / tracking number" required htmlFor="ship-awb" hint="Issued by Shiprocket when the shipment is booked">
                <Input
                  id="ship-awb"
                  value={shipAwb}
                  onChange={(e) => setShipAwb(e.target.value)}
                  placeholder="e.g. 700054910"
                  required
                  minLength={3}
                  maxLength={80}
                  className="font-mono"
                />
              </Field>
            </>
          ) : null}
          {target === "cancelled" ? (
            <Field label="Reason" hint="Recorded as the cancellation reason" htmlFor="cancel-reason">
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                maxLength={300}
                rows={2}
              />
            </Field>
          ) : null}
          {target === "processing" ? (
            <p className="text-sm text-on-surface-variant">
              The order moves into packing. Stock reservations stay held; recording the AWB happens at the shipped step.
            </p>
          ) : null}
          {unpaid && target !== "cancelled" ? (
            <p className="rounded-lg bg-error-container/60 p-3 text-xs text-on-error-container">
              Payment is not verified yet — the server will reject fulfilment transitions until the provider confirms.
            </p>
          ) : null}
        </form>
      </Dialog>

      <Dialog
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title={`Refund ${order.orderNumber}`}
        description={`Refundable balance ${formatINR(refundablePaise)} — settled through the payment provider where supported.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRefundOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="refund-form" variant="danger" loading={busy}>
              Record refund
            </Button>
          </>
        }
      >
        <form id="refund-form" className="space-y-3" onSubmit={submitRefund}>
          <Field label="Amount (₹)" required htmlFor="refund-amount" hint={`Maximum ${formatINR(refundablePaise)} — entered in rupees`}>
            <Input
              id="refund-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder={(refundablePaise / 100).toFixed(2)}
              required
            />
          </Field>
          <Field label="Reason" required htmlFor="refund-reason">
            <Textarea
              id="refund-reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              rows={2}
              maxLength={300}
              required
            />
          </Field>
        </form>
      </Dialog>
    </div>
  );
}

function IconRupeeGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M7 3h10M7 8h10M16 3c0 4-3.5 5-7 5 4 0 7 4.5 9 8M7 8l8 13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

