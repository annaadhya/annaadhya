"use client";
/**
 * Bulk action dialogs for the catalogue list (design's "Set Status…" / "Adjust Pricing").
 * Operations run sequentially against POST /admin/catalogue/products/:id, reusing the
 * exact upsert payload built from the loaded document, so the API contract is untouched.
 */
import { useEffect, useState } from "react";
import { ApiError, apiPost } from "@/lib/api";
import { paiseToRupeeInput, rupeesToPaise } from "@/lib/format";
import type { ProductStatus, ProductWithVariants } from "@/lib/types";
import { productDocToPayload } from "./product-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export interface BulkOutcome {
  updated: number;
  failed: { sku: string; message: string }[];
}

interface BulkDialogProps {
  open: boolean;
  products: ProductWithVariants[];
  onClose: () => void;
  onDone: (outcome: BulkOutcome) => void;
}

function useResetOnClose(open: boolean, reset: () => void) {
  useEffect(() => {
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/** Sequentially re-POST each selected product with a mutated payload copy. */
async function applyBulk(
  products: ProductWithVariants[],
  mutate: (payload: ReturnType<typeof productDocToPayload>) => ReturnType<typeof productDocToPayload>,
): Promise<BulkOutcome> {
  const failed: BulkOutcome["failed"] = [];
  let updated = 0;
  for (const product of products) {
    try {
      const payload = mutate(productDocToPayload(product));
      await apiPost(`/admin/catalogue/products/${product.id}`, payload);
      updated++;
    } catch (err) {
      failed.push({ sku: product.sku, message: err instanceof ApiError ? err.message : "Unexpected error" });
    }
  }
  return { updated, failed };
}

export function BulkStatusDialog({ open, products, onClose, onDone }: BulkDialogProps) {
  const [status, setStatus] = useState<ProductStatus>("published");
  const [running, setRunning] = useState(false);
  useResetOnClose(open, () => {
    setStatus("published");
    setRunning(false);
  });

  async function run() {
    setRunning(true);
    const outcome = await applyBulk(products, (payload) => ({ ...payload, status }));
    setRunning(false);
    onDone(outcome);
  }

  return (
    <Dialog
      open={open}
      onClose={running ? () => undefined : onClose}
      title="Set status for selected products"
      description={`${products.length} product${products.length === 1 ? "" : "s"} will move together. Published products appear on the storefront; drafts stay hidden.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button size="sm" onClick={run} loading={running}>
            Apply to {products.length}
          </Button>
        </div>
      }
    >
      <fieldset className="space-y-2" disabled={running}>
        {(["published", "draft"] as ProductStatus[]).map((value) => (
          <label
            key={value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
              status === value
                ? "border-primary/40 bg-primary-fixed/40"
                : "border-outline-variant/50 bg-surface-container-low hover:bg-surface-container"
            }`}
          >
            <input
              type="radio"
              name="bulk-status"
              checked={status === value}
              onChange={() => setStatus(value)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block font-semibold text-on-surface">{value === "published" ? "Active (published)" : "Draft"}</span>
              <span className="block text-xs text-on-surface-variant">
                {value === "published"
                  ? "Products become purchasable on the storefront immediately."
                  : "Products stay visible in the console only."}
              </span>
            </span>
          </label>
        ))}
        <p className="text-xs text-on-surface-variant/80">
          To retire products, use Archive — it removes them and their variants from the storefront.
        </p>
      </fieldset>
    </Dialog>
  );
}

export function BulkPricingDialog({ open, products, onClose, onDone }: BulkDialogProps) {
  const [mode, setMode] = useState<"percent" | "flat">("percent");
  const [value, setValue] = useState("");
  const [running, setRunning] = useState(false);
  useResetOnClose(open, () => {
    setMode("percent");
    setValue("");
    setRunning(false);
  });

  const numeric = Number(value.replace(/,/g, "").trim());
  const valid = mode === "percent" ? Number.isFinite(numeric) && numeric >= -95 && numeric <= 500 : Number.isFinite(numeric) && numeric !== 0;

  async function run() {
    if (!valid) return;
    setRunning(true);
    const flatPaise = mode === "flat" ? rupeesToPaise(value) : 0;
    const outcome = await applyBulk(products, (payload) => ({
      ...payload,
      variants: payload.variants.map((variant) => {
        const next =
          mode === "percent"
            ? Math.round(variant.pricePaise * (1 + numeric / 100))
            : variant.pricePaise + (flatPaise ?? 0);
        return { ...variant, pricePaise: Math.max(1, next) };
      }),
    }));
    setRunning(false);
    onDone(outcome);
  }

  const example =
    mode === "percent"
      ? "10 = +10% · -5 = -5%"
      : `e.g. ${products[0]?.variants[0] ? paiseToRupeeInput(products[0].variants[0].pricePaise) : "499.00"} is today's price`;

  return (
    <Dialog
      open={open}
      onClose={running ? () => undefined : onClose}
      title="Adjust pricing for selected products"
      description={`Every variant of the ${products.length} selected product${products.length === 1 ? "" : "s"} gets the same adjustment. Prices stay in integer paise on the wire.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button size="sm" onClick={run} loading={running} disabled={!valid}>
            Apply to {products.length}
          </Button>
        </div>
      }
    >
      <fieldset className="space-y-3" disabled={running}>
        <div className="flex gap-2">
          {(
            [
              ["percent", "Percentage"],
              ["flat", "Flat ₹ amount"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                mode === key
                  ? "bg-primary text-on-primary shadow-md"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="label-tracked block pb-1 text-on-surface-variant">
            {mode === "percent" ? "Change (%)" : "Change (₹, use − to reduce)"}
          </span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            placeholder={mode === "percent" ? "10" : "50"}
            className="w-full rounded-lg bg-surface-container-low px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="mt-1 block text-xs text-on-surface-variant/80">{example}</span>
        </label>
        <p className="text-xs text-on-surface-variant/80">
          Variant prices are clamped to at least ₹0.01; MRP is left untouched so discount badges stay truthful.
        </p>
      </fieldset>
    </Dialog>
  );
}
