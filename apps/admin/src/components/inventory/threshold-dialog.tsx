"use client";
/**
 * Bulk low-stock-threshold update for the inventory console's bulk bar.
 * Safe by design: it only touches each variant's `lowStockThreshold` — never
 * quantities — and shows exactly which SKUs will change before submitting.
 */
import { useEffect, useState } from "react";
import { ApiError, apiPost } from "@/lib/api";
import type { InventoryLedgerRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";

export function ThresholdDialog({
  open,
  onClose,
  rows,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  rows: InventoryLedgerRow[];
  onSaved: () => void;
}) {
  const [threshold, setThreshold] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setThreshold("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const parsed = Number(threshold);
  const valid = threshold.trim() !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 100_000;

  async function save() {
    if (!valid || submitting || rows.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiPost("/admin/inventory/thresholds", {
        items: rows.map((r) => ({ variantId: r.variantId, lowStockThreshold: parsed })),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
      setSubmitting(false);
    }
  }

  const preview = rows.slice(0, 8);

  return (
    <Dialog
      open={open && rows.length > 0}
      onClose={onClose}
      title="Batch threshold update"
      description="Set the same low-stock threshold for every selected SKU. Quantities are not touched."
    >
      <div className="space-y-4">
        <Field
          label="New low-stock threshold (units)"
          htmlFor="bulk-threshold"
          hint="Variants whose available stock falls at or below this are flagged as low stock."
          required
        >
          <Input
            id="bulk-threshold"
            type="number"
            min={0}
            max={100_000}
            step={1}
            inputMode="numeric"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="10"
            className="max-w-40"
          />
        </Field>

        <div className="rounded-xl bg-surface-container-low p-3">
          <p className="label-eyebrow text-on-surface-variant">
            Will update {rows.length} SKU{rows.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-on-surface-variant">
            {preview.map((r) => (
              <li key={r.variantId} className="flex items-center justify-between gap-3">
                <span className="truncate">{r.sku}</span>
                <span className="shrink-0 text-outline">{r.packLabel}</span>
              </li>
            ))}
            {rows.length > preview.length ? (
              <li className="text-outline">+ {rows.length - preview.length} more…</li>
            ) : null}
          </ul>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-error-container p-3 text-sm text-on-error-container">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={save} loading={submitting} disabled={!valid}>
            Update {rows.length} threshold{rows.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
