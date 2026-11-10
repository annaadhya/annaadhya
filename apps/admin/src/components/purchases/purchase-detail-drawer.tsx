"use client";
/**
 * Purchase detail slide-over for the Purchases console (heritage design language).
 * Everything shown comes from the freshly fetched purchase document — receipts and
 * payments are persisted history, never reconstructed from current state.
 *
 * Tabs:
 *  - Overview: procurement metadata + supplier snapshot + authoritative cost breakdown
 *  - Items & Receiving: per-line progress + the persisted receiving history (auditable)
 *  - Payments: settlement summary + recorded payments (+ record form for writers)
 * Footer actions are state-driven and mirror the server's transition rules:
 *  drafts are editable/confirmable/cancellable; ordered & partially received purchases
 *  can be received, paid and cancelled; received purchases are closed.
 */
import { useEffect, useState } from "react";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { formatDate, formatDateTime, formatINR, humanize } from "@/lib/format";
import { relativeDayTime } from "@/lib/relative-time";
import type { PurchaseDoc, PurchasePaymentMethod } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { IconCancelled, IconCheckAll, IconClose, IconDraft, IconEdit, IconPayments, IconReceive, IconTimelapse, IconTruck } from "./icons";

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partially Received",
  received: "Received",
  cancelled: "Cancelled",
};

export const PURCHASE_PAYMENT_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partially Paid",
  paid: "Paid",
};

type Tab = "overview" | "receiving" | "payments";

const PAYMENT_METHOD_OPTIONS: { value: PurchasePaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export interface PurchaseDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  row: {
    id: string;
    reference: string;
    supplierName: string;
    supplierLocation?: string;
    status: PurchaseDoc["status"];
    paymentStatus: PurchaseDoc["paymentStatus"];
    supplierId: string;
  } | null;
  canWrite: boolean;
  /** Refresh the ledger after any mutation. */
  onChanged: () => void;
  onEditDraft: (id: string) => void;
  onReceive: (id: string) => void;
}

export function PurchaseDetailDrawer({ open, onClose, row, canWrite, onChanged, onEditDraft, onReceive }: PurchaseDetailDrawerProps) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [doc, setDoc] = useState<PurchaseDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Payment form state
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PurchasePaymentMethod>("bank_transfer");
  const [payReference, setPayReference] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payError, setPayError] = useState<string | null>(null);

  async function load() {
    if (!row) return;
    setLoading(true);
    setError(null);
    try {
      const fresh = await apiGet<PurchaseDoc>(`/admin/purchases/${row.id}`);
      setDoc(fresh);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) {
      setTab("overview");
      setDoc(null);
      setError(null);
      setConfirmingCancel(false);
      setCancelReason("");
      setPayAmount("");
      setPayMethod("bank_transfer");
      setPayReference("");
      setPayNote("");
      setPayError(null);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  // Escape closes; body scroll locked while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy && !confirmingCancel) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, busy, confirmingCancel, onClose]);

  if (!open || !row) return null;

  const status = doc?.status ?? row.status;
  const total = doc?.totalPaise ?? 0;
  const paid = doc?.paidPaise ?? 0;
  const outstanding = Math.max(0, total - paid);

  function refreshAfterChange(message: string, title: string) {
    toast.success(title, message);
    onChanged();
    void load();
  }

  async function confirmOrder() {
    if (!doc) return;
    setBusy("confirm");
    try {
      await apiPost(`/admin/purchases/${doc.id}/confirm`, {});
      refreshAfterChange(`${doc.reference} is now ordered — awaiting delivery.`, "Purchase confirmed");
    } catch (err) {
      toast.error("Could not confirm", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(null);
    }
  }

  async function cancelPurchase() {
    if (!doc) return;
    setBusy("cancel");
    try {
      await apiPost(`/admin/purchases/${doc.id}/cancel`, { reason: cancelReason.trim() || undefined });
      setConfirmingCancel(false);
      setCancelReason("");
      refreshAfterChange("History, receipts and any received stock are preserved.", "Purchase cancelled");
    } catch (err) {
      toast.error("Could not cancel", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(null);
    }
  }

  async function recordPayment() {
    if (!doc) return;
    setPayError(null);
    const rupees = Number(payAmount.replace(/,/g, ""));
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setPayError("Enter a positive amount in rupees.");
      return;
    }
    const amountPaise = Math.round(rupees * 100);
    if (amountPaise > Math.max(0, (doc.totalPaise ?? 0) - (doc.paidPaise ?? 0))) {
      setPayError("The payment exceeds the outstanding balance for this purchase.");
      return;
    }
    setBusy("payment");
    try {
      const updated = await apiPost<PurchaseDoc>(`/admin/purchases/${doc.id}/payments`, {
        amountPaise,
        method: payMethod,
        reference: payReference.trim() || undefined,
        note: payNote.trim() || undefined,
      });
      setPayAmount("");
      setPayReference("");
      setPayNote("");
      setDoc(updated);
      toast.success("Payment recorded", `${formatINR(amountPaise)} — ${PURCHASE_PAYMENT_LABELS[updated.paymentStatus ?? "unpaid"]}`);
      onChanged();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(null);
    }
  }

  const items = doc?.items ?? [];
  const receipts = doc?.receipts ?? [];
  const payments = doc?.payments ?? [];
  const orderedUnits = items.reduce((s, i) => s + i.qtyOrdered, 0);
  const receivedUnits = items.reduce((s, i) => s + i.qtyReceived, 0);
  const unit = items[0]?.unit ?? "unit";

  const statusChip = (s: PurchaseDoc["status"]) => {
    const map: Record<string, string> = {
      draft: "bg-surface-container-high text-on-surface-variant",
      ordered: "bg-surface-container text-primary",
      partially_received: "bg-tertiary-fixed text-on-tertiary-fixed",
      received: "bg-secondary-container text-on-secondary-container",
      cancelled: "bg-error-container/60 text-on-error-container",
    };
    return (
      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${map[s] ?? "bg-surface-container-high"}`}>
        {s === "draft" ? <IconDraft className="h-3.5 w-3.5" /> : null}
        {s === "ordered" ? <IconTruck className="h-3.5 w-3.5" /> : null}
        {s === "partially_received" ? <IconTimelapse className="h-3.5 w-3.5" /> : null}
        {s === "received" ? <IconCheckAll className="h-3.5 w-3.5" /> : null}
        {s === "cancelled" ? <IconCancelled className="h-3.5 w-3.5" /> : null}
        {PURCHASE_STATUS_LABELS[s] ?? humanize(s)}
      </span>
    );
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "receiving", label: "Items & Receiving" },
    { key: "payments", label: "Payments" },
  ];

  return (
    <>
      <div aria-hidden onClick={() => !busy && !confirmingCancel && onClose()} className="backdrop-in fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-xs" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Purchase details — ${row.reference}`}
        className="drawer-in fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-surface-container-lowest shadow-2xl"
      >
        {/* Header */}
        <div className="border-b border-outline-variant/40 bg-surface-container-low px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {statusChip(status)}
              <span
                className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                  (doc?.paymentStatus ?? row.paymentStatus) === "paid"
                    ? "bg-secondary-container/70 text-secondary"
                    : (doc?.paymentStatus ?? row.paymentStatus) === "partially_paid"
                      ? "bg-tertiary-fixed/60 text-on-tertiary-fixed-variant"
                      : "bg-surface-container text-outline"
                }`}
              >
                {PURCHASE_PAYMENT_LABELS[doc?.paymentStatus ?? row.paymentStatus ?? "unpaid"] ?? "Unpaid"}
              </span>
              <span className="font-mono text-[11px] text-outline">ID #{row.id.slice(0, 12).toUpperCase()}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="rounded-full p-2 text-on-surface-variant/60 transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <h2 className="mt-1 font-display text-xl font-semibold leading-snug text-primary">{row.reference}</h2>
          <p className="mt-0.5 text-[13px] text-on-surface-variant">
            {row.supplierName}
            {row.supplierLocation ? ` • ${row.supplierLocation}` : ""}
          </p>

          {/* Action bar */}
          {canWrite && doc ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {status === "draft" ? (
                <>
                  <Button size="sm" onClick={() => onEditDraft(doc.id)}>
                    <IconEdit className="h-4 w-4" />
                    Edit draft
                  </Button>
                  <Button size="sm" variant="secondary" loading={busy === "confirm"} onClick={confirmOrder}>
                    <IconTruck className="h-4 w-4" />
                    Confirm order
                  </Button>
                </>
              ) : null}
              {(status === "ordered" || status === "partially_received") && receivedUnits < orderedUnits ? (
                <Button size="sm" onClick={() => onReceive(doc.id)}>
                  <IconReceive className="h-4 w-4" />
                  Receive goods
                </Button>
              ) : null}
              {outstanding > 0 && status !== "draft" && status !== "cancelled" ? (
                <Button size="sm" variant="outline" onClick={() => setTab("payments")}>
                  <IconPayments className="h-4 w-4" />
                  Record payment
                </Button>
              ) : null}
              {status !== "received" && status !== "cancelled" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-error hover:bg-error-container/40"
                  onClick={() => setConfirmingCancel(true)}
                  disabled={busy !== null}
                >
                  <IconCancelled className="h-4 w-4" />
                  Cancel purchase
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Tabs */}
          <div className="mt-4 flex items-center gap-4 border-b border-outline-variant/30" role="tablist" aria-label="Purchase detail sections">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`-mb-px border-b-2 pb-2 label-tracked uppercase transition-colors ${
                  tab === t.key ? "border-primary font-bold text-primary" : "border-transparent text-outline hover:text-on-surface"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <p className="py-8 text-center text-sm text-on-surface-variant">Loading purchase…</p>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : !doc ? null : tab === "overview" ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-surface-container-low p-4">
                  <p className="label-eyebrow text-outline">Procurement</p>
                  <dl className="mt-2 space-y-1.5 text-[13px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-on-surface-variant">Purchase date</dt>
                      <dd className="font-medium text-on-surface">{formatDate(doc.purchaseDate ?? doc.createdAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-on-surface-variant">Expected delivery</dt>
                      <dd className="font-medium text-on-surface">{doc.expectedDeliveryDate ? formatDate(doc.expectedDeliveryDate) : "Not set"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-on-surface-variant">Supplier invoice</dt>
                      <dd className="font-mono font-medium text-on-surface">{doc.supplierInvoiceNumber ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-on-surface-variant">Raised by</dt>
                      <dd className="font-medium text-on-surface">{doc.createdByName ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-on-surface-variant">Last updated</dt>
                      <dd className="font-medium text-on-surface">{relativeDayTime(doc.updatedAt)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-xl bg-surface-container-low p-4">
                  <p className="label-eyebrow text-outline">Supplier</p>
                  <p className="mt-2 text-sm font-semibold text-on-surface">{row.supplierName}</p>
                  <p className="text-xs text-on-surface-variant">{row.supplierLocation ?? "Location not recorded"}</p>
                  {doc.cancelReason ? (
                    <p className="mt-2 rounded-lg bg-error-container/50 px-2.5 py-1.5 text-xs font-medium text-on-error-container">
                      Cancelled — {doc.cancelReason}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-outline">Supplier records live in the Suppliers console; pausing a supplier never touches this history.</p>
                </div>
              </div>

              {/* Cost breakdown */}
              <div className="rounded-xl border border-outline-variant/30 p-4">
                <p className="label-eyebrow text-outline">Cost breakdown (server-authoritative)</p>
                <dl className="mt-2 space-y-1.5 text-[13px]">
                  <div className="flex justify-between">
                    <dt className="text-on-surface-variant">Subtotal</dt>
                    <dd className="font-mono font-medium">{formatINR(doc.subTotalPaise ?? 0)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-on-surface-variant">Discounts</dt>
                    <dd className="font-mono font-medium text-secondary">− {formatINR(doc.discountTotalPaise ?? 0)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-on-surface-variant">Taxes</dt>
                    <dd className="font-mono font-medium">+ {formatINR(doc.taxTotalPaise ?? 0)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-outline-variant/40 pt-2">
                    <dt className="font-semibold text-primary">Purchase total</dt>
                    <dd className="font-mono text-base font-bold text-primary">{formatINR(doc.totalPaise ?? 0)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-on-surface-variant">Paid so far</dt>
                    <dd className="font-mono font-medium text-secondary">{formatINR(paid)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="font-semibold text-on-surface">Outstanding</dt>
                    <dd className="font-mono font-bold text-on-surface">{formatINR(outstanding)}</dd>
                  </div>
                </dl>
              </div>

              {doc.internalNotes?.trim() ? (
                <div className="rounded-xl bg-surface-container-high/60 p-4">
                  <p className="label-eyebrow text-primary">Internal notes</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-on-surface-variant">{doc.internalNotes}</p>
                </div>
              ) : null}
            </>
          ) : tab === "receiving" ? (
            <>
              {/* Line progress */}
              <div className="space-y-2">
                <p className="text-[13px] text-on-surface-variant">
                  {receivedUnits.toLocaleString("en-IN")} of {orderedUnits.toLocaleString("en-IN")} {unit} inwarded — inventory was credited by exactly these
                  quantities, one receipt at a time.
                </p>
                {items.map((item) => {
                  const outstanding = Math.max(0, item.qtyOrdered - item.qtyReceived);
                  const pct = item.qtyOrdered > 0 ? Math.min(100, Math.round((item.qtyReceived / item.qtyOrdered) * 100)) : 0;
                  return (
                    <div key={item.variantSku} className="rounded-xl bg-surface-container-low p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-on-surface" title={item.description || item.productName || item.variantSku}>
                            {item.description || item.productName || item.variantSku}
                          </p>
                          <p className="font-mono text-[11px] text-on-surface-variant">
                            {item.variantSku} • {formatINR(item.unitCostPaise)} / {item.unit ?? unit}
                            {item.taxPercent ? ` • ${item.taxPercent}% tax` : ""}
                            {item.discountPaise ? ` • ${formatINR(item.discountPaise)} off` : ""}
                          </p>
                        </div>
                        <span className={`font-mono text-xs font-bold ${pct === 100 ? "text-secondary" : "text-tertiary"}`}>
                          {item.qtyReceived.toLocaleString("en-IN")} / {item.qtyOrdered.toLocaleString("en-IN")} {item.unit ?? unit} · {pct}%
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container-high">
                        <div className={`h-full rounded-full ${pct === 100 ? "bg-secondary" : "bg-tertiary-fixed-dim"}`} style={{ width: `${pct}%` }} />
                      </div>
                      {outstanding > 0 ? (
                        <p className="mt-1 text-[11px] text-on-surface-variant">{outstanding.toLocaleString("en-IN")} {item.unit ?? unit} outstanding</p>
                      ) : (
                        <p className="mt-1 text-[11px] font-semibold text-secondary">Fully inwarded</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Receiving history */}
              <div>
                <p className="label-eyebrow text-secondary">Receiving history</p>
                {receipts.length === 0 ? (
                  <EmptyState
                    title="No goods received yet"
                    description="Once a delivery is confirmed, every receipt is recorded here with its quantities, actor and inventory movement references."
                    icon={<IconReceive className="h-5 w-5" />}
                  />
                ) : (
                  <ol className="mt-2 space-y-2">
                    {[...receipts].reverse().map((r) => (
                      <li key={r.id} className="rounded-xl border border-outline-variant/30 p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-on-surface">
                            {r.lines.map((l) => `${l.qty.toLocaleString("en-IN")} ${l.unit ?? unit} × ${l.variantSku}`).join(" · ")}
                          </p>
                          <span className="font-mono text-[11px] text-outline">{formatDateTime(r.receivedAt)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-on-surface-variant">
                          By {r.receivedByName ?? r.receivedByUid} • {r.movementIds.length} inventory movement{r.movementIds.length === 1 ? "" : "s"} linked
                        </p>
                        {r.note ? <p className="mt-1 rounded bg-surface-container px-2 py-1 text-xs text-on-surface-variant">{r.note}</p> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Settlement summary */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-surface-container-low px-3 py-3">
                  <span className="label-eyebrow block text-outline">Total</span>
                  <span className="font-mono text-sm font-bold text-on-surface">{formatINR(total)}</span>
                </div>
                <div className="rounded-xl bg-surface-container-low px-3 py-3">
                  <span className="label-eyebrow block text-secondary">Paid</span>
                  <span className="font-mono text-sm font-bold text-secondary">{formatINR(paid)}</span>
                </div>
                <div className="rounded-xl bg-surface-container-high px-3 py-3">
                  <span className="label-eyebrow block text-primary">Outstanding</span>
                  <span className="font-mono text-sm font-bold text-primary">{formatINR(outstanding)}</span>
                </div>
              </div>
              <p className="text-[11px] text-outline">
                Settlement comes only from payments recorded below — receiving goods never marks a purchase paid.
              </p>

              {/* Record payment (writers, when outstanding) */}
              {canWrite && outstanding > 0 && status !== "cancelled" ? (
                <div className="space-y-3 rounded-xl border border-outline-variant/30 p-4">
                  <p className="label-eyebrow text-secondary">Record a supplier payment</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Amount ₹" required>
                      <Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" className="font-mono" placeholder={`up to ${(outstanding / 100).toFixed(2)}`} />
                    </Field>
                    <Field label="Method" required>
                      <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PurchasePaymentMethod)}>
                        {PAYMENT_METHOD_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Reference" hint="UTR / cheque number / transaction proof">
                    <Input value={payReference} onChange={(e) => setPayReference(e.target.value)} maxLength={120} className="font-mono" />
                  </Field>
                  <Field label="Note">
                    <Textarea value={payNote} onChange={(e) => setPayNote(e.target.value)} rows={2} maxLength={300} />
                  </Field>
                  {payError ? (
                    <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-sm font-medium text-on-error-container">
                      {payError}
                    </p>
                  ) : null}
                  <div className="flex justify-end">
                    <Button size="sm" loading={busy === "payment"} onClick={recordPayment}>
                      <IconPayments className="h-4 w-4" />
                      Record payment
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Payment history */}
              {payments.length === 0 ? (
                <EmptyState title="No payments recorded" description="When supplier payments are settled, each entry lands here with its amount, method and reference." icon={<IconPayments className="h-5 w-5" />} />
              ) : (
                <ol className="space-y-2">
                  {[...payments].reverse().map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low p-3.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-on-surface">
                          {formatINR(p.amountPaise)} <span className="text-xs font-normal text-on-surface-variant">• {PAYMENT_METHOD_OPTIONS.find((m) => m.value === p.method)?.label ?? humanize(p.method)}</span>
                        </p>
                        <p className="truncate text-xs text-on-surface-variant">
                          {formatDateTime(p.paidAt)}
                          {p.reference ? ` • ${p.reference}` : ""}
                          {p.recordedByName ? ` • by ${p.recordedByName}` : ""}
                        </p>
                        {p.note ? <p className="mt-0.5 truncate text-xs text-outline">{p.note}</p> : null}
                      </div>
                      <span className="shrink-0 rounded-full bg-secondary-container/70 px-2.5 py-1 font-mono text-[11px] font-bold text-secondary">{p.id}</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-outline-variant/40 bg-surface-container-low px-5 py-3.5 sm:px-6">
          <span className="text-[11px] text-outline">{doc ? `Created ${formatDate(doc.createdAt)}` : ""}</span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close panel
          </Button>
        </div>
      </aside>

      {/* Cancel confirmation */}
      {confirmingCancel ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-inverse-surface/50 p-4 backdrop-blur-xs">
          <div role="alertdialog" aria-modal="true" aria-label="Cancel purchase" className="w-full max-w-md rounded-xl bg-surface-container-lowest p-5 shadow-2xl">
            <h3 className="font-display text-lg font-semibold text-primary">Cancel {row.reference}?</h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              The outstanding balance is voided and no further goods can be received. Receiving history, recorded payments and any stock already inwarded stay
              exactly as they are.
            </p>
            <Field label="Reason (optional)" className="mt-3">
              <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} maxLength={300} placeholder="e.g. Crop failed due to drought" />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(false)} disabled={busy === "cancel"}>
                Keep purchase
              </Button>
              <Button size="sm" className="bg-error text-on-error hover:bg-error/90" loading={busy === "cancel"} onClick={cancelPurchase}>
                Cancel purchase
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
