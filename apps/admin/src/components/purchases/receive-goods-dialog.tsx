"use client";
/**
 * Receive Goods modal — the critical inwarding workflow (heritage design).
 *
 * - Per line: ordered / already inwarded / this delivery (stepper input) / outstanding chip.
 * - Prefilled with the outstanding quantity; lines with nothing outstanding are disabled.
 * - A note captures consignment condition & storage details on the persisted receipt.
 * - IDEMPOTENCY: one receiptId is generated per dialog session and sent with every attempt
 *   of this session — a retry, double-click or replayed request can never apply stock twice.
 *   The server persists the receipt + stock update + movement records in ONE transaction.
 * - Only quantities confirmed here are credited to inventory — the modal says so explicitly.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiPost } from "@/lib/api";
import type { PurchaseDoc, PurchaseReceivePayload } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { IconClose, IconReceive } from "./icons";

function newReceiptId(): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `rcv-${rnd.replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}`;
}

export interface ReceiveGoodsDialogProps {
  open: boolean;
  onClose: () => void;
  /** The purchase being received (with the latest persisted received counters). */
  purchase: PurchaseDoc | null;
  supplierName?: string;
  onReceived: () => void;
}

export function ReceiveGoodsDialog({ open, onClose, purchase, supplierName, onReceived }: ReceiveGoodsDialogProps) {
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per dialog session — stable across retries, fresh for the next receipt.
  const [receiptId, setReceiptId] = useState(newReceiptId);

  // Prefill outstanding quantities once per opened purchase.
  useEffect(() => {
    if (!open || !purchase) return;
    const initial: Record<string, string> = {};
    for (const item of purchase.items) {
      initial[item.variantSku] = String(Math.max(0, item.qtyOrdered - item.qtyReceived));
    }
    setQtys(initial);
    setNote("");
    setError(null);
    setSaving(false);
    setReceiptId(newReceiptId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchase?.id]);

  // Escape closes (not while submitting); body scroll locked while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, saving, onClose]);

  const lines = useMemo(() => purchase?.items ?? [], [purchase]);

  const plannedTotal = useMemo(
    () =>
      lines.reduce((sum, item) => {
        const qty = Number(qtys[item.variantSku] ?? "0");
        return sum + (Number.isInteger(qty) && qty > 0 ? Math.min(qty, item.qtyOrdered - item.qtyReceived) : 0);
      }, 0),
    [lines, qtys],
  );

  function adjust(sku: string, delta: number, max: number) {
    setQtys((q) => {
      const current = Number(q[sku] ?? "0") || 0;
      const next = Math.max(0, Math.min(max, current + delta));
      return { ...q, [sku]: String(next) };
    });
  }

  async function submit() {
    if (!purchase) return;
    setError(null);
    const receipts = purchase.items
      .map((item) => ({ variantSku: item.variantSku, qty: Number(qtys[item.variantSku] ?? "0") }))
      .filter((r) => Number.isInteger(r.qty) && r.qty > 0);
    if (receipts.length === 0) {
      setError("Enter a quantity (at least 1) for at least one line.");
      return;
    }
    for (const r of receipts) {
      const item = purchase.items.find((i) => i.variantSku === r.variantSku)!;
      if (r.qty > item.qtyOrdered - item.qtyReceived) {
        setError(`${r.variantSku}: receiving ${r.qty} exceeds the outstanding ${item.qtyOrdered - item.qtyReceived}.`);
        return;
      }
    }
    const payload: PurchaseReceivePayload = {
      receiptId,
      receipts,
      note: note.trim() || undefined,
    };
    setSaving(true);
    try {
      await apiPost<PurchaseDoc>(`/admin/purchases/${purchase.id}/receive`, payload);
      onReceived();
      onClose();
    } catch (err) {
      // The same receiptId is kept so retrying after a recoverable failure stays idempotent.
      setError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
      setSaving(false);
    }
  }

  if (!open || !purchase) return null;

  const unit = purchase.items[0]?.unit ?? "unit";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-xs sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Receive goods for ${purchase.reference}`}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container-lowest text-left shadow-2xl sm:max-w-2xl sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/40 bg-surface-container-low px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
              <IconReceive className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold leading-snug text-primary">Receive Consignment Stock</h2>
              <p className="text-xs text-on-surface-variant">
                {purchase.reference}
                {supplierName ? ` • ${supplierName}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={saving}
            className="rounded-full p-2 text-on-surface-variant/60 transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-40"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {/* Critical inventory notice */}
        <div className="flex items-start gap-2.5 border-b border-outline-variant/30 bg-surface-container px-5 py-2.5 sm:px-6">
          <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 11v5M12 7.6h.01" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <p className="text-[13px] leading-snug text-on-surface">
            <strong className="font-semibold">Physical stock intake:</strong> only quantities confirmed below are credited to inventory. Unreceived balances stay
            pending on the ledger.
          </p>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          {lines.map((item, idx) => {
            const outstanding = Math.max(0, item.qtyOrdered - item.qtyReceived);
            const value = Number(qtys[item.variantSku] ?? "0") || 0;
            const lineUnit = item.unit ?? unit;
            return (
              <fieldset key={item.variantSku} className="rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-3.5">
                <legend className="px-1.5 label-tracked text-on-surface-variant">Line {idx + 1}</legend>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-on-surface" title={item.description || item.productName || item.variantSku}>
                      {item.description || item.productName || item.variantSku}
                    </p>
                    <p className="font-mono text-[11px] text-on-surface-variant">
                      {item.variantSku}
                      {item.variantPackLabel ? ` • ${item.variantPackLabel}` : ""}
                      {lineUnit !== "unit" ? ` • per ${lineUnit}` : ""}
                    </p>
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${
                      outstanding === 0 ? "bg-secondary-container text-on-secondary-container" : "bg-tertiary-fixed text-on-tertiary-fixed"
                    }`}
                  >
                    {outstanding === 0 ? "Fully inwarded" : `${outstanding.toLocaleString("en-IN")} ${lineUnit} outstanding`}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-surface-container-lowest px-2 py-2">
                    <span className="label-eyebrow block text-outline">Ordered</span>
                    <span className="font-mono text-sm font-bold text-on-surface">{item.qtyOrdered.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="rounded-lg bg-surface-container-lowest px-2 py-2">
                    <span className="label-eyebrow block text-secondary">Inwarded</span>
                    <span className="font-mono text-sm font-bold text-secondary">{item.qtyReceived.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="rounded-lg bg-surface-container-high px-2 py-2">
                    <span className="label-eyebrow block text-primary">This delivery</span>
                    <span className="font-mono text-sm font-bold text-primary">{value.toLocaleString("en-IN")}</span>
                  </div>
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <Field label={`Quantity received (${lineUnit})`} className="flex-1" htmlFor={`rcv-${item.variantSku}`}>
                    <div className="flex items-stretch overflow-hidden rounded-lg border border-outline-variant/50 bg-surface-container-lowest shadow-sm">
                      <button
                        type="button"
                        aria-label={`Decrease quantity for ${item.variantSku}`}
                        disabled={outstanding === 0 || saving || value <= 0}
                        onClick={() => adjust(item.variantSku, -1, outstanding)}
                        className="px-3.5 text-lg font-bold text-primary transition-colors hover:bg-surface-container disabled:opacity-30"
                      >
                        −
                      </button>
                      <input
                        id={`rcv-${item.variantSku}`}
                        type="number"
                        min={0}
                        max={outstanding}
                        step={1}
                        value={qtys[item.variantSku] ?? "0"}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^\d]/g, "");
                          const n = raw === "" ? 0 : Math.min(outstanding, Number(raw));
                          setQtys((q) => ({ ...q, [item.variantSku]: String(n) }));
                        }}
                        disabled={outstanding === 0 || saving}
                        className="w-full bg-transparent py-2 text-center font-mono text-base font-bold text-on-surface focus:outline-none disabled:text-on-surface-variant/40"
                        aria-label={`Quantity received for ${item.variantSku}`}
                      />
                      <button
                        type="button"
                        aria-label={`Increase quantity for ${item.variantSku}`}
                        disabled={outstanding === 0 || saving || value >= outstanding}
                        onClick={() => adjust(item.variantSku, 1, outstanding)}
                        className="px-3.5 text-lg font-bold text-primary transition-colors hover:bg-surface-container disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </Field>
                  <div className="flex gap-1.5 pb-0.5">
                    {[Math.floor(outstanding / 2) || 0, outstanding].map((v, i) =>
                      v > 0 && v !== value ? (
                        <button
                          key={i}
                          type="button"
                          disabled={saving}
                          onClick={() => setQtys((q) => ({ ...q, [item.variantSku]: String(v) }))}
                          className="rounded-lg bg-surface-container px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-surface-container-high disabled:opacity-40"
                        >
                          {i === 0 ? "Half" : "All"} ({v.toLocaleString("en-IN")})
                        </button>
                      ) : null,
                    )}
                  </div>
                </div>
              </fieldset>
            );
          })}

          <Field
            label="Receiving notes & consignment condition"
            hint="Barrels, tamper seals, transport condition, rack/bay placement — stored permanently on the receipt."
          >
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Seals intact at dock 3; moved to cellar rack C-04" />
          </Field>

          {error ? (
            <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
              {error}
            </p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/40 bg-surface-container-low px-5 py-3.5 sm:px-6">
          <p className="text-[11px] text-outline">Receipt id {receiptId.slice(0, 14)}… — replays are safely ignored.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button loading={saving} disabled={plannedTotal <= 0} onClick={submit}>
              <IconReceive className="h-4 w-4" />
              Confirm Goods Receipt{plannedTotal > 0 ? ` (+${plannedTotal.toLocaleString("en-IN")} ${unit})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
