"use client";
/**
 * Adjust stock slide-over for the inventory console (heritage design language).
 * - Modes: add (+qty) / remove (−qty) / set exact (qty becomes the new stock-on-hand total).
 * - Opened from a table row (variant preselected) or from the header button (picker shown).
 * - The projected-result bar is client feedback only — the server revalidates against the
 *   latest authoritative state inside a transaction before anything persists.
 * - Reason presets map 1:1 to ledger movement types so the audit trail stays honest.
 * - Form values survive a recoverable error; success closes the drawer and refreshes data.
 */
import { useEffect, useState } from "react";
import { ApiError, apiPost } from "@/lib/api";
import type { InventoryLedgerRow, InventoryMovementDoc, StockAdjustmentMode, StockAdjustmentType } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { IconCalculate, IconCheck, IconClose } from "./icons";

const MODES: { value: StockAdjustmentMode; label: string }[] = [
  { value: "add", label: "+ Add stock" },
  { value: "remove", label: "− Remove / spoilage" },
  { value: "set", label: "= Set exact count" },
];

/** Reason presets per mode — each carries the ledger movement type it records. */
const REASON_PRESETS: Record<StockAdjustmentMode, { label: string; type: StockAdjustmentType }[]> = {
  add: [
    { label: "New consignment receipt", type: "received" },
    { label: "Customer return to stock", type: "returned" },
    { label: "Physical count correction", type: "manual_adjustment" },
    { label: "Other correction", type: "other" },
  ],
  remove: [
    { label: "Damaged / spoilage write-off", type: "damaged" },
    { label: "Physical count correction", type: "manual_adjustment" },
    { label: "Showroom / promotion use", type: "other" },
    { label: "Other correction", type: "other" },
  ],
  set: [
    { label: "Physical count correction", type: "manual_adjustment" },
    { label: "Other correction", type: "other" },
  ],
};

export interface AdjustStockDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Preselected variant (row action). When null, the drawer shows a variant picker. */
  row: InventoryLedgerRow | null;
  /** Rows offered by the picker when no variant is preselected (current page). */
  pickerRows: InventoryLedgerRow[];
  onSaved: (movement: InventoryMovementDoc) => void;
}

export function AdjustStockDrawer({ open, onClose, row, pickerRows, onSaved }: AdjustStockDrawerProps) {
  const [pickedId, setPickedId] = useState("");
  const [mode, setMode] = useState<StockAdjustmentMode>("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(REASON_PRESETS.add[0].label);
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effective: InventoryLedgerRow | null = row ?? pickerRows.find((r) => r.variantId === pickedId) ?? null;

  // Fresh form whenever the drawer opens for a (different) variant.
  useEffect(() => {
    if (open) {
      setPickedId("");
      setMode("add");
      setQty("");
      setNote("");
      setReference("");
      setError(null);
      setSubmitting(false);
    }
  }, [open, row?.variantId]);

  // Escape closes (unless a save is in flight); body scroll locked while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, submitting, onClose]);

  function switchMode(next: StockAdjustmentMode) {
    setMode(next);
    const presets = REASON_PRESETS[next];
    if (!presets.some((p) => p.label === reason)) setReason(presets[0].label);
  }

  if (!open) return null;

  const parsedQty = Number(qty);
  const qtyValid =
    qty.trim() !== "" &&
    Number.isInteger(parsedQty) &&
    parsedQty >= 0 &&
    parsedQty <= 1_000_000 &&
    (mode === "set" || parsedQty >= 1);

  const current = effective?.stockOnHand ?? 0;
  const reserved = effective?.reservedQty ?? 0;
  const projected = effective && qtyValid
    ? mode === "add"
      ? current + parsedQty
      : mode === "remove"
        ? current - parsedQty
        : parsedQty
    : null;
  const sameCount = mode === "set" && projected === current;
  const projectedValid = projected !== null && projected >= 0 && projected - reserved >= 0 && !sameCount;
  const projectedDelta = projected !== null ? projected - current : null;

  async function save() {
    if (!effective || !qtyValid || !projectedValid || submitting) return;
    setSubmitting(true);
    setError(null);
    const preset = REASON_PRESETS[mode].find((p) => p.label === reason) ?? REASON_PRESETS[mode][0];
    try {
      const movement = await apiPost<InventoryMovementDoc>("/admin/inventory/adjustments", {
        variantId: effective.variantId,
        mode,
        qty: parsedQty,
        type: preset.type,
        reason: preset.label,
        note: note.trim() || undefined,
        reference: reference.trim() || undefined,
      });
      onSaved(movement);
      onClose();
    } catch (err) {
      // Recoverable: keep every form value so the user can retry or correct.
      setError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        aria-hidden
        onClick={() => !submitting && onClose()}
        className="backdrop-in fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-xs"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={effective ? `Adjust stock for ${effective.sku}` : "Adjust stock"}
        className="drawer-in fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-surface-container-lowest shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/40 bg-surface-container-low px-5 py-4 sm:px-6">
          <div>
            <span className="inline-block rounded-full bg-primary px-2.5 py-0.5 label-eyebrow text-on-primary">
              Inventory adjustment
            </span>
            <h2 className="mt-1.5 font-display text-lg font-semibold text-primary">Adjust stock</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              Log inbound lots, write off damages, or correct the physical count. Every change lands in the ledger.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Close panel"
            className="rounded-full p-2 text-on-surface-variant/60 transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          {/* Target variant: focus card (row action) or picker (header action) */}
          {row ? (
            <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3 shadow-sm">
              <VariantThumb row={row} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-on-surface" title={row.productName}>
                  {row.productName}
                </p>
                <p className="mt-0.5 font-mono text-xs text-outline">
                  {row.sku} · {row.packLabel}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-on-surface-variant">
                    On hand: <strong className="font-bold text-on-surface">{formatNumber(row.stockOnHand)}</strong>
                  </span>
                  <span className="text-outline">
                    Reserved: <strong className="font-semibold">{formatNumber(row.reservedQty)}</strong>
                  </span>
                  <span className="text-secondary">
                    Available: <strong className="font-bold">{formatNumber(row.available)}</strong>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <Field label="Variant" htmlFor="adjust-variant" required hint="Pick the SKU whose stock you are adjusting.">
              <Select
                id="adjust-variant"
                value={pickedId}
                onChange={(e) => {
                  setPickedId(e.target.value);
                  setError(null);
                }}
              >
                <option value="">Select a variant…</option>
                {pickerRows.map((r) => (
                  <option key={r.variantId} value={r.variantId}>
                    {r.sku} — {r.productName} ({r.packLabel})
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {/* Mode selector */}
          <div className="flex flex-col gap-1.5">
            <span className="label-eyebrow text-outline">Adjustment mode</span>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-container-low p-1" role="group" aria-label="Adjustment mode">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => switchMode(m.value)}
                  aria-pressed={mode === m.value}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                    mode === m.value
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container-lowest hover:text-on-surface"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity + live projection */}
          <div className="space-y-2">
            <Field
              label={mode === "set" ? "New total on hand (units)" : "Units to adjust"}
              htmlFor="adjust-qty"
              hint={
                mode === "set"
                  ? "The submitted value is the NEW stock-on-hand total, not the difference."
                  : mode === "add"
                    ? "Whole units to receive into stock."
                    : "Whole units to write off — removals can never strand reserved stock."
              }
            >
              <div className="relative">
                <Input
                  id="adjust-qty"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder={mode === "set" && effective ? String(current) : "10"}
                  className="h-12 pr-14 text-lg font-semibold"
                  disabled={!effective}
                  aria-invalid={qty.trim() !== "" && !qtyValid}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 label-eyebrow text-outline">
                  Units
                </span>
              </div>
            </Field>

            {effective && projected !== null && qtyValid ? (
              sameCount ? (
                <div className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2.5 text-xs text-on-surface-variant">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <IconCalculate className="h-4 w-4" />
                    Already at {formatNumber(current)} units
                  </span>
                  <span>Nothing to adjust</span>
                </div>
              ) : projectedValid ? (
                <div className="flex items-center justify-between rounded-lg bg-secondary-container/60 px-3 py-2.5 text-xs text-on-secondary-container">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <IconCalculate className="h-4 w-4" />
                    Projected result
                  </span>
                  <span>
                    {formatNumber(current)} → <strong className="text-sm font-bold">{formatNumber(projected)}</strong> on
                    hand ({formatNumber(Math.max(0, projected - reserved))} available for orders
                    {projectedDelta !== null && projectedDelta !== 0
                      ? `, ${projectedDelta > 0 ? "+" : ""}${formatNumber(projectedDelta)} delta`
                      : ""}
                    )
                  </span>
                </div>
              ) : (
                <div
                  role="alert"
                  className="flex items-center justify-between rounded-lg bg-error-container px-3 py-2.5 text-xs text-on-error-container"
                >
                  <span className="font-semibold">Not possible with current reservations</span>
                  <span>
                    {projected < 0
                      ? `Only ${formatNumber(current)} on hand`
                      : `${formatNumber(reserved)} unit(s) are reserved for paid orders`}
                  </span>
                </div>
              )
            ) : null}
          </div>

          {/* Reason (mandatory) */}
          <Field label="Reason" htmlFor="adjust-reason" required hint="Recorded on the ledger entry for every adjustment.">
            <Select id="adjust-reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={!effective}>
              {REASON_PRESETS[mode].map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>

          {/* Batch reference */}
          <Field
            label="Batch / consignment reference"
            htmlFor="adjust-ref"
            hint="Optional — e.g. a purchase order or supplier lot."
          >
            <Input
              id="adjust-ref"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={128}
              placeholder="PO-2026-014"
              className="font-mono text-sm"
              disabled={!effective}
            />
          </Field>

          {/* Staff note */}
          <Field label="Staff inspection notes" htmlFor="adjust-note" hint="Optional internal notes for the audit trail.">
            <Textarea
              id="adjust-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Notes for the audit trail…"
              disabled={!effective}
            />
          </Field>

          {error ? (
            <p role="alert" className="rounded-lg bg-error-container p-3 text-sm text-on-error-container">
              {error}
            </p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-outline-variant/40 bg-surface-container-low px-5 py-4 shadow-[0_-4px_16px_rgba(39,24,16,0.05)] sm:px-6">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={save} loading={submitting} disabled={!effective || !qtyValid || !projectedValid} className="flex-1">
            {!submitting ? <IconCheck className="h-4 w-4" /> : null}
            Save stock adjustment
          </Button>
        </div>
      </aside>
    </>
  );
}

/** Product thumbnail with a graceful fallback monogram when no image exists. */
export function VariantThumb({ row, size = "md" }: { row: InventoryLedgerRow; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "h-16 w-16 rounded-xl" : "h-11 w-11 rounded-lg";
  if (row.productImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote thumbs, plain img keeps the admin bundle lean
      <img src={row.productImage} alt="" className={`${cls} shrink-0 object-cover shadow-sm`} />
    );
  }
  return (
    <span
      aria-hidden
      className={`${cls} flex shrink-0 items-center justify-center bg-surface-container font-display text-base font-semibold text-primary shadow-sm`}
    >
      {row.productName.charAt(0).toUpperCase()}
    </span>
  );
}
